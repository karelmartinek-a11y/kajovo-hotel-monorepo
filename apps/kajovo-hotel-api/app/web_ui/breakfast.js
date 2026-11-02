import {t,locale} from './i18n.js';
import {api,getRole,exportLink} from './api.js';
import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {saveMutation} from './operations.js';
import {writeBreakfastDate} from './preferences.js';
const labels={pending:t('Čeká na výdej'),preparing:t('Připravuje se'),served:t('Vydáno'),cancelled:t('Zrušeno')};
const diets=[['diet_no_gluten',t('Bez lepku'),'diet-gluten'],['diet_no_milk',t('Bez laktózy'),'diet-lactose'],['diet_no_pork',t('Bez vepřového'),'diet-pork']];
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
const manager=ctx=>['admin','recepce'].includes(ctx.state.identity.active_role);
const ref=(ctx,admin,member)=>ctx.state.identity.admin?admin:member;
const readableDate=value=>new Date(value+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'Europe/Prague'});
const country=value=>{if(!value)return t('Neuvedeno');try{return new Intl.DisplayNames([locale],{type:'region'}).of(value.toUpperCase());}catch{return value;}};
function move(ctx,mode,row){ctx.state.breakfastId=row?.id??null;return ctx.go(mode==='list'?'breakfast':'breakfast-'+mode);}
function dateNavigation(ctx){
 const input=field(t('Datum'),'breakfast-date','date',ctx.state.breakfastDate,{required:true});
 const change=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day){showError(document.querySelector('#content'),Error(t('Vyberte platné datum.')));return false;}ctx.state.breakfastDate=day;void writeBreakfastDate(day);ctx.go('breakfast');};
 const offset=delta=>{const day=new Date(ctx.state.breakfastDate+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+delta);change(day.toISOString().slice(0,10));};
 const previous=button(icon('arrow-left'),()=>offset(-1)),next=button(icon('arrow-right'),()=>offset(1));previous.setAttribute('aria-label',t('Předchozí den'));next.setAttribute('aria-label',t('Další den'));
 input.querySelector('input').addEventListener('change',event=>{if(change(event.target.value)===false)event.target.value=ctx.state.breakfastDate;});
 return el('div',{class:'breakfast-date-bar'},el('div',{class:'actions'},previous,el('strong',{},new Date(ctx.state.breakfastDate+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'Europe/Prague',day:'numeric',month:'long',year:'numeric'})),next,button([icon('arrow-right'),t('Dnes')],()=>change(today()))),input);
}
function mark(ctx,order,status,container){
 container.dataset.nativeRole=getRole();
 return saveMutation(container,{path:'api/v1/breakfast/'+order.id,method:'PUT',body:{status,expected_updated_at:order.updated_at},verify:async(result,{read})=>{if(result.id!==order.id||result.status!==status)throw Error(t('Původní výsledek nepotvrzuje požadovaný stav.'));const actual=await read('api/v1/breakfast/'+order.id);if(actual.status!==status)throw Error(t('Stav snídaně se mezitím změnil. Načtěte jej znovu.'));},done:()=>ctx.state.view==='breakfast'?ctx.go('breakfast'):undefined});
}
function dietControls(ctx,order){
 const box=el('div',{class:'breakfast-diets'});box.dataset.nativeRole=getRole();
 if(!order.reservations.length){box.append(el('span',{},diets.filter(([key])=>order[key]).map(([,label])=>label).join(' · ')||t('Bez evidované diety')),el('small',{},t('Bez ověřené vazby na pobyt.')));return box;}
 for(const stay of order.reservations){
  const controls=el('div',{class:'breakfast-stay-diets'});controls.dataset.nativeRole=getRole();
  for(const [kind,title,ico] of diets){const action=button([icon(ico),title],()=>saveMutation(controls,{path:'api/v1/breakfast/'+order.id+'/reservations/'+encodeURIComponent(stay.reservation_id)+'/diet',method:'PATCH',body:{kind,enabled:!stay[kind],version:stay.version},verify:async(result,{read})=>{const returned=result.reservations.find(r=>r.reservation_id===stay.reservation_id);if(!returned||returned[kind]!==!stay[kind])throw Error(t('Odpověď nepotvrdila změnu diety konkrétního pobytu.'));const actual=await read('api/v1/breakfast/'+order.id),saved=actual.reservations.find(r=>r.reservation_id===stay.reservation_id);if(!saved||saved[kind]!==!stay[kind]||saved.version<returned.version)throw Error(t('Dieta pobytu nebyla potvrzena následným načtením.'));},done:()=>ctx.state.view==='breakfast'?ctx.go('breakfast'):undefined}));action.disabled=!manager(ctx);action.setAttribute('aria-pressed',String(stay[kind]));controls.append(action);}
  box.append(controls,el('small',{},(stay.guest_name??t('Pobyt'))+(stay.arrival&&stay.departure?' · '+readableDate(stay.arrival)+' – '+readableDate(stay.departure):'')));
 }
 return box;
}
export async function breakfastList(ctx){
 ctx.state.breakfastDate??=today();const day=ctx.state.breakfastDate,generation=ctx.state.generation;
 const main=ctx.heading(ref(ctx,'hotel.admin.6','hotel.portal.46'),t('Snídaně'),t('Zkontrolujte počty, diety jednotlivých pobytů a průběh výdeje snídaní.'));
 const data=await api('api/v1/breakfast/daily-overview?service_date='+day);if(generation!==ctx.state.generation)return;
 let refreshing=false;
 const refresh=async()=>{if(refreshing||document.hidden||document.querySelector('dialog[open]')||generation!==ctx.state.generation||[...main.querySelectorAll('.actions')].some(n=>n.nativeMutation&&!n.nativeMutation.finished))return;refreshing=true;try{const latest=await api('api/v1/breakfast/daily-overview?service_date='+day);if(generation===ctx.state.generation&&JSON.stringify(latest)!==JSON.stringify(data))await ctx.go('breakfast');}catch(error){if(generation===ctx.state.generation)showError(main,error);}finally{refreshing=false;}};
 const refreshTimer=setInterval(refresh,60000);addEventListener('focus',refresh);addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);ctx.state.cleanup.push(()=>{clearInterval(refreshTimer);removeEventListener('focus',refresh);removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);});
 const tools=el('div',{class:'actions'},manager(ctx)?exportLink('api/v1/breakfast/export/daily?service_date='+day,t('Export snídaní (PDF)')):null,manager(ctx)?button([icon('plus'),t('Nový snídaňový záznam')],()=>move(ctx,'new')):null,button([icon('refresh'),t('Obnovit')],()=>ctx.go('breakfast')),manager(ctx)?button([icon('menu'),t('Další operace')],()=>breakfastManagement(ctx)):null);
 main.append(panel(t('Denní přehled snídaní'),[dateNavigation(ctx),tools],'breakfast'));
 const tiles=el('div',{class:'breakfast-serving-tiles'});
 const rows=data.orders.filter(order=>ctx.state.identity.active_role!=='snídaně'||order.guest_count>0).sort((a,b)=>a.room_number.localeCompare(b.room_number,'cs',{numeric:true})).map(order=>{
  const makeActions=(compact=false)=>{const actions=el('div',{class:'actions'});actions.dataset.nativeRole=getRole();
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()),canServe=manager(ctx)||ctx.state.identity.active_role==='snídaně'&&day===today()&&time>='05:00'&&time<='11:00';
  if(['pending','preparing'].includes(order.status)){const serve=button(compact||!manager(ctx)?t('Vydat'):[icon('check'),t('Vydat')],()=>mark(ctx,order,'served',actions),'primary');serve.disabled=!canServe;actions.append(serve);if(!canServe)serve.title=t('Výdej dnes 5:00–11:00.');}
  else if(order.status==='served'&&manager(ctx))actions.append(button([icon('undo'),t('Vrátit výdej')],()=>mark(ctx,order,'pending',actions)));
  else {const unavailable=button(labels[order.status]??t('Neznámý stav'),()=>{},'secondary');unavailable.disabled=true;actions.append(unavailable);}
  return actions;};const actions=makeActions(true);
  const stays=order.reservations??[],companies=[...new Set(stays.map(r=>r.company_name?.trim()).filter(Boolean))];
  const counts=['breakfast_adults','breakfast_children_0_2','breakfast_children_3_17','breakfast_age_unknown'].map(key=>stays.reduce((sum,r)=>sum+(r[key]??0),0));
  const nights=stays.filter(r=>r.arrival&&r.departure).map(r=>{const start=Date.parse(r.arrival+'T00:00:00Z')/86400000,end=Date.parse(r.departure+'T00:00:00Z')/86400000,now=Date.parse(day+'T00:00:00Z')/86400000;return Math.max(0,Math.min(end-start,now-start))+'/'+(end-start)+t(' nocí');});
  const active=el('span',{class:'breakfast-tile-diets'},diets.filter(([key])=>order[key]).map(([key,title])=>el('span',{title,'aria-label':title},el('img',{src:'/sections/hotel/breakfast-artwork/'+({diet_no_gluten:'no-gluten',diet_no_milk:'no-milk',diet_no_pork:'no-pork'}[key])+'.png',alt:'',class:'breakfast-diet-art'}))));
  const tile=el('article',{class:'breakfast-serving-tile'+(order.status==='served'?' served':''),'data-room-number':order.room_number},
   el('div',{class:'breakfast-tile-header'},el('strong',{class:'breakfast-tile-room'},order.room_number),companies.length?el('span',{class:'breakfast-tile-company'},t('Firma: ')+companies.join(', ')):el('span'),active),
   el('div',{class:'breakfast-tile-body'},el('strong',{class:'breakfast-tile-guest'},order.guest_names||order.guest_name||t('Pokoj ')+order.room_number),el('span',{},order.country_code?country(order.country_code):'—'),nights.length?el('span',{class:'breakfast-tile-nights'},nights.join(' · ')):null,
    el('span',{class:'breakfast-tile-count'},t('Snídaní: ')+order.guest_count+t(' · Dospělí: ')+counts[0]+' · 0–2 roky: '+counts[1]+' · 3–17 let: '+counts[2]+(counts[3]?t(' · Věk neuveden: ')+counts[3]:'')),order.note?el('span',{class:'breakfast-tile-note',title:order.note},order.note):null,el('div',{class:'breakfast-tile-action'},actions)));
  if(manager(ctx))tile.append(el('details',{},el('summary',{},t('Diety pobytu')),dietControls(ctx,order)));
  if(order.guest_count>0)tiles.append(tile);
  // Separate controls retain the original table on larger screens.
  const desktopActions=makeActions();
  return [button(el('strong',{},order.room_number),()=>move(ctx,'detail',order),'breakfast-room-link'),order.guest_names||order.guest_name||t('Pokoj ')+order.room_number,order.country_code?country(order.country_code):'—',order.guest_count,manager(ctx)?dietControls(ctx,order):active.cloneNode(true),order.note?el('span',{class:'breakfast-note'},icon('warning'),order.note):'—',desktopActions];
 });
 const orders=panel(t('Snídaně a diety pobytů'),table([t('Pokoj'),t('Ubytovaní'),t('Národnost'),t('Snídaní'),t('Diety'),t('Poznámka'),t('Akce')],rows),'breakfast');orders.classList.add('breakfast-orders');orders.querySelector('.panel-body').append(tiles);main.append(orders);
 const served=data.orders.filter(row=>row.status==='served').reduce((sum,row)=>sum+row.guest_count,0),remaining=data.orders.filter(row=>['pending','preparing'].includes(row.status)).reduce((sum,row)=>sum+row.guest_count,0);
 main.append(el('div',{class:'breakfast-metrics'},[[t('Snídaní celkem'),data.summary.total_guests,t('Porce v denním přehledu'),'coffee'],[t('Vydáno'),served,t('Potvrzené porce'),'check'],[t('Zbývá vydat'),remaining,t('Dosud nevydané porce'),'clock']].map(([title,value,description,ico])=>el('article',{class:'hotel-summary-card'},el('div',{},title,icon(ico)),el('strong',{},value),el('small',{},description)))),el('p',{},t('Poslední zdrojová synchronizace: ')+(data.summary.source_imported_at?new Date(data.summary.source_imported_at).toLocaleString(locale,{hourCycle:'h23',timeZone:'Europe/Prague'}):t('neuvedena'))+t('. Diety se mění podle konkrétního pobytu.')));
}
export async function breakfastEditor(ctx){
 const mode=ctx.state.view==='breakfast-new'?'new':'edit',key=mode+':'+(ctx.state.breakfastId??'new');ctx.state.breakfastDrafts??=new Map();
 const id=mode==='new'?ref(ctx,'hotel.admin.7','hotel.portal.47'):ref(ctx,'hotel.admin.9','hotel.portal.49'),title=mode==='new'?t('Nový snídaňový záznam'):t('Upravit snídaňový záznam');
 const main=ctx.heading(id,title,t('Zadejte datum služby, pokoj, hosta a počet porcí. Diety se mění samostatně u ověřeného pobytu.'));
 if(!manager(ctx)){main.append(notice(t('Plánování snídaní je dostupné pouze recepci a správci.'),'warning'),button(t('Zpět na seznam'),()=>move(ctx,'list')));return;}
 let draft=ctx.state.breakfastDrafts.get(key);
 if(!draft){
  const generation=ctx.state.generation,row=mode==='edit'?await api('api/v1/breakfast/'+ctx.state.breakfastId):null;if(generation!==ctx.state.generation)return;
  const form=el('form',{class:'record-form'},el('div',{class:'form-grid'},field(t('Datum služby'),'service_date','date',row?.service_date??ctx.state.breakfastDate??today(),{required:true}),field(t('Pokoj'),'room_number','text',row?.room_number??'',{required:true,maxlength:32}),field(t('Host'),'guest_name','text',row?.guest_name??'',{required:true,maxlength:255}),field(t('Počet hostů'),'guest_count','number',row?.guest_count??1,{required:true,min:1,max:20,step:1}),select(t('Stav'),'status',Object.entries(labels),row?.status??'pending')),el('div',{class:'form-actions actions'},button([icon('close'),t('Zrušit')],()=>{ctx.state.breakfastDrafts.delete(key);move(ctx,'list');}),el('button',{type:'submit',class:'primary'},icon('save'),t('Uložit'))));
  form.dataset.nativeRole=getRole();draft={form,row};ctx.state.breakfastDrafts.set(key,draft);
  form.addEventListener('submit',event=>{
   event.preventDefault();const values=formData(form),count=Number(values.guest_count);if(!Number.isSafeInteger(count)||count<1||count>20){showError(form,Error(t('Počet hostů musí být celé číslo od 1 do 20.')));return;}
   const payload={service_date:values.service_date,room_number:values.room_number,guest_name:values.guest_name,guest_count:count,status:values.status,...(row?{expected_updated_at:row.updated_at}:{})};
   saveMutation(form,{path:'api/v1/breakfast'+(row?'/'+row.id:''),method:row?'PUT':'POST',body:payload,verify:async(result,{read})=>{if(!result?.id)throw Error(t('Chybí identita uložené snídaně.'));const actual=await read('api/v1/breakfast/'+result.id);for(const field of ['service_date','room_number','guest_name','guest_count','status'])if(actual[field]!==payload[field])throw Error(t('Následné načtení nepotvrdilo údaj: ')+field);},done:async result=>{ctx.state.breakfastDrafts.delete(key);if(ctx.state.view==='breakfast-'+mode)await move(ctx,'detail',result);}});
  });
 }
 main.append(panel(title,[button([icon('arrow-left'),t('Zpět na seznam')],()=>move(ctx,'list')),draft.form],'breakfast'));
}
export async function breakfastDetail(ctx){
 const generation=ctx.state.generation,main=ctx.heading(ref(ctx,'hotel.admin.8','hotel.portal.48'),t('Detail snídaně'),t('Projděte uložené údaje, stav a oprávněné akce konkrétní snídaně.'));
 const row=await api('api/v1/breakfast/'+ctx.state.breakfastId);if(generation!==ctx.state.generation)return;
 const details=el('div',{class:'breakfast-details'},[[t('Datum služby'),readableDate(row.service_date)],[t('Pokoj'),row.room_number],[t('Host'),row.guest_names||row.guest_name],[t('Počet hostů'),row.guest_count],[t('Stav'),labels[row.status]??t('Neznámý stav')],[t('Diety'),diets.filter(([key])=>row[key]).map(([,label])=>label).join(' · ')||t('Bez evidované diety')]].map(([title,value])=>el('div',{},el('small',{},title),el('strong',{},value))));
 main.append(panel(t('Detail snídaně'),[details,row.note?notice(row.note,'warning'):null,el('div',{class:'actions'},button([icon('arrow-left'),t('Zpět na seznam')],()=>move(ctx,'list')),manager(ctx)?button([icon('edit'),t('Upravit')],()=>move(ctx,'edit',row)):null,manager(ctx)?button([icon('trash'),t('Odstranit')],()=>breakfastDelete(ctx,row),'danger'):null)],'breakfast'));
}

function breakfastDelete(ctx,row){
 modal(t('Smazat snídaňový záznam'),close=>{
  const content=el('div',{},notice(readableDate(row.service_date)+' · pokoj '+row.room_number+' · '+row.guest_name+t('. Smazání nelze automaticky vrátit.'),'warning'));
  content.append(button([icon('trash'),t('Smazat tento snídaňový záznam')],()=>saveMutation(content,{path:'api/v1/breakfast/'+row.id,method:'DELETE',verify:async(_,{read})=>{try{await read('api/v1/breakfast/'+row.id);}catch(error){if(error.status===404)return;throw error;}throw Error(t('Záznam stále existuje.'));},done:async()=>{close();if(ctx.state.view==='breakfast-detail'&&ctx.state.breakfastId===row.id)await move(ctx,'list');}}),'danger'));return content;
 },{id:'hotel.breakfast.delete'});
}
function breakfastManagement(ctx){
 const day=ctx.state.breakfastDate,admin=ctx.state.identity.active_role==='admin',nativeRole=getRole();
 modal(t('Správa snídaní'),close=>{
  const content=el('div',{},notice(t('Pracovní den ')+readableDate(day)+t('. Hromadné změny se provedou pouze příslušným tlačítkem.')));
  const refresh=async()=>{close();if(ctx.state.view==='breakfast')await ctx.go('breakfast');};
  if(admin)content.append(button(t('Vrátit všechny vydané snídaně dne'),()=>saveMutation(content,{path:'api/v1/breakfast/reactivate-all?service_date='+day,verify:async(_,{read})=>{const orders=await read('api/v1/breakfast?service_date='+day);if(orders.some(order=>order.status==='served'))throw Error(t('Některá snídaně je znovu evidována jako vydaná. Načtěte aktuální údaje.'));},done:refresh})));
  content.append(button([icon('trash'),t('Smazat snídaně vybraného dne')],()=>{
   close();modal(t('Smazat snídaně vybraného dne'),end=>{const box=el('div',{},notice(t('Odstraní se snídaňové záznamy dne ')+readableDate(day)+t('. Smazání nelze automaticky vrátit.'),'warning'));box.dataset.nativeRole=nativeRole;box.append(button(t('Smazat všechny snídaně dne'),()=>saveMutation(box,{path:'api/v1/breakfast/day/delete?service_date='+day,method:'DELETE',verify:async(_,{read})=>{if((await read('api/v1/breakfast?service_date='+day)).length)throw Error(t('Původní API stále vrací snídaně vybraného dne.'));},done:async()=>{end();if(ctx.state.view==='breakfast')await ctx.go('breakfast');}}),'danger'));return box;},{id:'hotel.breakfast.day-delete'});
  },'danger'));
  if(admin){
   const form=el('form',{class:'record-form'},el('h3',{},t('Smazat období')),el('div',{class:'form-grid'},field(t('První den období'),'date_from','date',day,{required:true}),field(t('Poslední den období'),'date_to','date',day,{required:true})),notice(t('Smažou se snídaňové záznamy od prvního do posledního dne včetně. Smazání nelze automaticky vrátit.'),'warning'),el('button',{type:'submit',class:'danger'},icon('trash'),t('Smazat snídaně v období')));form.dataset.nativeRole=getRole();
   form.addEventListener('submit',event=>{event.preventDefault();const values=formData(form);if(values.date_from>values.date_to){showError(form,Error(t('První den nesmí být po posledním dni.')));return;}saveMutation(form,{path:'api/v1/breakfast/period/delete?'+new URLSearchParams(values),method:'DELETE',verify:async(_,{read})=>{const orders=await read('api/v1/breakfast');if(orders.some(order=>order.service_date>=values.date_from&&order.service_date<=values.date_to))throw Error(t('Původní API stále vrací snídaně z tohoto období.'));},done:refresh});});content.append(form);
  }
  return content;
 },{id:'hotel.breakfast.manage'});
}
