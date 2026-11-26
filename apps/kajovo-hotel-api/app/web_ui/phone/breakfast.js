import {text} from './locale.js';
import {action,card,dateBar,element,facts,inputField,options,sheet,today} from './controls.js';
import {commit} from './transport.js';

const path='api/v1/breakfast';
const statusName={pending:'Čeká',preparing:'Připravuje se',served:'Vydáno',cancelled:'Stornováno'};
const diets=[['diet_no_gluten','Bez lepku'],['diet_no_milk','Bez mléka'],['diet_no_pork','Bez vepřového']];
const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const displayDate=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'medium',timeStyle:'short'});
const rooms=new Intl.Collator('cs',{numeric:true});
const listPath=day=>path+'?service_date='+day;
const manager=context=>context.has('breakfast:write')&&(context.identity.cml_modules||['recepce','admin'].includes(context.identity.active_role));

function orderFacts(row) {
  return facts([
    ['Den',row.service_date],['Hosté',row.guest_names||row.guest_name],['Země',row.country_code],
    ['Počet porcí',row.guest_count],['Stav',statusName[row.status]??row.status],
    ['Diety',diets.filter(([name])=>row[name]).map(([,label])=>label).join(' · ')||'Bez evidované diety'],
    ['Poznámka',row.note],
  ]);
}

export async function breakfast(context,mode,id) {
  const mayManage=manager(context);
  const day=context.days.breakfast;
  const back=action('Zpět na snídaně',()=>context.go('breakfast'));
  if (mode==='new' || mode==='edit') {
    if (!mayManage) return [card(null,element('p',{},'Plánování snídaní vyžaduje oprávnění k zápisu.'),back)];
    const row=mode==='edit'&&id?await context.read(path+'/'+id):null;
    if (mode==='edit'&&!row) return [card(null,element('p',{},'Vyber konkrétní objednávku.'),back)];
    return [orderEditor(context,day,row,back)];
  }
  if (mode==='detail') {
    if (!id) return [card(null,element('p',{},'Vyber objednávku ze seznamu.'),back)];
    const row=await context.read(path+'/'+id);
    const controls=element('div',{class:'actions'},back);
    if (mayManage) controls.append(action('Upravit objednávku',()=>context.go('breakfast-edit',row.id)),
      action('Smazat objednávku',()=>confirmDelete(context,path+'/'+row.id,'Smazat objednávku',
        'Smaže se objednávka pokoje '+row.room_number+' ze dne '+row.service_date+'.',
        async()=>{
          try {await context.read(path+'/'+row.id);} catch(error) {if(error.status===404)return;throw error;}
          throw Error('Objednávka je stále v evidenci.');
        },()=>context.go('breakfast'))));
    return [card('Pokoj '+row.room_number,orderFacts(row),controls),dietEditor(context,row,mayManage)];
  }
  return list(context,day,mayManage);
}

async function list(context,day,mayManage) {
  const route=path+'/daily-overview?service_date='+day;
  let snapshot=await context.read(route);
  const entries=element('div');
  const counters=element('div');
  const report=element('p',{role:'status'});
  const feedback=element('p',{role:'status'});
  const taskButtons=element('div',{class:'actions'});
  const change=context.guard(async next=>{
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)||next<'0001-01-01') throw Error('Vyber platné datum.');
    context.days.breakfast=next;
    await context.reload();
  });
  const header=card('Denní přehled',dateBar(day,change),element('div',{class:'actions'},action('Dnes',()=>change(today())),
    context.identity.breakfast_lighting && context.has('breakfast:write')?lighting(context):null),taskButtons,report,feedback);
  if (mayManage) taskButtons.append(action('Nový snídaňový záznam',()=>context.go('breakfast-new'),true),
    action('Správa dne a období',()=>management(context,day)),
    action('Připravit PDF',context.guard(async()=>{
      const bytes=await context.read(path+'/export/daily?service_date='+day,{media:'application/pdf'});
      if (!bytes.size || await bytes.slice(0,5).text()!=='%PDF-') throw Error('Služba neposkytla platný PDF soubor.');
      const link=element('a',{href:context.blob(bytes),download:'snidane-'+day+'.pdf'},'Stáhnout PDF');
      report.replaceChildren(link);
      link.focus();
    })));
  taskButtons.append(action('Obnovit',()=>refresh()));

  function populate() {
    const {orders,summary}=snapshot;
    const rows=orders.filter(row=>context.identity.cml_modules||context.identity.active_role!=='snídaně'||row.guest_count>0);
    rows.sort((left,right)=>rooms.compare(left.room_number,right.room_number));
    entries.replaceChildren(...rows.map(row=>orderTile(context,day,row,mayManage)));
    if (!rows.length) entries.append(card(null,element('p',{},'Pro tento den nejsou zobrazené snídaňové objednávky.')));
    const servings=values=>values.reduce((count,row)=>count+row.guest_count,0);
    const savedAt=summary.source_imported_at;
    counters.replaceChildren(card('Výdej pro zvolený den',facts([
      ['Porcí celkem',summary.total_guests],['Vydáno',servings(orders.filter(row=>row.status==='served'))],
      ['Zbývá vydat',servings(orders.filter(row=>['pending','preparing'].includes(row.status)))],
      ['Zdrojová synchronizace',savedAt?displayDate.format(new Date(savedAt)):'Neuvedena'],
    ])));
  }
  populate();

  let inFlight=false;
  async function refresh() {
    if (document.hidden || inFlight || entries.querySelector('[data-pending]') || document.querySelector('dialog[open]') || context.signal.aborted) return;
    inFlight=true;
    try {
      const latest=await context.read(route);
      if (!context.signal.aborted && JSON.stringify(latest)!==JSON.stringify(snapshot)) {
        snapshot=latest;
        populate();
      }
      feedback.textContent='';
    } catch(error) {
      if (!context.signal.aborted) feedback.textContent='Obnova se nezdařila. Stále se zobrazují poslední načtené údaje.';
    } finally {inFlight=false;}
  }
  window.addEventListener('focus',refresh,{signal:context.signal});
  window.addEventListener('pageshow',refresh,{signal:context.signal});
  document.addEventListener('visibilitychange',refresh,{signal:context.signal});
  const timer=setInterval(refresh,60000);
  context.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
  return [header,counters,entries];
}

function orderTile(context,day,row,mayManage) {
  const stays=row.reservations??[];
  const companies=[...new Set(stays.map(stay=>stay.company_name?.trim()).filter(Boolean))];
  const count=key=>stays.reduce((total,stay)=>total+(stay[key]??0),0);
  const box=element('div',{class:'actions'},action('Otevřít detail',()=>context.go('breakfast-detail',row.id)));
  const transition=target=>commit(box,{
    read:context.read,path:path+'/'+row.id,method:'PUT',body:{status:target,expected_updated_at:row.updated_at},
    verify:async saved=>{
      const current=await context.read(path+'/'+row.id);
      if (saved.id!==row.id||current.id!==row.id||current.status!==target||saved.status!==target) {
        throw Error('Požadovaný stav výdeje se nepodařilo potvrdit.');
      }
    },
    done:()=>context.reload(),
  });
  if (['pending','preparing'].includes(row.status)) {
    const now=time.format(new Date());
    const serve=action('Vydat',()=>transition('served'),true);
    serve.disabled=!mayManage && !(context.identity.active_role==='snídaně' && day===today() && now>='05:00' && now<='11:00');
    if (serve.disabled) box.append(element('span',{},'Výdej pro pracovní roli probíhá dnes od 5:00 do 11:00.'));
    box.append(serve);
  } else if (row.status==='served'&&mayManage) box.append(action('Vrátit výdej',()=>transition('pending')));
  const detail=card('Pokoj '+row.room_number,orderFacts(row),facts([
    ['Firmy',companies.join(' · ')],['Dospělí',count('breakfast_adults')],['Děti 0–2',count('breakfast_children_0_2')],
    ['Děti 3–17',count('breakfast_children_3_17')],['Věk neuveden',count('breakfast_age_unknown')],
  ]),box);
  if (mayManage) detail.append(dietEditor(context,row,true));
  return detail;
}

function dietEditor(context,order,editable) {
  const accordion=element('details',{},element('summary',{},'Diety jednotlivých pobytů'));
  if (!order.reservations?.length) accordion.append(element('p',{},'Objednávka nemá ověřenou vazbu na pobyt.'));
  for (const stay of order.reservations??[]) {
    const commands=element('div',{class:'actions'});
    for (const [kind,label] of diets) {
      const enabled=!stay[kind];
      const change=action(label,()=>commit(commands,{
        read:context.read,path:path+'/'+order.id+'/reservations/'+encodeURIComponent(stay.reservation_id)+'/diet',
        method:'PATCH',body:{kind,enabled,version:stay.version},
        verify:async result=>{
          const returned=result.reservations.find(item=>item.reservation_id===stay.reservation_id);
          const saved=(await context.read(path+'/'+order.id)).reservations.find(item=>item.reservation_id===stay.reservation_id);
          if (returned?.[kind]!==enabled||saved?.[kind]!==enabled||saved.version<returned.version) {
            throw Error('Dieta tohoto pobytu nebyla potvrzena.');
          }
        },
        done:()=>context.reload(),
      }));
      change.disabled=!editable;
      change.setAttribute('aria-pressed',String(Boolean(stay[kind])));
      commands.append(change);
    }
    accordion.append(card(stay.guest_name??'Pobyt',facts([['Příjezd',stay.arrival],['Odjezd',stay.departure]]),commands));
  }
  return accordion;
}

function orderEditor(context,day,row,back) {
  const specs=[
    ['Den služby','service_date','date',row?.service_date??day,{}],
    ['Pokoj','room_number','text',row?.room_number??'',{maxlength:32}],
    ['Host','guest_name','text',row?.guest_name??'',{maxlength:255}],
    ['Počet porcí','guest_count','number',row?.guest_count??1,{min:1,max:20,step:1}],
  ];
  const form=element('form',{},...specs.map(([title,name,type,value,limits])=>
    inputField(title,element('input',{name,type,value,required:true,...limits}))),
    inputField('Stav',options(Object.entries(statusName),row?.status??'pending',{name:'status'})),
    element('div',{class:'actions'},back,element('button',{type:'submit',class:'primary'},text('Uložit objednávku'))));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    const incoming={...values,room_number:values.room_number.trim(),guest_name:values.guest_name.trim(),guest_count:Number(values.guest_count)};
    if (!incoming.room_number || !incoming.guest_name || !Number.isInteger(incoming.guest_count) || incoming.guest_count<1 || incoming.guest_count>20) {
      form.prepend(element('p',{role:'alert'},'Vyplň pokoj, hosta a celý počet porcí od 1 do 20.'));
      return;
    }
    void commit(form,{
      read:context.read,path:row?path+'/'+row.id:path,method:row?'PUT':'POST',
      body:{...incoming,...(row?{expected_updated_at:row.updated_at}:{})},
      verify:async result=>{
        if (!result?.id) throw Error('Chybí identita objednávky.');
        const saved=await context.read(path+'/'+result.id);
        if (Object.entries(incoming).some(([key,value])=>saved[key]!==value)) throw Error('Uložené údaje nepotvrdily změnu.');
      },
      done:result=>context.go('breakfast-detail',result.id),
    });
  });
  return card(row?'Upravit objednávku':'Nová objednávka',form);
}

function confirmDelete(context,endpoint,title,description,verify,done) {
  const body=element('div',{},element('p',{},description));
  body.append(action('Potvrdit smazání',()=>commit(body,{
    read:context.read,path:endpoint,method:'DELETE',verify,
    done:async()=>{modal.close();await done();},
  }),true));
  const modal=sheet(title,body);
}

function management(context,day) {
  const admin=context.identity.cml_modules||context.identity.active_role==='admin';
  const body=element('div',{},element('p',{},'Zvolený den · '+day));
  const refresh=async()=>{dialog.close();await context.reload();};
  if (admin) body.append(action('Vrátit výdej všech snídaní dne',()=>commit(body,{
    read:context.read,path:path+'/reactivate-all?service_date='+day,
    verify:async()=>{if ((await context.read(listPath(day))).some(row=>row.status==='served')) throw Error('V evidenci zůstaly vydané snídaně.');},
    done:refresh,
  })));
  body.append(action('Smazat snídaně dne',()=>{
    dialog.close();
    confirmDelete(context,path+'/day/delete?service_date='+day,'Smazat snídaně dne','Smažou se objednávky dne '+day+'.',
      async()=>{if ((await context.read(listPath(day))).length) throw Error('Pro tento den stále existují objednávky.');},
      context.reload);
  }));
  if (admin) {
    const form=element('form',{},element('h3',{},'Smazat zvolené období'),
      inputField('První den',element('input',{type:'date',name:'date_from',value:day,required:true})),
      inputField('Poslední den',element('input',{type:'date',name:'date_to',value:day,required:true})),
      element('button',{type:'submit'},'Zkontrolovat období k odstranění'));
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const fields=new FormData(form);
      const from=fields.get('date_from');
      const to=fields.get('date_to');
      if (!from || !to || from>to) {
        form.prepend(element('p',{role:'alert'},'Druhý den musí být stejný nebo pozdější.'));
        return;
      }
      dialog.close();
      confirmDelete(context,path+'/period/delete?'+new URLSearchParams(fields),'Smazat zvolené období',from+' až '+to+' včetně.',
        async()=>{if ((await context.read(path)).some(row=>row.service_date>=from&&row.service_date<=to)) throw Error('V období zůstaly objednávky.');},
        context.reload);
    });
    body.append(form);
  }
  const dialog=sheet('Správa snídaní',body);
}

function lighting(context) {
  const endpoint=path+'/lighting';
  let saved;
  let timer;
  let running=false;
  const status=element('p',{role:'status'});
  const power=action('Světla v prvním patře',()=>change(!saved.active));
  const retry=action('Znovu nastavit světla',()=>change(saved.active));
  retry.hidden=true;
  power.disabled=true;
  const controls=element('div',{},power,retry,status);
  const labels={pending:'Ověřuji nastavení světel…',partial:'Některá světla čekají na ověření.',interrupted:'Nastavení světel bylo přerušeno.'};
  function display(state) {
    if (!state||typeof state.active!=='boolean'||context.signal.aborted) return;
    saved=state;
    power.setAttribute('aria-pressed',String(state.active));
    retry.hidden=!['partial','interrupted'].includes(state.status);
    status.textContent=labels[state.status]??(state.active?'První patro · aktivní':'První patro · běžný režim');
    if (state.status==='pending'||state.active) timer=setTimeout(read,state.status==='pending'?1500:15000);
  }
  function controlsEnabled() {
    power.disabled=!saved||saved.status==='pending'||running;
    retry.disabled=power.disabled;
  }
  async function read() {
    if (context.signal.aborted||running) return;
    clearTimeout(timer);
    running=true;
    try {display(await context.read(endpoint));}
    catch (error) {
      if (context.signal.aborted) return;
      if (error.status===404) controls.hidden=true;
      else {
        status.textContent='Aktuální stav světel se zatím nepodařilo načíst.';
        timer=setTimeout(read,5000);
      }
    } finally {running=false;controlsEnabled();}
  }
  async function change(active) {
    if (running||power.disabled) return;
    running=true;
    clearTimeout(timer);
    controlsEnabled();
    status.textContent='Ověřuji nastavení světel…';
    try {
      display(await context.read(endpoint,{method:'POST',id:crypto.randomUUID(),body:{active,revision:saved.revision}}));
    } catch {
      saved=undefined;
      status.textContent='Načítám uložený stav světel…';
      timer=setTimeout(read,1500);
    } finally {running=false;controlsEnabled();}
  }
  context.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  void read();
  return controls;
}
