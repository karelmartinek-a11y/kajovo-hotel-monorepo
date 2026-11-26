import {text} from './locale.js';
import {action,card,element,facts,inputField,options,sheet,today} from './controls.js';
import {commit} from './transport.js';
import {documents,history} from './stock-documents.js';

import {intMax,missing,movementKinds,numberField,remove,units} from './stock-fields.js';
const mime=['image/jpeg','image/png','image/webp'];
const fmt=new Intl.NumberFormat('cs-CZ');
const qty=(amount,unit)=>fmt.format(amount)+' '+unit;

export async function warehouse(context,view,id) {
  const supplies=view==='inventory-drogerie'||view.startsWith('inventory-drogerie-');
  const root=supplies?'inventory-drogerie':'inventory';
  const warehouseId=supplies?'drogerie':'snidane';
  const endpoint=(suffix='',params={})=>'api/v1/inventory'+suffix+'?'+new URLSearchParams({warehouse:warehouseId,...params});
  const mode=view.slice(root.length).replace(/^-/,'');
  const write=context.has('inventory_'+warehouseId+':write');
  const admin=write&&(context.identity.admin||context.identity.cml_modules);
  const home=()=>context.go(root);
  const branch=(name,item)=>context.go(root+'-'+name,item);
  const depot={...context,endpoint,home,branch,write,admin};
  if (['cards','card-new','card-detail'].includes(mode)) return documents(depot,mode,id);
  if (mode==='movements') return history(depot);
  if (mode==='new' || mode==='edit') {
    if (!write) throw Error('Pro tuto operaci je potřeba oprávnění k zápisu v tomto skladu.');
    if (mode==='edit'&&!id) throw Error('Vyber položku k úpravě.');
    return [itemForm(depot,id?await context.read(endpoint('/'+id)):null)];
  }
  if (mode==='detail') {
    if (!id) throw Error('Vyber položku z katalogu.');
    return itemDetail(depot,await context.read(endpoint('/'+id)));
  }
  return catalog(depot,warehouseId);
}

async function catalog(context,warehouseId) {
  const {endpoint,read,branch,write,admin}=context;
  const data=await read(endpoint());
  const search=element('input',{type:'search',placeholder:'Název položky'});
  const stocked=element('input',{type:'checkbox'});
  const display=element('div');
  function draw() {
    const needle=search.value.trim().toLocaleLowerCase('cs');
    const visible=data.filter(row=>row.name.toLocaleLowerCase('cs').includes(needle)&&(!stocked.checked||row.current_stock<row.min_stock));
    display.replaceChildren(...visible.map(row=>card(row.name,facts([
      ['Aktuální stav',qty(row.current_stock,row.unit)],['V 1 ks',qty(row.amount_per_piece_base,row.unit)],
      ['Minimální zásoba',qty(row.min_stock,row.unit)],['Stav',row.current_stock<row.min_stock?'Pod minimem':'Dostatečná'],
    ]),action('Otevřít položku',()=>branch('detail',row.id)))));
    if (!visible.length) display.append(element('p',{},data.length?'Žádná položka neodpovídá filtru.':'Sklad zatím nemá žádnou položku.'));
  }
  search.addEventListener('input',draw);
  stocked.addEventListener('change',draw);
  draw();
  const buttons=element('div',{class:'actions'},action('Obnovit',context.guard(context.reload)),
    action('Skladové doklady',()=>branch('cards')),action('Historie pohybů',()=>branch('movements')));
  const download=element('p',{role:'status'});
  if (write) buttons.prepend(action('Nová položka',()=>branch('new'),true),action('Nový skladový doklad',()=>branch('card-new')));
  if (admin) buttons.append(action('Připravit inventurní protokol',context.guard(async()=>{
    const file=await read(endpoint('/stocktake/pdf'),{media:'application/pdf'});
    if (await file.slice(0,5).text()!=='%PDF-') throw Error('Služba neposkytla platný inventurní protokol.');
    const link=element('a',{href:context.blob(file),download:'inventura-'+warehouseId+'.pdf'},'Stáhnout inventurní protokol PDF');
    download.replaceChildren(link);
    link.focus();
  })));
  return [card(null,buttons,download,write&&warehouseId==='snidane'?eggOrders(context):null,
    inputField('Hledat položku',search),inputField('Pouze pod minimem',stocked)),display];
}

function itemForm(context,row) {
  const {endpoint,read,branch,home}=context;
  const form=element('form',{},
    inputField('Název',element('input',{name:'name',value:row?.name??'',maxlength:255,required:true})),
    inputField('Jednotka',options(units.map(unit=>[unit,unit]),row?.unit??'ks',{name:'unit'})),
    numberField('Minimální zásoba','min_stock',row?.min_stock??0,0),
    row?facts([['Zásoba podle pohybů',qty(row.current_stock,row.unit)]]):numberField('Počáteční zásoba','current_stock',0,0),
    numberField('Základních jednotek na kus','amount_per_piece_base',row?.amount_per_piece_base??1,1),
    element('div',{class:'actions'},action('Zrušit',home),element('button',{type:'submit',class:'primary'},text('Uložit položku'))));
  const status=element('p',{role:'status'});
  form.prepend(status);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(form));
    data.name=data.name.trim();
    for (const field of ['min_stock','current_stock','amount_per_piece_base']) if (Object.hasOwn(data,field)) data[field]=Number(data[field]);
    if (!data.name||!units.includes(data.unit)||!Number.isSafeInteger(data.min_stock)||!Number.isSafeInteger(data.amount_per_piece_base)||
      Object.hasOwn(data,'current_stock')&&!Number.isSafeInteger(data.current_stock)) {
      status.textContent='Vyplň název, jednotku a celá množství.';
      return;
    }
    void commit(form,{
      read,path:endpoint(row?'/'+row.id:''),method:row?'PUT':'POST',body:data,
      verify:async result=>{
        if (!Number.isInteger(result?.id)) throw Error('Chybí ID uložené položky.');
        const current=await read(endpoint('/'+result.id));
        if (Object.entries(data).some(([name,value])=>current[name]!==value)) throw Error('Uložená položka nepotvrdila všechny údaje.');
      },
      done:result=>branch('detail',result.id),
    });
  });
  return card(row?'Upravit položku':'Nová skladová položka',form);
}

async function itemDetail(context,row) {
  const {endpoint,read,signal,reload,branch,home,write,admin,identity}=context;
  const base='/'+row.id;
  const commands=element('div',{class:'actions'},action('Zpět na sklad',home));
  if (write) commands.append(action('Upravit položku',()=>branch('edit',row.id)),
    ...Object.entries(movementKinds).map(([kind,label])=>action(label,()=>movement(context,row,kind))));
  if (identity.admin||identity.cml_modules&&write) commands.append(action('Odstranit položku',()=>
    remove(context,'Odstranit skladovou položku','Odstraní se položka '+row.name+'.',endpoint(base),
      ()=>missing(read,endpoint(base)),home)));
  const list=(row.movements??[]).map(item=>card(movementKinds[item.movement_type]??item.movement_type,
    facts([['Množství',qty(item.quantity,row.unit)],['Kusy',item.quantity_pieces],['Datum',item.document_date],
      ['Doklad',item.document_number],['Reference',item.document_reference],['Poznámka',item.note]]),
    item.card_id?action('Otevřít doklad',()=>branch('card-detail',item.card_id)):null,
    admin?action('Odstranit pohyb',()=>remove(context,'Odstranit pohyb',
      'Odstranění změní zásobu položky '+row.name+'.',endpoint(base+'/movements/'+item.id),
      async()=>{if ((await read(endpoint(base))).movements.some(value=>value.id===item.id)) throw Error('Pohyb zůstává v historii.');},reload)):null));
  const audit=element('details',{},element('summary',{},'Audit položky'),...(row.audit_logs??[]).map(item=>facts([
    ['Čas',item.created_at],['Akce',item.action],['Podrobnosti',item.detail],
  ])));
  const gallery=await pictogram(context,row);
  if (signal.aborted) return [];
  return [card(row.name,facts([['Na skladě',qty(row.current_stock,row.unit)],['Minimum',qty(row.min_stock,row.unit)],
    ['V 1 ks',qty(row.amount_per_piece_base,row.unit)]]),commands),gallery,
    element('h2',{},'Skladové pohyby'),...list,audit];
}

function movement(context,row,type) {
  const {endpoint,read,reload}=context;
  const host=element('form',{},facts([['Položka',row.name],['Na skladě',qty(row.current_stock,row.unit)]]),
    numberField('Množství v základní jednotce ('+row.unit+')','quantity','',1,type==='in'?intMax:row.current_stock),
    numberField('Počet kusů','quantity_pieces',0,0),
    inputField('Datum dokladu',element('input',{type:'date',name:'document_date',value:today(),required:true})),
    inputField('Reference dokladu',element('input',{name:'document_reference',required:type==='in',maxlength:64})),
    inputField('Poznámka',element('textarea',{name:'note',maxlength:2000})),
    element('button',{type:'submit',class:'primary'},text('Uložit pohyb')));
  const box=sheet(movementKinds[type],host);
  host.addEventListener('submit',event=>{
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(host));
    const body={movement_type:type,quantity:Number(fields.quantity),quantity_pieces:Number(fields.quantity_pieces),
      document_date:fields.document_date,document_reference:fields.document_reference.trim()||null,note:fields.note.trim()||null};
    const start=new Set((row.movements??[]).map(item=>item.id));
    void commit(host,{
      read,path:endpoint('/'+row.id+'/movements'),body,
      verify:async result=>{
        const candidates=result.movements.filter(item=>!start.has(item.id)&&Object.entries(body).every(([key,value])=>item[key]===value));
        if (candidates.length!==1) throw Error('Původní odpověď nepotvrdila jednoznačný skladový pohyb.');
        const current=await read(endpoint('/'+row.id));
        if (!current.movements.some(item=>item.id===candidates[0].id&&item.movement_type===type&&item.quantity===body.quantity)) {
          throw Error('Původní pohyb se nepodařilo dohledat v historii.');
        }
      },
      done:async()=>{box.close();await reload();},
    });
  });
}

async function pictogram(context,row) {
  const {endpoint,read,blob,write,reload}=context;
  const base='/'+row.id+'/pictogram';
  const portal=card('Piktogram');
  const download=element('p',{role:'status'});
  const original=()=>read(endpoint(base+'/original'),{media:'image/*'});
  if (row.pictogram_thumb_path) {
    try {
      const thumbnail=await read(endpoint(base+'/thumb'),{media:'image/*'});
      portal.append(element('img',{src:blob(thumbnail),alt:'Piktogram '+row.name}),
        action('Připravit původní piktogram',context.guard(async()=>{
          const image=await original();
          const format={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.type];
          if (!format) throw Error('Původní piktogram má neznámý formát.');
          download.replaceChildren(element('a',{href:blob(image),download:'piktogram-'+row.id+'.'+format},'Stáhnout originál piktogramu'));
        })),download);
    } catch(error) {portal.append(element('p',{role:'status'},error.message));}
  } else portal.append(element('p',{},'Položka nemá uložený piktogram.'));
  if (!write) return portal;
  const image=element('input',{type:'file',accept:mime.join(','),required:true});
  const feedback=element('p',{role:'status'});
  const form=element('form',{},inputField('Vybrat piktogram',image),
    element('p',{},'JPEG, PNG nebo WebP do 2 MB.'),element('button',{type:'submit'},text('Nahrát piktogram')),feedback);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const file=image.files[0];
    if (!file||!mime.includes(file.type)||file.size<1||file.size>2_000_000) {
      feedback.textContent='Zvol obrázek v povoleném formátu a velikosti.';
      return;
    }
    const payload=new FormData();
    payload.append('file',file);
    const hash=async value=>JSON.stringify([...new Uint8Array(await crypto.subtle.digest('SHA-256',await value.arrayBuffer()))]);
    void commit(form,{
      read,path:endpoint(base),body:payload,
      verify:async result=>{
        const current=await read(endpoint('/'+row.id));
        if (result.id!==row.id||!result.pictogram_path||current.pictogram_path!==result.pictogram_path||
          result.pictogram_path===row.pictogram_path||await hash(await original())!==await hash(file)) {
          throw Error('Uložený piktogram neodpovídá vybranému originálu.');
        }
      },
      done:reload,
    });
  });
  portal.append(form);
  return portal;
}

function eggOrders(context) {
  let pending;
  let busy=true;
  const route='/egg-orders';
  const status=element('p',{role:'status'});
  const order=action('Objednat 180 vajec',()=>send(),true);
  const check=action('Ověřit předchozí objednávku',()=>load());
  const panel=element('section',{},element('h3',{},'Objednávka vajec'),element('div',{class:'actions'},order,check),status);
  order.disabled=true;
  check.hidden=true;

  function reflect(result) {
    if (context.signal.aborted) return;
    pending=['unknown','busy'].includes(result?.state)?result.id:null;
    order.disabled=Boolean(pending);
    check.hidden=!pending;
    status.textContent=result?.state==='sent'?'Odesláno na závoz '+result.delivery_date:
      result?.state==='rejected'?'Služba odeslání objednávky nepotvrdila.':
      pending?'Dokončení původní objednávky ještě není potvrzené.':'';
  }
  async function load() {
    if (context.signal.aborted) return;
    check.disabled=true;
    try {reflect(await context.read(context.endpoint(route+(pending?'/'+pending:'/latest'))));}
    catch (error) {
      status.textContent='Uložený stav objednávky vajec nelze ověřit.';
      check.hidden=false;
      order.disabled=true;
    } finally {busy=false;check.disabled=false;}
  }
  async function send(confirmation = {}) {
    if (busy||pending) return;
    busy=true;
    const id=crypto.randomUUID();
    order.disabled=true;
    status.textContent='Ověřuji odeslání objednávky vajec…';
    pending=id;
    try {
      const result=await context.read(context.endpoint(route),{method:'POST',id,body:{id,...confirmation}});
      if (result.state==='confirm') {
        pending=null;
        status.textContent='';
        let accepted=false;
        const controls=element('div',{},facts([
          ['Poslední odeslání',result.previous_sent_at],['Původní závoz',result.previous_delivery_date],
          ['Další závoz',result.delivery_date],
        ]));
        controls.append(action('Ano, objednat dalších 180 vajec',()=>{
          accepted=true;
          dialog.close();
          void send({confirmed_previous_id:result.previous_id,confirmed_delivery_date:result.delivery_date});
        },true));
        const dialog=sheet('Potvrdit další objednávku',controls);
        dialog.addEventListener('close',()=>{if(!accepted)order.disabled=false;},{once:true});
      } else reflect(result);
    } catch {
      await load();
    } finally {busy=false;}
  }
  void load();
  return panel;
}
