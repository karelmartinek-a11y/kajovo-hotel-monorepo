import {t,locale,restoreLocale,languageSelector} from './i18n.js';
import {orderedRooms,roomTile,nightCount} from './room-tiles.js';
import {el,icon,select,button,panel,notice,modal,showError} from './ui.js';
import {api,view,setRole} from './api.js';
import {saveMutation} from './operations.js';
import {overview,reception} from './summary.js';
import {hotelSettings} from './settings.js';
import {breakfastList,breakfastEditor,breakfastDetail} from './breakfast.js';
import {readBreakfastDate} from './preferences.js';
import {privateChat} from './chat.js';
import {warehouseCards,warehouseCardForm,warehouseCardDetail,warehouseMovements} from './warehouse.js';
import {modules,recordList,recordEditor,recordDetail,recordSubmitted} from './records.js';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
const state={date:today(),identity:null,view:new URLSearchParams(location.search).get('view')??'rooms',generation:0,roomFilter:'',floor:'',uncertainRooms:new Set()};
const statuses={clean:[t('Uklizeno pro nájezd'),'check'],dirty:[t('Neuklizeno'),'close'],stay_no_linen:[t('Pobyt bez ložního prádla'),'bed'],stay_with_linen:[t('Uklizeno s ložním prádlem'),'linen'],do_not_disturb:[t('Nerušit'),'do-not-disturb'],technical_issue:[t('Technický problém'),'issue'],windows_cleaned:[t('Umytá okna'),'window'],painted:[t('Vymalováno'),'paint']};
const label=(admin,member)=>state.identity.admin?admin:member;
function heading(id,title,desc){
 const main=view(id,title,desc);main.append(el('div',{id:'status','aria-live':'polite'}),languageSelector(state.identity,{save:async selected=>{let failure;try{await api('api/auth/locale',{method:'PATCH',body:{locale:selected}});}catch(e){failure=e;}const current=await api('identity');if(current.preferred_locale!==selected)throw failure??Error(t('Výsledek zápisu není ověřený. Načtěte původní výsledek.'));},error}));
 if(state.identity.roles.length>1){
  const roles=select(t('Pracovní role'),'role',state.identity.roles.map(r=>[r,t(r)]),state.identity.active_role);
  roles.querySelector('select').addEventListener('change',async e=>{
   const control=e.currentTarget,role=control.value,generation=++state.generation;
   try{
    const identity=await api('identity',{roleOverride:role});if(generation!==state.generation)return;
    state.identity=identity;setRole(identity.active_role);
    if(!new URLSearchParams(location.search).has('view'))state.view=state.identity.admin?'overview':state.identity.permissions.includes('housekeeping:read')?'rooms':state.identity.permissions.includes('breakfast:read')?'breakfast':state.identity.permissions.includes('issues:read')?'issues':state.identity.permissions.includes('inventory:read')?'inventory':'chat';
    await render();
   }catch(e){if(generation===state.generation){control.value=state.identity.active_role;error(e);}}
  });
  main.append(el('div',{class:'native-bar'},roles));
 }
 return main;
}
const error=e=>showError(document.querySelector('#status')??document.querySelector('#content'),e);
function setDay(value){const day=new Date(value+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||!Number.isFinite(+day)||day.toISOString().slice(0,10)!==value){error(Error(t('Vyberte platné datum. Původní den zůstává otevřený.')));return false;}state.date=value;render();return true;}
function dateBar(extra=[]){
 const input=el('input',{type:'date',value:state.date,min:'0001-01-01',max:'9999-12-31',required:true,'aria-label':t('Datum')});input.addEventListener('change',()=>{if(!setDay(input.value))input.value=state.date;});
 const previous=button(icon('arrow-left'),()=>changeDay(-1)),next=button(icon('arrow-right'),()=>changeDay(1));previous.setAttribute('aria-label',t('Předchozí den'));next.setAttribute('aria-label',t('Následující den'));
 return el('div',{class:'room-controls'},el('div',{class:'room-day-nav'},previous,el('strong',{},new Date(state.date+'T12:00:00').toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'})),next,button([icon('arrow-right'),t('Dnes')],()=>setDay(today()))),el('div',{class:'room-date-filters'},el('label',{class:'field'},el('span',{},t('Datum')),input),...extra,button([icon('refresh'),t('Obnovit')],()=>{state.uncertainRooms.clear();render();})));
}
function changeDay(delta){const d=new Date(state.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);setDay(d.toISOString().slice(0,10));}
const roomQuery=()=>'?date='+state.date+'&include_options=true&include_blocks=true';
async function rooms(){
 const generation=state.generation,main=heading(label('hotel.admin.5','hotel.portal.45'),label(t('Pokoje a úklid'),t('Pokojská · stav pokojů')),t('Projděte denní přehled pokojů a nastavte ověřený stav úklidu.'));let data=await api('api/v1/housekeeping/rooms'+roomQuery());if(generation!==state.generation)return;
 const grid=el('div',{class:'rooms'}),search=el('input',{type:'search',value:state.roomFilter,placeholder:t('Číslo pokoje'),'aria-label':t('Hledat pokoj')}),floor=select(t('Patro'),'floor',[['',t('Všechna patra')],...[...new Set(data.rooms.map(r=>r.floor))].map(v=>[v,v])],state.floor);
 const draw=()=>{grid.replaceChildren(...orderedRooms(data.rooms).filter(r=>(!state.floor||r.floor===state.floor)&&(!state.roomFilter||r.room_number.includes(state.roomFilter))).map(r=>roomTile(r,state.date,roomDetail,statuses[r.housekeeping_status_key]?.[0]??t('Stav není známý'))));};search.addEventListener('input',()=>{state.roomFilter=search.value;draw();});floor.querySelector('select').addEventListener('change',e=>{state.floor=e.target.value;draw();});draw();
 const legend=el('div',{class:'room-legend'},...[['status-clean',t('Uklizeno pro nájezd')],['status-stay_no_linen',t('Pobytové úklidy')],['status-dirty',t('Neuklizeno')]].map(([status,text])=>el('span',{class:status},el('span',{class:'room-legend-dot','aria-hidden':'true'}),text)),el('span',{},icon('bed'),t('Obsazenost se liší od stavu úklidu')));
 let refreshing=false;
 const refresh=async()=>{if(refreshing||document.hidden||document.querySelector('#dialog[open]')||generation!==state.generation)return;refreshing=true;try{const next=await api('api/v1/housekeeping/rooms'+roomQuery());if(generation===state.generation){data=next;draw();main.querySelector('[data-room-refresh-error]')?.remove();}}catch(e){if(generation===state.generation){main.querySelector('[data-room-refresh-error]')?.remove();const warning=notice(t('Přehled se nepodařilo obnovit. Zobrazené údaje mohou být zastaralé.'),'warning');warning.dataset.roomRefreshError='';main.prepend(warning);}}finally{refreshing=false;}};
 const timer=setInterval(refresh,60000);addEventListener('focus',refresh);addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);
 state.cleanup.push(()=>{clearInterval(timer);removeEventListener('focus',refresh);removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);});
 main.append(panel(t('Stav pokojů'),[dateBar([floor,el('label',{class:'field'},el('span',{},t('Hledat pokoj')),search)]),el('div',{class:'actions'},state.identity.permissions.includes('issues:write')?button([icon('plus'),t('Nová závada')],()=>context.go('issues-new')):null,state.identity.permissions.includes('lost_found:write')?button([icon('plus'),t('Nový nález nebo ztráta')],()=>context.go('lostfound-new')):null),legend,grid],'housekeeping'));
}
function roomDetail(room){
 modal(t('Pokoj ')+room.room_number,close=>{
 const content=el('div'),actions=el('div',{class:'room-status-actions'});
 const selectedDate=state.date,query='?date='+selectedDate+'&include_options=true&include_blocks=true';
 for(const [status,[name,ico]]of Object.entries(statuses)){
  const action=button(name,()=>saveMutation(content,{path:'api/v1/housekeeping/rooms/'+encodeURIComponent(room.room_id)+query,method:'PATCH',body:{status,expected_status:room.housekeeping_status_key,note:null},verify:async (result,{read})=>{
   if(result?.room_id!==room.room_id||result.housekeeping_status_key!==status)throw Error(t('Původní odpověď nepotvrzuje požadovaný stav pokoje.'));
   const overview=await read('api/v1/housekeeping/rooms'+query),actual=overview.rooms.find(r=>r.room_id===room.room_id);
   if(actual?.housekeeping_status_key!==status)throw Error(t('Aktuální stav pokoje se liší. Načtěte jej znovu před další změnou.'));
  },done:async()=>{close();await render();}}),'cleaning-'+status);
  action.prepend(icon(ico));action.disabled=!state.identity.permissions.includes('housekeeping:write')||!room.housekeeping_status_key;actions.append(action);
 }
 content.append(actions,el('p',{},t('Aktuální stav úklidu: ')+(statuses[room.housekeeping_status_key]?.[0]??t('Neurčen'))),el('p',{},room.occupied?(room.current_persons??room.persons??'?')+t(' osob · uvnitř teď'):t('Prázdný teď')));
 for(const block of room.blocks??[])content.append(el('p',{},t('Blokace pokoje / zastavení prodeje: ')+block.arrival+' → '+block.departure+' · '+(block.coverage==='full'?t('Celý den'):block.coverage==='left'?t('Odjezd'):t('Příjezd'))));
 content.append(el('h3',{},t('Pobyty vybraného dne')));
 if(![...room.departures,...room.arrivals,...room.stays].length)content.append(el('p',{},t('Bez pobytu ve vybraný den')));
 for(const [name,stays]of [[t('Odjezdy'),room.departures],[t('Příjezdy'),room.arrivals],[t('Pokračující pobyty'),room.stays]])for(const stay of stays){const guests=stay.guests.map(g=>g.name).filter(Boolean);const body=el('div',{},el('p',{},stay.reservation_code??stay.reservation_id),el('p',{},stay.arrival+' → '+stay.departure),el('p',{},t('Stav: ')+(stay.reservation_status_name??stay.reservation_state??t('neznámý'))),el('p',{},t('Hosté: ')+(guests.join(', ')||'—')),el('p',{},t('Firma: ')+(stay.company_name??'—')),el('p',{},t('Osob: ')+stay.persons+t(' · Dospělí: ')+(stay.adults??'?')+t(' · Děti: ')+(stay.children??'?')+' · Mimina: '+(stay.infants??'?')),el('p',{},t('Příjezd: ')+(stay.arrival_time??'?')+' · Odjezd: '+(stay.departure_time??'?')),el('p',{},t('Noc pobytu: ')+nightCount(stay,selectedDate)),el('p',{},t('Stát: ')+(stay.country_name??stay.country_code??'?')),stay.housekeeping_note?notice(stay.housekeeping_note,'warning'):null);
  body.append(el('p',{},t('Skutečný CHECK-IN: ')+(stay.checked_in??'?')),el('p',{},t('Skutečný CHECK-OUT: ')+(stay.checked_out??'?')));
  for(const charge of stay.charges??[])body.append(el('p',{},charge.label+' · '+charge.quantity+(charge.date?' · '+charge.date:'')));
  for(const kind of ['dog','cot']){
   const quantity=kind==='dog'?stay.dog_count:stay.cot_required===null?null:Number(stay.cot_required),amenity=stay.amenities.find(a=>a.kind===kind),prepared=amenity?.active===true&&amenity.state==='green';if(!quantity)continue;
   const version=amenity?.version??0,action=button((kind==='dog'?t('Pes (')+quantity+')':t('Dětská postýlka'))+(prepared?t(' · připraveno'):t(' · potvrdit připravení')),()=>saveMutation(content,{
    path:'api/v1/housekeeping/reservations/'+encodeURIComponent(stay.reservation_id)+'/requirements/'+kind+'/confirm?room_id='+encodeURIComponent(room.room_id)+'&date='+selectedDate,
    body:{quantity,version},verify:async(result,{read})=>{
     if(result?.kind!==kind||result.active!==true||result.state!=='green'||result.version!==version+1)throw Error(t('Původní odpověď nepotvrzuje připravení požadavku.'));
     const overview=await read('api/v1/housekeeping/rooms'+query),actualRoom=overview.rooms.find(row=>row.room_id===room.room_id),actualStay=actualRoom&&[...actualRoom.departures,...actualRoom.arrivals,...actualRoom.stays].find(row=>row.reservation_id===stay.reservation_id),actual=actualStay?.amenities.find(row=>row.kind===kind),actualQuantity=kind==='dog'?actualStay?.dog_count:actualStay?.cot_required===true?1:0;
     if(actualQuantity!==quantity||actual?.active!==true||actual.state!=='green'||actual.version<result.version)throw Error(t('Následné načtení nepotvrdilo připravený požadavek tohoto pokoje, pobytu a dne. Obnovte přehled.'));
    },done:async()=>{if(content.isConnected){close();await render();}}
   }));action.disabled=prepared||!state.identity.permissions.includes('housekeeping:write');body.append(action);
  }
 content.append(panel(name,body,'bed'));}
 return content;
 },{id:'hotel.housekeeping.room',className:'room-detail-sheet'});
}
const viewPermission={'inventory-cards':'inventory:read','inventory-card-new':'inventory:write','inventory-card-detail':'inventory:read','inventory-movements':'inventory:read','breakfast-new':'breakfast:read','breakfast-edit':'breakfast:read','breakfast-detail':'breakfast:read',reception:'breakfast:read',rooms:'housekeeping:read',breakfast:'breakfast:read',issues:'issues:read',inventory:'inventory:read',reports:'reports:read',lostfound:'lost_found:read',settings:'settings:read'};
async function selectViewRole(name,generation){
 const base=name.replace(/-(new|edit|detail|submitted)$/,''),permission=viewPermission[name]??(viewPermission[base]&&(/-(new|submitted)$/.test(name)?viewPermission[base].replace(':read',':write'):viewPermission[base]));if(!permission||state.identity.permissions.includes(permission))return;
 const role=state.identity.roles.find(role=>state.identity.role_permissions?.[role]?.includes(permission));
 if(!role)throw Error(t('Do tohoto pohledu nemáte oprávnění.'));
 const identity=await api('identity',{roleOverride:role});if(generation!==state.generation)return;
 state.identity=identity;setRole(identity.active_role);
}
const context={state,heading,go:async name=>{state.view=name;await render();}};
async function render(){for(const dispose of state.cleanup??[])dispose();state.cleanup=[];const generation=++state.generation;document.querySelector('#content').setAttribute('aria-busy','true');try{await selectViewRole(state.view,generation);if(generation!==state.generation)return;if(state.view==='overview')await overview(context);else if(state.view==='reception')reception(context);else if(state.view==='settings')await hotelSettings(context);else if(state.view==='rooms')await rooms();else if(state.view==='breakfast')await breakfastList(context);else if(['breakfast-new','breakfast-edit'].includes(state.view))await breakfastEditor(context);else if(state.view==='breakfast-detail')await breakfastDetail(context);else if(state.view==='chat')await privateChat(context);else if(state.view==='inventory-cards')await warehouseCards(context);else if(state.view==='inventory-card-new')await warehouseCardForm(context);else if(state.view==='inventory-card-detail')await warehouseCardDetail(context);else if(state.view==='inventory-movements')await warehouseMovements(context);else if(modules[state.view])await recordList(context,state.view);else if(/-(new|edit|detail|submitted)$/.test(state.view)){const [,key,mode]=state.view.match(/^(.+)-(new|edit|detail|submitted)$/);if(!modules[key])throw Error(t('Pohled neexistuje.'));if(mode==='submitted')await recordSubmitted(context,key);else if(mode==='detail')await recordDetail(context,key);else await recordEditor(context,key,mode);}else throw Error(t('Požadovaný pohled neexistuje.'));if(generation===state.generation)document.querySelector('#content').append(el('footer',{},el('span',{},document.querySelector('#content').dataset.view),el('span',{},'KájovoHotel')));}catch(e){if(generation===state.generation)error(e);}finally{if(generation===state.generation)document.querySelector('#content').setAttribute('aria-busy','false');}}

const availableViews=await api('ui-manifest.json');
addEventListener('message',event=>{
 const data=event.data;if(event.source!==parent||event.origin!==location.origin||data?.type!=='CML_SECTION_NAVIGATE'||data.prefix!=='/sections/hotel/')return;
 const declared=availableViews.views.find(view=>view.id===data.id&&view.path===data.path);if(!declared)return;
 const name=new URL(declared.path,location.origin).searchParams.get('view');if(!name)return;
 state.view=name;state.pendingNavigation=true;if(state.initialized)render();
});

parent.postMessage({type:'CML_SECTION_READY',prefix:'/sections/hotel/'},location.origin);
try{state.breakfastDate=await readBreakfastDate();state.identity=await api('identity');setRole(state.identity.active_role);if(!restoreLocale(state.identity)){if(!state.pendingNavigation&&!new URLSearchParams(location.search).has('view'))state.view=state.identity.admin?'overview':state.identity.permissions.includes('housekeeping:read')?'rooms':state.identity.permissions.includes('breakfast:read')?'breakfast':state.identity.permissions.includes('issues:read')?'issues':state.identity.permissions.includes('inventory:read')?'inventory':'chat';state.initialized=true;await render();}}catch(e){document.querySelector('#content').replaceChildren(notice(e.message,'error'));}
