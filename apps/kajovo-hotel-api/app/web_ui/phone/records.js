import {text} from './locale.js';
import {action,card,element,facts,inputField,options,sheet} from './controls.js';
import {commit,receipt} from './transport.js';

const issueStates = [['new','Nová'],['in_progress','Řeší se'],['resolved','Vyřešeno'],['closed','Uzavřeno']];
const foundStates = [['new','Nové'],['stored','Uloženo'],['claimed','Přihlásil se majitel'],['returned','Vráceno'],['disposed','Vyřazeno']];
const types = [['found','Nález'],['lost','Ztráta']];
const tags = [['kontaktova','Kontaktován'],['nezastizen','Nezastižen'],['vyzvedne','Vyzvedne'],['odesleme','Odešleme']];
const priorities = [['medium','Střední'],['low','Nízká'],['high','Vysoká'],['critical','Kritická']];
const mime = ['image/jpeg','image/png','image/webp'];
const timestamp = new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'medium',timeStyle:'short'});
const definitions = {
  issues:{
    title:'Závady',path:'api/v1/issues',permission:'issues',states:issueStates,
    fields:[
      {name:'title',label:'Název závady',min:3,max:255},
      {name:'description',label:'Popis',long:true,max:4000},
      {name:'location',label:'Umístění',min:1,max:255},
      {name:'room_number',label:'Pokoj',max:32},
      {name:'priority',label:'Priorita',choices:priorities},
      {name:'status',label:'Stav',choices:issueStates},
      {name:'assignee',label:'Přiřazeno',max:255},
    ],
  },
  lostfound:{
    title:'Ztráty a nálezy',path:'api/v1/lost-found',permission:'lost_found',states:foundStates,
    fields:[
      {name:'item_type',label:'Nález nebo ztráta',choices:types},
      {name:'description',label:'Popis předmětu',long:true,min:3,max:4000},
      {name:'room_number',label:'Pokoj',max:32},
      {name:'claimant_name',label:'Jméno nálezce nebo žadatele',max:255},
      {name:'claimant_contact',label:'Kontakt',max:255},
      {name:'handover_note',label:'Záznam o předání',long:true,max:2000},
    ],
  },
};

function displayDate(value) {
  const parsed = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value)?value:value+'Z');
  return Number.isFinite(parsed.getTime())?timestamp.format(parsed):value;
}

function label(list,value) {
  return list.find(([code])=>code===value)?.[1] ?? value;
}

function permissions(context,config,task) {
  if (!context.has(config.permission+':write')) return false;
  const {active_role,cml_modules} = context.identity;
  if (cml_modules || active_role==='admin') return true;
  if (task==='delete') return false;
  if (config.permission==='issues') return active_role==='údržba' || active_role==='pokojská' && ['create','photo'].includes(task);
  return active_role!=='recepce' || task!=='edit';
}

function toolbar(context,key) {
  return action('Zpět na seznam',()=>context.go(context.has(definitions[key].permission+':read')?key:context.start));
}

function details(config,row) {
  const result = config.fields.map(({label:title,name,choices})=>[title,choices?label(choices,row[name]):row[name]]);
  if (config.permission==='lost_found') result.push(
    ['Kategorie',row.category],['Místo',row.location],
    ['Datum a čas',row.event_at?displayDate(row.event_at):null],['Stav',label(foundStates,row.status)],
    ['Štítky',(row.tags??[]).map(value=>label(tags,value)).join(', ')],
  );
  return facts(result);
}

export async function records(context,key,mode,id) {
  const config = definitions[key];
  const {path,permission} = config;
  const canRead = context.has(permission+':read');
  const may = task=>permissions(context,config,task);
  if (!mode) {
    const source = await context.read(path);
    const search = element('input',{type:'search',placeholder:'Hledat'});
    const state = options([['','Všechny stavy'],...config.states],'');
    const list = element('div');
    const draw = ()=>{
      const needle = search.value.trim().toLocaleLowerCase('cs');
      const filtered = source.filter(row=>(!state.value || row.status===state.value) &&
        [...config.fields.map(({name,choices})=>choices?label(choices,row[name]):row[name]),
          row.location,label(config.states,row.status)].some(value=>String(value??'').toLocaleLowerCase('cs').includes(needle)));
      list.replaceChildren(...filtered.map(row=>card(row.title??row.description,
        facts([['Umístění',row.location],['Stav',label(config.states,row.status)]]),
        action('Otevřít detail',()=>context.go(key+'-detail',row.id)))));
      if (!filtered.length) list.append(element('p',{},'Žádné záznamy pro vybraný filtr.'));
    };
    search.addEventListener('input',draw);
    state.addEventListener('change',draw);
    draw();
    return [card(null,inputField('Hledat záznam',search),inputField('Stav',state),
      may('create')?action(key==='issues'?'Zapsat závadu':'Zapsat ztrátu nebo nález',()=>context.go(key+'-new'),true):null),list];
  }
  if (mode==='submitted') {
    const submitted = context.submissions.get(key);
    if (!submitted || submitted.role!==context.identity.active_role) {
      return [card(null,element('p',{},'Potvrzení původního zápisu zde již není dostupné.'),toolbar(context,key))];
    }
    const row = await receipt(context.read,submitted.id);
    if (row?.id!==submitted.recordId) throw Error('Původní účtenka obsahuje jiný záznam.');
    return [
      card('Záznam byl přijat',details(config,row),toolbar(context,key)),
      await gallery(context,path+'/'+row.id,true,submitted),
    ];
  }
  const row = id?await context.read(path+'/'+id):null;
  if (mode==='detail') {
    if (!row) throw Error('Vyberte záznam ze seznamu.');
    const commands = element('div',{class:'actions'},toolbar(context,key));
    if (may('edit')) commands.append(action('Upravit',()=>context.go(key+'-edit',row.id),true));
    if (may('delete')) commands.append(action('Odstranit',()=>removeRecord(context,key,config,row)));
    if (key==='lostfound' && may('create') && row.status!=='claimed') {
      const processed = action('Označit jako zpracováno',()=>commit(commands,{
        path:path+'/'+row.id,method:'PUT',body:{status:'claimed'},read:context.read,
        verify:async()=>{if ((await context.read(path+'/'+row.id)).status!=='claimed') throw Error('Uložený stav změnu nepotvrdil.');},
        done:()=>context.reload(),
      }));
      commands.append(processed);
    }
    const history = [['Vytvořeno','created_at'],['Poslední změna','updated_at'],['Zahájeno řešení','in_progress_at'],
      ['Vyřešeno','resolved_at'],['Uzavřeno','closed_at'],['Zpracováno','claimed_at'],['Vráceno','returned_at']]
      .filter(([,field])=>row[field]).map(([title,field])=>[title,displayDate(row[field])]);
    const notification = row.whatsapp_notification;
    const statusText = {accepted:'WhatsApp oznámení převzal. Doručení příjemci čeká na potvrzení.',
      attention:'Odeslání vyžaduje kontrolu.'};
    return [card(row.title??config.title,details(config,row),notification?element('p',{},
      `WhatsApp · převzato ${notification.accepted_parts} z ${notification.total_parts} částí. `+
      (statusText[notification.state]??'Oznámení čeká na odeslání.')):null,commands),
      await gallery(context,path+'/'+row.id,may('photo')),card('Historie',facts(history))];
  }
  if (!may(mode==='edit'?'edit':'create')) throw Error('Tato změna vyžaduje oprávnění k zápisu.');
  if (mode==='edit'&&!row) throw Error('Vyberte záznam k úpravě.');
  const controls = config.fields.map(field=>{
    const {name,label:title,choices,long,min,max} = field;
    const props = {name,required:Boolean(min),minlength:min,maxlength:max};
    const control = choices?options(choices,row?.[name],{name}):element(long?'textarea':'input',props);
    if (!choices) control.value = row?.[name] ?? '';
    return inputField(title,control);
  });
  const form = element('form',{},...controls);
  if (key==='lostfound') form.append(element('fieldset',{},element('legend',{},'Štítky'),
    ...tags.map(([value,title])=>element('label',{},element('input',{
      type:'checkbox',name:'tags',value,checked:row?.tags?.includes(value),
    }),title))));
  form.append(element('div',{class:'actions'},toolbar(context,key),element('button',{type:'submit',class:'primary'},text('Uložit záznam'))));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const fields = new FormData(form);
    const data = Object.fromEntries(config.fields.map(({name})=>[name,String(fields.get(name)??'').trim()||null]));
    if (key==='lostfound') data.tags=fields.getAll('tags');
    const actionPath = row?path+'/'+row.id:path;
    void commit(form,{
      path:actionPath,method:row?'PUT':'POST',body:data,read:context.read,
      verify:async(result,operation)=>{
        if (!Number.isInteger(result?.id)) throw Error('Potvrzení neobsahuje ID záznamu.');
        const saved = canRead?await context.read(path+'/'+result.id):await receipt(context.read,operation);
        if (saved.id!==result.id) throw Error('Služba potvrdila jiný záznam.');
        const mismatch=Object.keys(data).find(name=>JSON.stringify(saved[name]??null)!==JSON.stringify(data[name]));
        if (mismatch) throw Error('Z uloženého záznamu se nepodařilo potvrdit pole '+mismatch+'.');
      },
      done:(result,operation)=>{
        if (!canRead) context.submissions.set(key,{id:operation,recordId:result.id,role:context.identity.active_role,photos:[]});
        return context.go(key+(canRead?'-detail':'-submitted'),canRead?result.id:null);
      },
    });
  });
  return [card(null,form)];
}

function removeRecord(context,key,config,row) {
  const path = config.path+'/'+row.id;
  const confirmation = element('div',{},element('p',{},'Odstranění tohoto záznamu vyžaduje potvrzení.'));
  confirmation.append(action('Odstranit záznam',()=>commit(confirmation,{
    path,method:'DELETE',read:context.read,
    verify:async()=>{
      try {await context.read(path);} catch(error) {if(error.status===404) return;throw error;}
      throw Error('Záznam je v evidenci stále přítomný.');
    },
    done:async()=>{dialog.close();await context.go(key);},
  }),true));
  const dialog = sheet('Odstranit záznam',confirmation);
}

async function gallery(context,path,canAttach,submitted = null) {
  const endpoint = path+'/photos';
  const photos = submitted?submitted.photos:await context.read(endpoint);
  const container = card('Fotodokumentace');
  const labels = new Intl.NumberFormat('cs-CZ');
  if (!photos.length) container.append(element('p',{},'K záznamu zatím nejsou připojené fotografie.'));
  if (submitted) container.append(element('p',{},'Potvrzených fotografií · '+photos.length));
  for (const [index,photo] of (submitted?[]:photos).entries()) {
    const title = 'Fotografie '+(index+1);
    const source = endpoint+'/'+photo.id;
    const figure = element('figure',{},element('figcaption',{},title+' · '+labels.format(photo.size_bytes)+' B'));
    const hint = element('p',{role:'status'});
    const load = async (kind)=>context.read(source+'/'+kind,{media:'image/*'});
    const thumb = element('img',{alt:title,loading:'lazy'});
    figure.prepend(thumb);
    try {thumb.src=context.blob(await load('thumb'));}
    catch {thumb.hidden=true;hint.textContent='Náhled fotografie není dostupný.';}
    figure.append(element('div',{class:'actions'},
      action('Zvětšit',context.guard(async()=>{
        const objectURL=context.blob(await load('original'));
        sheet(title,element('img',{alt:title,src:objectURL}));
      })),
      action('Připravit originál ke stažení',context.guard(async()=>{
        const image=await load('original');
        const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[image.type];
        if (!ext) throw Error('Služba neposkytla očekávaný formát fotografie.');
        hint.replaceChildren(element('a',{href:context.blob(image),download:'foto-'+photo.id+'.'+ext},'Stáhnout originál'));
      }))),hint);
    container.append(figure);
  }
  if (!canAttach) return container;
  const upload = element('input',{type:'file',multiple:true,required:true,accept:mime.join(',')});
  const feedback = element('p',{role:'status'});
  const form = element('form',{},inputField('Připojit fotografie',upload),
    element('p',{},'Vyber 1–3 fotografie. JPEG, PNG nebo WebP, každá do 2 MB.'),
    element('button',{type:'submit'},'Nahrát fotografie'),feedback);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const files = [...upload.files];
    if (!files.length || files.length>3 || files.some(file=>!mime.includes(file.type)||file.size<1||file.size>2_000_000)) {
      feedback.textContent='Vyber 1–3 fotografie v povoleném formátu a velikosti.';
      return;
    }
    const body=new FormData();
    files.forEach(file=>body.append('photos',file));
    const previous=new Set(photos.map(photo=>photo.id));
    void commit(form,{
      path:endpoint,body,read:context.read,
      verify:async(result,id)=>{
        const added=result.filter(photo=>!previous.has(photo.id));
        const current=submitted?await receipt(context.read,id):await context.read(endpoint);
        const verified = added.length===files.length && added.every((photo,index)=>current.some(item=>
          item.id===photo.id && item.size_bytes===files[index].size && item.mime_type===files[index].type));
        if (!verified) throw Error('Uložené fotografie zatím nelze potvrdit.');
      },
      done:result=>{
        if (submitted) submitted.photos=result;
        return context.reload();
      },
    });
  });
  container.append(form);
  return container;
}
