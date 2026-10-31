import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {api,view,setRole,download} from './api.js';
import {saveMutation} from './operations.js';
import {inventoryExtras} from './inventory.js';
import {pragueInput,pragueInstant} from './time.js';
import {overview,reception} from './summary.js';
import {hotelSettings} from './settings.js';
import {moduleReference} from './references.js';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
const state={date:today(),identity:null,view:new URLSearchParams(location.search).get('view')??'rooms',generation:0,roomFilter:'',floor:'',uncertainRooms:new Set()};
const statuses={clean:['Uklizeno pro nájezd','check'],dirty:['Neuklizeno','close'],stay_no_linen:['Pobyt bez ložního prádla','bed'],stay_with_linen:['Uklizeno s ložním prádlem','linen'],do_not_disturb:['Nerušit','do-not-disturb'],technical_issue:['Technický problém','issue'],windows_cleaned:['Umytá okna','window'],painted:['Vymalováno','paint']};
const label=(admin,member)=>state.identity.admin?admin:member;
function heading(id,title,desc){const main=view(id,title,desc);main.append(el('div',{id:'status','aria-live':'polite'}));if(state.identity.roles.length>1){const roles=select('Pracovní role','role',state.identity.roles.map(r=>[r,r]),state.identity.active_role);roles.querySelector('select').addEventListener('change',async e=>{setRole(e.target.value);state.identity=await api('identity');if(!new URLSearchParams(location.search).has('view'))state.view=state.identity.admin?'overview':state.identity.permissions.includes('housekeeping:read')?'rooms':state.identity.permissions.includes('breakfast:read')?'breakfast':state.identity.permissions.includes('issues:read')?'issues':state.identity.permissions.includes('inventory:read')?'inventory':'chat';await render();});main.append(el('div',{class:'native-bar'},roles));}return main;}
const error=e=>showError(document.querySelector('#status')??document.querySelector('#content'),e);
function dateBar(extra=[]){const input=el('input',{type:'date',value:state.date,'aria-label':'Datum'});input.addEventListener('change',()=>{state.date=input.value;render();});return el('div',{class:'toolbar'},button('‹',()=>changeDay(-1)),el('strong',{},new Date(state.date+'T12:00:00').toLocaleDateString('cs',{day:'numeric',month:'long',year:'numeric'})),button('›',()=>changeDay(1)),button('Dnes',()=>{state.date=today();render();}),input,...extra,button('Obnovit',()=>{state.uncertainRooms.clear();render();}));}
function changeDay(delta){const d=new Date(state.date+'T12:00:00');d.setDate(d.getDate()+delta);state.date=new Intl.DateTimeFormat('sv-SE').format(d);render();}
const roomQuery=()=>'?date='+state.date+'&include_options=true&include_blocks=true';
async function rooms(){
 const generation=state.generation,main=heading(label('hotel.admin.5','hotel.portal.45'),label('Pokoje a úklid','Pokojská · stav pokojů'),'Projděte denní přehled pokojů a nastavte ověřený stav úklidu.');const data=await api('api/v1/housekeeping/rooms'+roomQuery());if(generation!==state.generation)return;
 const grid=el('div',{class:'rooms'}),search=el('input',{type:'search',value:state.roomFilter,placeholder:'Číslo pokoje','aria-label':'Hledat pokoj'}),floor=select('Patro','floor',[['','Všechna patra'],...[...new Set(data.rooms.map(r=>r.floor))].map(v=>[v,v])],state.floor);
 const draw=()=>{grid.replaceChildren(...data.rooms.filter(r=>(!state.floor||r.floor===state.floor)&&(!state.roomFilter||r.room_number.includes(state.roomFilter))).map(r=>{const [title,ico]=statuses[r.housekeeping_status_key]??['Stav není známý','warning'];return el('button',{type:'button',class:'room-tile status-'+r.housekeeping_status_key,onclick:()=>roomDetail(r)},el('div',{class:'room-top'},el('strong',{},r.room_number),icon(r.occupied?'bed':'check')),el('div',{class:'room-status'},icon(ico),title),el('small',{},r.current_persons===null?'Obsazenost není známá':r.occupied?r.current_persons+' osob · uvnitř teď':'Prázdný teď'),el('small',{},r.departure_today?'Odjezd dnes':r.arrival_today?'Příjezd dnes':'Bez příjezdu a odjezdu'),r.blocks.length?el('small',{class:'blocked'},'Blokace pokoje / zastavení prodeje'):null); }));};search.addEventListener('input',()=>{state.roomFilter=search.value;draw();});floor.querySelector('select').addEventListener('change',e=>{state.floor=e.target.value;draw();});draw();
 main.append(panel('Stav pokojů',[dateBar(),el('div',{class:'toolbar'},floor,search),el('p',{},'Obsazenost se liší od aktuálního stavu úklidu.'),grid],'housekeeping'));
}
function roomDetail(room){
 modal('Pokoj '+room.room_number,close=>{
 const content=el('div'),actions=el('div',{class:'room-status-actions'});
 const selectedDate=state.date,query='?date='+selectedDate+'&include_options=true&include_blocks=true';
 for(const [status,[name,ico]]of Object.entries(statuses)){
  const action=button(name,()=>saveMutation(content,{path:'api/v1/housekeeping/rooms/'+encodeURIComponent(room.room_id)+query,method:'PATCH',body:{status,expected_status:room.housekeeping_status_key,note:null},verify:async (result,{read})=>{
   if(result?.room_id!==room.room_id||result.housekeeping_status_key!==status)throw Error('Původní odpověď nepotvrzuje požadovaný stav pokoje.');
   const overview=await read('api/v1/housekeeping/rooms'+query),actual=overview.rooms.find(r=>r.room_id===room.room_id);
   if(actual?.housekeeping_status_key!==status)throw Error('Aktuální stav pokoje se liší. Načtěte jej znovu před další změnou.');
  },done:async()=>{close();await render();}}),'status-'+status);
  action.prepend(icon(ico));action.disabled=!state.identity.permissions.includes('housekeeping:write')||!room.housekeeping_status_key;actions.append(action);
 }
 content.append(actions,el('h3',{},'Pobyty vybraného dne'));
 for(const [name,stays]of [['Odjezdy',room.departures],['Příjezdy',room.arrivals],['Pokračující pobyty',room.stays]])for(const stay of stays){const guests=stay.guests.map(g=>g.name).filter(Boolean);const body=el('div',{},el('p',{},stay.reservation_code??stay.reservation_id),el('p',{},stay.arrival+' → '+stay.departure),el('p',{},'Stav: '+(stay.reservation_status_name??stay.reservation_state??'neznámý')),el('p',{},'Hosté: '+(guests.join(', ')||stay.main_guest_name||stay.display_name||'—')),el('p',{},'Firma: '+(stay.company_name??'—')),el('p',{},'Osob: '+stay.persons),stay.housekeeping_note?notice(stay.housekeeping_note,'warning'):null);
  for(const kind of ['dog','cot']){const quantity=kind==='dog'?stay.dog_count:stay.cot_required===null?null:Number(stay.cot_required),amenity=stay.amenities.find(a=>a.kind===kind);if(quantity)body.append(button((kind==='dog'?'Pes ('+quantity+')':'Dětská postýlka')+(amenity?.confirmed?' · připraveno':' · potvrdit připravení'),async e=>{e.currentTarget.disabled=true;try{await api('api/v1/housekeeping/reservations/'+encodeURIComponent(stay.reservation_id)+'/requirements/'+kind+'/confirm?room_id='+encodeURIComponent(room.room_id)+'&date='+state.date,{method:'POST',body:{quantity,version:amenity?.version??0}});close();await render();}catch(err){showError(content,err);}}));}
 content.append(panel(name,body,'bed'));}
 return content;
 },{id:'hotel.housekeeping.room'});
}
const modules={
 issues:{path:'issues',title:'Závady',id:'hotel.admin.14',member:'hotel.portal.54',newId:'hotel.admin.15',fields:[['Název','title','text',true],['Popis','description','textarea'],['Umístění','location','text',true],['Pokoj','room_number','text'],['Priorita','priority',[['low','Nízká'],['medium','Střední'],['high','Vysoká'],['critical','Kritická']]],['Stav','status',[['new','Nová'],['in_progress','Řeší se'],['resolved','Vyřešeno'],['closed','Uzavřeno']]],['Přiřazeno','assignee','text']]},
 reports:{path:'reports',title:'Provozní hlášení',id:'hotel.admin.22',member:'hotel.portal.62',newId:'hotel.admin.23',fields:[['Název','title','text',true],['Popis','description','textarea'],['Stav','status',[['open','Otevřené'],['in_progress','Řeší se'],['closed','Uzavřené']]]]},
 lostfound:{path:'lost-found',title:'Ztráty a nálezy',id:'hotel.admin.10',member:'hotel.portal.50',newId:'hotel.admin.11',fields:[['Typ','item_type',[['found','Nález'],['lost','Ztráta']]],['Popis','description','textarea',true],['Kategorie','category','text',true],['Umístění','location','text',true],['Pokoj','room_number','text'],['Datum a čas','event_at','datetime-local',true],['Stav','status',[['new','Nové'],['stored','Uloženo'],['claimed','Přihlásil se majitel'],['returned','Vráceno'],['disposed','Vyřazeno']]],['Majitel','claimant_name','text'],['Kontakt','claimant_contact','text'],['Poznámka k předání','handover_note','textarea']]},
 inventory:{path:'inventory',title:'Sklad',id:'hotel.admin.18',member:'hotel.portal.58',newId:'hotel.admin.19',fields:[['Název','name','text',true],['Jednotka','unit',[['ks','ks'],['g','g'],['l','l']]],['Minimální zásoba','min_stock','number',true],['Aktuální zásoba','current_stock','number',true],['Základních jednotek na kus','amount_per_piece_base','number',true]]}
};
function moduleEditor(config,row){const reference=moduleReference(config.path,row?'edit':'new',state.identity.admin);modal(reference.title,close=>{
 const controls=el('div',{class:'form-grid'});
 for(const [title,key,type,required] of config.fields){
  const value=row?.[key]??(key==='unit'?'ks':key==='amount_per_piece_base'?1:type==='number'?0:''),limits={required, ...(type==='number'?{min:key==='amount_per_piece_base'?1:0,max:2147483647,step:1}:{}),...(type==='text'?{maxlength:key==='title'||key==='name'?255:key==='room_number'?32:key==='category'?64:255}:{}),...(type==='datetime-local'?{step:1}: {})};
  if(Array.isArray(type))controls.append(select(title,key,type,value));
  else if(type==='textarea')controls.append(el('label',{class:'field wide'},el('span',{},title),el('textarea',{name:key,'aria-label':title,required,maxlength:key==='handover_note'?2000:4000,minlength:required?3:0},value)));
  else controls.append(field(title,key,type,type==='datetime-local'?pragueInput(value):value,limits));
  if(type==='datetime-local')controls.append(select('Výskyt času při změně letního času',key+'-fold',[['','Vyberte pouze při opakovaném čase'],['first','První výskyt'],['second','Druhý výskyt']],''));
 }
 if(config.path==='lost-found')controls.append(el('fieldset',{class:'wide'},el('legend',{},'Štítky'),[['kontaktova','Kontaktován'],['nezastizen','Nezastižen'],['vyzvedne','Vyzvedne'],['odesleme','Odešleme']].map(([key,title])=>el('label',{class:'check-field'},el('input',{type:'checkbox',name:'tag-'+key,checked:row?.tags?.includes(key)}),title))));
 const form=el('form',{},controls,el('button',{type:'submit',class:'primary'},'Uložit'));
 form.addEventListener('submit',event=>{
  event.preventDefault();const raw=formData(form),payload={};
  try{for(const [,key,type] of config.fields){
   if(type==='number'){payload[key]=Number(raw[key]);if(!Number.isSafeInteger(payload[key]))throw Error('Zadejte celé číslo v povoleném rozsahu.');}
   else if(type==='datetime-local'){payload[key]=row&&raw[key]===pragueInput(row[key])?(/([Zz]|[+-]\d\d:\d\d)$/.test(row[key])?row[key]:row[key]+'Z'):pragueInstant(raw[key],raw[key+'-fold']);}
   else payload[key]=raw[key]===''?null:raw[key];
  }}catch(error){showError(form,error);return;}
  if(config.path==='lost-found')payload.tags=['kontaktova','nezastizen','vyzvedne','odesleme'].filter(key=>raw['tag-'+key]==='on');
  saveMutation(form,{path:'api/v1/'+config.path+(row?'/'+row.id:''),method:row?'PUT':'POST',body:payload,verify:async (result,{read})=>{
   if(!result?.id)throw Error('Odpověď neobsahuje identitu uloženého záznamu.');
   const actual=await read('api/v1/'+config.path+'/'+result.id);
   for(const [key,value] of Object.entries(payload)){
    const same=key==='event_at'?Date.parse(actual[key]+(/([Zz]|[+-]\d\d:\d\d)$/.test(actual[key])?'':'Z'))===Date.parse(value):JSON.stringify(actual[key])===JSON.stringify(value);
    if(!same)throw Error('Uložený údaj nebyl potvrzen následným načtením: '+(config.fields.find(f=>f[1]===key)?.[0]??'Štítky'));
   }
  },done:async()=>{close();await render();}});
 });return form;
},{id:reference.id});}
async function moduleList(key){const config=modules[key],generation=state.generation,main=heading(label(config.id,config.member),config.title,'Projděte záznamy a otevřete podrobnosti vybrané položky.');const rows=await api('api/v1/'+config.path);if(generation!==state.generation)return;const search=el('input',{type:'search',placeholder:'Hledat','aria-label':'Hledat záznam'}),list=el('div');const draw=()=>{const q=search.value.toLocaleLowerCase('cs');list.replaceChildren(table(['Záznam','Umístění / jednotka','Stav / zásoba','Akce'],rows.filter(r=>String(r.title??r.name??r.description).toLocaleLowerCase('cs').includes(q)).map(r=>[r.title??r.name??r.description,r.location??r.unit??'—',r.current_stock??r.status,button('Detail',()=>moduleDetail(config,r))])));};search.addEventListener('input',draw);draw();main.append(el('div',{class:'toolbar'},search,state.identity.permissions.includes((config.path==='lost-found'?'lost_found':config.path)+':write')?button(moduleReference(config.path,'new',state.identity.admin).title,()=>moduleEditor(config)):null),panel(config.title,list));}
async function moduleDetail(config,row){
 try{
 const generation=state.generation,actual=await api('api/v1/'+config.path+'/'+row.id);if(generation!==state.generation)return;
 const permission=(config.path==='lost-found'?'lost_found':config.path)+':write',canWrite=state.identity.permissions.includes(permission);
 const reference=moduleReference(config.path,'detail',state.identity.admin);
 modal(reference.title,close=>{
  const content=el('div',{},table(['Údaj','Hodnota'],config.fields.map(([title,key])=>[title,actual[key]??'—'])));
  if(config.path==='inventory')content.append(inventoryExtras(actual,()=>state.view==='inventory'?moduleDetail(config,actual):render(),canWrite));
  if(canWrite)content.append(el('div',{class:'actions'},button('Upravit',()=>{close();moduleEditor(config,actual);}),button('Odstranit',()=>{
   close();const deletion=moduleReference(config.path,'delete',state.identity.admin);modal(deletion.title,end=>{
    const confirmation=el('div',{},notice('Tuto operaci nelze automaticky vrátit.','warning'));
    confirmation.append(button('Odstranit tento záznam',()=>saveMutation(confirmation,{path:'api/v1/'+config.path+'/'+actual.id,method:'DELETE',verify:async(_,{read})=>{try{await read('api/v1/'+config.path+'/'+actual.id);}catch(error){if(error.status===404)return;throw error;}throw Error('Záznam stále existuje.');},done:async()=>{end();await render();}}),'danger'));return confirmation;
   },{id:deletion.id});
  })));
  return content;
 },{id:reference.id});
 }catch(failure){error(failure);}
}
async function breakfast(){const generation=state.generation,main=heading(label('hotel.admin.6','hotel.portal.46'),'Snídaně','Denní přehled zakoupených snídaní a jejich výdeje.');const data=await api('api/v1/breakfast/daily-overview?service_date='+state.date);if(generation!==state.generation)return;main.append(dateBar(),panel('Denní souhrn',el('div',{class:'metrics'},el('span',{class:'badge'},'Pokojů: '+data.summary.total_orders),el('span',{class:'badge'},'Hostů: '+data.summary.total_guests))));const grid=el('div',{class:'breakfast-grid'});for(const order of data.orders){const body=el('div',{},el('strong',{},'Pokoj '+order.room_number),el('p',{},order.guest_count+' hostů · '+order.guest_name),el('p',{},'Stav: '+order.status),order.note?notice(order.note,'warning'):null,el('p',{},[['diet_no_gluten','Bez lepku'],['diet_no_milk','Bez mléka'],['diet_no_pork','Bez vepřového']].filter(([k])=>order[k]).map(([,v])=>v).join(' · ')));if(['pending','preparing'].includes(order.status))body.append(button('Vydat snídani',async e=>{e.currentTarget.disabled=true;try{const r=await api('api/v1/breakfast/'+order.id,{method:'PUT',body:{status:'served',expected_updated_at:order.updated_at}});if(r.status!=='served')throw Error('Výdej nebyl potvrzen.');await render();}catch(err){showError(body,err);}}));grid.append(panel('Pokoj '+order.room_number,body,'breakfast'));}main.append(grid);}
async function chat(){const main=heading(label('hotel.admin.2','hotel.portal.40'),'Soukromé zprávy','Interní týmové konverzace. Zpráva se odešle pouze vaším výslovným tlačítkem.');const conversations=await api('api/v1/chat/conversations'),list=el('div',{class:'chat-directory'}),thread=el('div',{class:'chat-thread'});for(const c of conversations)list.append(button(c.participant.display_name+(c.unread_count?' ('+c.unread_count+')':''),()=>openThread(c,thread)));main.append(el('div',{class:'toolbar'},button('Nová konverzace',async()=>{const directory=await api('api/v1/chat/directory');modal('Nová soukromá konverzace',close=>el('div',{},directory.map(p=>button(p.display_name,async()=>{try{const c=await api('api/v1/chat/conversations',{method:'POST',body:{recipient_id:p.id}});close();await openThread(c,thread);}catch(e){error(e);}}))));})),el('div',{class:'chat-layout'},list,thread));}
async function openThread(conversation,thread){
 const messages=await api('api/v1/chat/conversations/'+conversation.id+'/messages');
 const rendered=messages.map(m=>el('article',{class:'message '+(m.is_mine?'mine':'')},
  el('p',{},m.body),
  el('small',{},new Date(m.sent_at).toLocaleString('cs')+(m.read_at?' · přečteno':''))));
 thread.replaceChildren(el('h2',{},conversation.participant.display_name),el('div',{class:'messages'},rendered));
 if(messages.length)await api('api/v1/chat/conversations/'+conversation.id+'/read',{method:'POST',body:{through_message_id:messages.at(-1).id}});
 const text=el('textarea',{name:'body',required:true,maxlength:4000,'aria-label':'Zpráva'});
 const send=el('button',{type:'submit',class:'primary'},'Odeslat');
 const form=el('form',{},text,send);
 let id=crypto.randomUUID(),uncertain=false;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(uncertain)return;send.disabled=true;
  try{
   await api('api/v1/chat/messages',{method:'POST',body:{recipient_id:conversation.participant.id,body:text.value,client_message_id:id}});
   id=crypto.randomUUID();await openThread(conversation,thread);
  }catch(err){uncertain=!!err.uncertain;showError(form,err);if(!uncertain)send.disabled=false;}
 });
 thread.append(form);
}

const viewPermission={reception:'breakfast:read',rooms:'housekeeping:read',breakfast:'breakfast:read',issues:'issues:read',inventory:'inventory:read',reports:'reports:read',lostfound:'lost_found:read',settings:'settings:read'};
async function selectViewRole(name){
 const permission=viewPermission[name];if(!permission||state.identity.permissions.includes(permission))return;
 const role=state.identity.roles.find(role=>state.identity.role_permissions?.[role]?.includes(permission));
 if(!role)throw Error('Do tohoto pohledu nemáte oprávnění.');
 setRole(role);state.identity=await api('identity');
}
const context={state,heading,go:async name=>{state.view=name;await render();}};
async function render(){const generation=++state.generation;document.querySelector('#content').setAttribute('aria-busy','true');try{await selectViewRole(state.view);if(generation!==state.generation)return;if(state.view==='overview')await overview(context);else if(state.view==='reception')reception(context);else if(state.view==='settings')await hotelSettings(context);else if(state.view==='rooms')await rooms();else if(state.view==='breakfast')await breakfast();else if(state.view==='chat')await chat();else if(modules[state.view])await moduleList(state.view);else throw Error('Požadovaný pohled neexistuje.');if(generation===state.generation)document.querySelector('#content').append(el('footer',{},el('span',{},document.querySelector('#content').dataset.view),el('span',{},'KájovoHotel')));}catch(e){if(generation===state.generation)error(e);}finally{if(generation===state.generation)document.querySelector('#content').setAttribute('aria-busy','false');}}

const availableViews=await api('ui-manifest.json');
addEventListener('message',event=>{
 const data=event.data;if(event.source!==parent||event.origin!==location.origin||data?.type!=='CML_SECTION_NAVIGATE'||data.prefix!=='/sections/hotel/')return;
 const declared=availableViews.views.find(view=>view.id===data.id&&view.path===data.path);if(!declared)return;
 const name=new URL(declared.path,location.origin).searchParams.get('view');if(!name)return;
 state.view=name;state.pendingNavigation=true;if(state.initialized)render();
});

try{state.identity=await api('identity');setRole(state.identity.active_role);if(!state.pendingNavigation&&!new URLSearchParams(location.search).has('view'))state.view=state.identity.admin?'overview':state.identity.permissions.includes('housekeeping:read')?'rooms':state.identity.permissions.includes('breakfast:read')?'breakfast':state.identity.permissions.includes('issues:read')?'issues':state.identity.permissions.includes('inventory:read')?'inventory':'chat';state.initialized=true;await render();}catch(e){document.querySelector('#content').replaceChildren(notice(e.message,'error'));}
