import {t,locale} from './i18n.js';
import {el} from './ui.js';

export const roomOrder = ['101','102','103','104','105','106','107','108','109','203','204','205','206','207','208','301','302','303','304','305','306','307','308','309','310','221','222','223','224','321','322','323','324','201','202','209','210'];
export const reservationLabels = {confirmed:t('Potvrzeno'),checked_in:'CHECK-IN',checked_out:'CHECK-OUT',option:t('Opce')};
export function orderedRooms(rooms) {
 return [...rooms].sort((a,b) => (roomOrder.indexOf(a.room_number)<0?roomOrder.length:roomOrder.indexOf(a.room_number))-(roomOrder.indexOf(b.room_number)<0?roomOrder.length:roomOrder.indexOf(b.room_number)) || a.room_number.localeCompare(b.room_number,'cs',{numeric:true}));
}
export function guestName(stay) {
 return [...(stay.guests??[]).map(guest=>guest.name),stay.main_guest_name,stay.company_name,stay.display_name].find(name=>typeof name==='string'&&name.trim())?.trim()??'?';
}
export function nightCount(stay,date) {
 const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?Date.parse(value+'T00:00:00Z')/86400000:NaN;
 const start=day(stay.arrival),end=day(stay.departure),selected=day(date),length=end-start;
 return Number.isInteger(length)&&length>=0&&Number.isFinite(selected)?Math.max(0,Math.min(length,selected-start))+'/'+length:'?/?';
}
export const prepared=(stay,kind)=>(stay.amenities??[]).some(item=>item.kind===kind&&item.active===true&&item.state==='green');
function svg(attrs,...children) {
 const node=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [name,value]of Object.entries(attrs))node.setAttribute(name,value);
 for(const [tag,attributes]of children){const child=document.createElementNS(node.namespaceURI,tag);for(const [name,value]of Object.entries(attributes))child.setAttribute(name,value);node.append(child);}
 return node;
}
function person(kind) {
 return el('img',{src:'/sections/hotel/room-artwork/'+kind+'.svg',class:'room-person',alt:'',width:7,height:11});
}
export function requirementIcon(stay,kind) {
 const state=prepared(stay,kind)?'green':'red';
 return el('img',{src:'/sections/hotel/room-artwork/'+kind+'-'+state+'.svg',class:'room-requirement','data-request-kind':kind,'data-request-state':state,alt:'',width:10,height:12});
}
function country(stay) {
 const code=(stay.country_code??'').toUpperCase();let name=stay.country_name||'?';
 try{if(/^[A-Z]{2}$/.test(code))name=new Intl.DisplayNames([locale],{type:'region'}).of(code);}catch{}
 return el('span',{class:'room-country',title:name,'aria-label':name},/^[A-Z]{2}$/.test(code)?el('img',{src:'/sections/hotel/flags/'+code+'.svg',alt:'',width:13,height:9,onerror:event=>{event.target.replaceWith(document.createTextNode('?'));}}):'?');
}
function stamp(stay,kind,date) {
 const name=guestName(stay),nights=nightCount(stay,date),label=kind==='departure'?'CHECK-OUT':kind==='arrival'?'CHECK-IN':t('POBYT'),time=kind==='departure'?stay.departure_time:stay.arrival_time;
 const people=el('span',{class:'room-people'},...['adults','children','infants'].map((key,index)=>el('span',{'data-age-group':key,title:[t('Dospělí'),t('Děti 2–17 let'),t('Mimina do 2 let')][index]+': '+(stay[key]??'?'),style:'--digits:'+String(stay[key]??'?').length},person(key),el('b',{},stay[key]??'?'))));
 const dogs=stay.dog_count,requests=el('span',{class:'room-requests'},
  el('span',{class:'room-dog',title:t('Pes: ')+(dogs??'?')},dogs==null?'?':dogs>0?[requirementIcon(stay,'dog'),el('b',{style:'--digits:'+String('×'+dogs).length},'×'+dogs)]:null),
  el('span',{class:'room-cot',title:t('Dětská postýlka')},stay.cot_required==null?'?':stay.cot_required?requirementIcon(stay,'cot'):null),
  el('span',{class:'room-note'},stay.housekeeping_note?.trim()?el('b',{title:t('Poznámka pro pokojskou'),'aria-label':t('Poznámka pro pokojskou')},'!'):null));
 return el('span',{class:'room-stamp reservation-'+stay.reservation_state,'data-reservation-id':stay.reservation_id,'data-stay-kind':kind},
  el('span',{class:'room-identity'},el('b',{class:'room-guest',title:(stay.guests??[]).map(g=>g.name?.trim()).filter(Boolean).join(', ')||name},name),country(stay)),people,
  el('span',{class:'room-event',title:label+(kind==='stay'?'':' '+(time??'?'))+' · Noc pobytu: '+nights},el('b',{class:'room-time'},kind==='stay'?'':(kind==='departure'?'←':'→')+(time??'?')),el('b',{class:'room-nights',style:'--digits:'+nights.length},nights)),requests);
}
export function roomTile(room,date,onSelect,statusLabel) {
 const continuing=!(room.departures??[]).length&&!(room.arrivals??[]).length&&(room.stays??[]).length>0;
 const groups=continuing?[['stay',room.stays]]:[['departure',room.departures??[]],['arrival',room.arrivals??[]]];
 const stays=groups.flatMap(([,items])=>items),blocks=room.blocks??[];
 const tile=el('button',{type:'button',class:'room-tile room-reference'+(continuing?' room-continuing':''),'data-room-id':room.room_id,onclick:()=>onSelect(room),
  'aria-label':t('Pokoj ')+room.room_number+', '+statusLabel+'. '+(room.occupied==null?t('Obsazenost není známá'):room.occupied?t('Obsazeno'):t('Volno'))+'. '+stays.map(stay=>guestName(stay)+', '+(reservationLabels[stay.reservation_state]??t('Neurčený stav rezervace'))+', '+stay.persons+' osob').join('; ')+(stays.some(stay=>stay.housekeeping_note?.trim())?t('. Poznámka pro pokojskou'):'')+(blocks.length?t('. Blokace pokoje / zastavení prodeje'):'')+t('. Změnit stav pokoje.')},
  el('span',{class:'room-top cleaning-'+(room.housekeeping_status_key??'unknown'),title:statusLabel},el('strong',{},room.room_number)));
 const body=el('span',{class:'room-body'});
 for(const [kind,items]of groups){
  const valid=items.length===1&&reservationLabels[items[0].reservation_state];
  body.append(el('span',{class:'room-slot reservation-'+(valid?items[0].reservation_state:'unknown')},valid?stamp(items[0],kind,date):items.length?el('span',{class:'room-conflict'},items.length>1?t('Více rezervací'):t('Neurčený stav rezervace')):null));
 }
 if(continuing&&room.stays.length===1&&reservationLabels[room.stays[0].reservation_state])body.append(el('span',{class:'room-stay-label reservation-'+room.stays[0].reservation_state},el('b',{},t('POBYT'))));
 if(!continuing){
  const coverage=['left','right'].filter(side=>!(side==='left'?(room.departures??[]):(room.arrivals??[])).length&&blocks.some(block=>block.coverage==='full'||block.coverage===side));
  for(const side of coverage.length===2&&blocks.some(block=>block.coverage==='full')?['full']:coverage)body.append(svg({viewBox:'0 0 100 100',preserveAspectRatio:'none',class:'room-block room-block-'+side,'data-block-coverage':side,role:'img','aria-label':t('Blokace pokoje / zastavení prodeje')},['path',{d:'M3 3L97 97M97 3L3 97'}]));
 }
 tile.append(body);return tile;
}
