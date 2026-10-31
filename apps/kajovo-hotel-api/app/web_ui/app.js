import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {api,view,setRole,download,exportLink} from './api.js';
import {saveMutation} from './operations.js';
import {overview,reception} from './summary.js';
import {hotelSettings} from './settings.js';
import {breakfastList,breakfastEditor,breakfastDetail} from './breakfast.js';
import {readBreakfastDate} from './preferences.js';
import {warehouseCards,warehouseCardForm,warehouseCardDetail,warehouseMovements} from './warehouse.js';
import {modules,recordList,recordEditor,recordDetail,recordSubmitted} from './records.js';
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
 main.append(panel('Stav pokojů',[dateBar(),el('div',{class:'actions'},state.identity.permissions.includes('issues:write')?button([icon('plus'),'Nová závada'],()=>context.go('issues-new')):null,state.identity.permissions.includes('lost_found:write')?button([icon('plus'),'Nový nález nebo ztráta'],()=>context.go('lostfound-new')):null),el('div',{class:'toolbar'},floor,search),el('p',{},'Obsazenost se liší od aktuálního stavu úklidu.'),grid],'housekeeping'));
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

const viewPermission={'inventory-cards':'inventory:read','inventory-card-new':'inventory:write','inventory-card-detail':'inventory:read','inventory-movements':'inventory:read','breakfast-new':'breakfast:read','breakfast-edit':'breakfast:read','breakfast-detail':'breakfast:read',reception:'breakfast:read',rooms:'housekeeping:read',breakfast:'breakfast:read',issues:'issues:read',inventory:'inventory:read',reports:'reports:read',lostfound:'lost_found:read',settings:'settings:read'};
async function selectViewRole(name){
 const base=name.replace(/-(new|edit|detail|submitted)$/,''),permission=viewPermission[name]??(viewPermission[base]&&(/-(new|submitted)$/.test(name)?viewPermission[base].replace(':read',':write'):viewPermission[base]));if(!permission||state.identity.permissions.includes(permission))return;
 const role=state.identity.roles.find(role=>state.identity.role_permissions?.[role]?.includes(permission));
 if(!role)throw Error('Do tohoto pohledu nemáte oprávnění.');
 setRole(role);state.identity=await api('identity');
}
const context={state,heading,go:async name=>{state.view=name;await render();}};
async function render(){for(const dispose of state.cleanup??[])dispose();state.cleanup=[];const generation=++state.generation;document.querySelector('#content').setAttribute('aria-busy','true');try{await selectViewRole(state.view);if(generation!==state.generation)return;if(state.view==='overview')await overview(context);else if(state.view==='reception')reception(context);else if(state.view==='settings')await hotelSettings(context);else if(state.view==='rooms')await rooms();else if(state.view==='breakfast')await breakfastList(context);else if(['breakfast-new','breakfast-edit'].includes(state.view))await breakfastEditor(context);else if(state.view==='breakfast-detail')await breakfastDetail(context);else if(state.view==='chat')await chat();else if(state.view==='inventory-cards')await warehouseCards(context);else if(state.view==='inventory-card-new')await warehouseCardForm(context);else if(state.view==='inventory-card-detail')await warehouseCardDetail(context);else if(state.view==='inventory-movements')await warehouseMovements(context);else if(modules[state.view])await recordList(context,state.view);else if(/-(new|edit|detail|submitted)$/.test(state.view)){const [,key,mode]=state.view.match(/^(.+)-(new|edit|detail|submitted)$/);if(!modules[key])throw Error('Pohled neexistuje.');if(mode==='submitted')await recordSubmitted(context,key);else if(mode==='detail')await recordDetail(context,key);else await recordEditor(context,key,mode);}else throw Error('Požadovaný pohled neexistuje.');if(generation===state.generation)document.querySelector('#content').append(el('footer',{},el('span',{},document.querySelector('#content').dataset.view),el('span',{},'KájovoHotel')));}catch(e){if(generation===state.generation)error(e);}finally{if(generation===state.generation)document.querySelector('#content').setAttribute('aria-busy','false');}}

const availableViews=await api('ui-manifest.json');
addEventListener('message',event=>{
 const data=event.data;if(event.source!==parent||event.origin!==location.origin||data?.type!=='CML_SECTION_NAVIGATE'||data.prefix!=='/sections/hotel/')return;
 const declared=availableViews.views.find(view=>view.id===data.id&&view.path===data.path);if(!declared)return;
 const name=new URL(declared.path,location.origin).searchParams.get('view');if(!name)return;
 state.view=name;state.pendingNavigation=true;if(state.initialized)render();
});

try{state.breakfastDate=await readBreakfastDate();state.identity=await api('identity');setRole(state.identity.active_role);if(!state.pendingNavigation&&!new URLSearchParams(location.search).has('view'))state.view=state.identity.admin?'overview':state.identity.permissions.includes('housekeeping:read')?'rooms':state.identity.permissions.includes('breakfast:read')?'breakfast':state.identity.permissions.includes('issues:read')?'issues':state.identity.permissions.includes('inventory:read')?'inventory':'chat';state.initialized=true;await render();}catch(e){document.querySelector('#content').replaceChildren(notice(e.message,'error'));}
