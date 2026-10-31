import {api} from './api.js';
import {el,icon,button,panel,notice} from './ui.js';
const agendas=[['rooms','Pokoje a úklid','housekeeping','Stavy pokojů, pobyty a požadavky'],['breakfast','Snídaně','breakfast','Počty, diety a výdej'],['lostfound','Ztráty a nálezy','lostfound','Evidence nálezů a ztrát'],['issues','Závady','issue','Opravy a průběh řešení'],['inventory','Sklad','inventory','Zásoby a skladové pohyby'],['reports','Hlášení','report','Provozní sdělení']];
const permission={rooms:'housekeeping:read',breakfast:'breakfast:read',lostfound:'lost_found:read',issues:'issues:read',inventory:'inventory:read',reports:'reports:read'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
function agendaCards(ctx,only){return el('div',{class:'hotel-agenda-cards'},agendas.filter(([id])=>(!only||only.includes(id))&&(ctx.state.identity.available_permissions??ctx.state.identity.permissions).includes(permission[id])).map(([id,title,ico,description])=>button([icon(ico),el('div',{},el('strong',{},title),el('p',{},description))],()=>ctx.go(id))));}
export function reception(ctx){
 const main=ctx.heading('hotel.portal.43','Recepce','Rozcestí recepce na nálezy, snídaně a hlášení; jednotlivé karty otevřou plné pracovní pohledy.');
 main.append(panel('Pracovní agendy recepce',agendaCards(ctx,['lostfound','breakfast','reports']),'reception'));
}
export async function overview(ctx){
 const generation=ctx.state.generation,main=ctx.heading(ctx.state.identity.admin?'hotel.admin.4':'hotel.portal.42',ctx.state.identity.admin?'Hotel · přehled správce':'Hotel · provozní přehled','Provozní souhrn a dostupné pracovní agendy.');
 const read=(permission,path)=>{const identity=ctx.state.identity,role=identity.permissions.includes(permission)?identity.active_role:identity.roles.find(role=>identity.role_permissions?.[role]?.includes(permission));if(!role)throw Error('Oprávnění není dostupné.');return api(path,{roleOverride:role});};
 const day=today(),next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const specs=[
  {label:'Snídaně dnes',ico:'breakfast',permission:'breakfast:read',read:async()=>{const [now,tomorrow]=await Promise.all([read('breakfast:read','api/v1/breakfast/daily-summary?service_date='+day),read('breakfast:read','api/v1/breakfast/daily-summary?service_date='+next.toISOString().slice(0,10))]);return [now.total_guests,'Zítra: '+tomorrow.total_guests];}},
  {label:'Neopravené závady',ico:'issue',permission:'issues:read',read:async()=>[(await read('issues:read','api/v1/issues')).filter(r=>['new','in_progress'].includes(r.status)).length,'Aktuálně otevřené závady']},
  {label:'Nezpracované nálezy',ico:'search',permission:'lost_found:read',read:async()=>[(await read('lost_found:read','api/v1/lost-found')).filter(r=>r.status==='new').length,'Čekají na zpracování']},
  {label:'Stav skladu',ico:'inventory',permission:'inventory:read',read:async()=>{const rows=await read('inventory:read','api/v1/inventory'),totals=new Map();for(const row of rows){if(!Number.isSafeInteger(row.current_stock)||row.current_stock<0)throw Error('Skladový stav není ověřený.');totals.set(row.unit,(totals.get(row.unit)??0n)+BigInt(row.current_stock));}return [[...totals].map(([unit,total])=>total+' '+unit).join(' · ')||'0 položek','Položek v evidenci: '+rows.length];}},
 ];
 const applicable=specs.filter(item=>(ctx.state.identity.available_permissions??ctx.state.identity.permissions).includes(item.permission)),results=await Promise.allSettled(applicable.map(s=>s.read()));if(generation!==ctx.state.generation)return;
 main.append(el('div',{class:'hotel-summary-cards'},results.map((result,i)=>el('article',{class:'hotel-summary-card'},el('div',{},applicable[i].label,icon(applicable[i].ico)),el('strong',{},result.status==='fulfilled'?result.value[0]:'Neověřeno'),el('small',{},result.status==='fulfilled'?result.value[1]:'Údaje nejsou dostupné.')))),panel('Provozní agendy',agendaCards(ctx),'hotel'));
 try{const conversations=await api('api/v1/chat/conversations');if(generation!==ctx.state.generation)return;const unread=conversations.reduce((sum,c)=>sum+c.unread_count,0);main.append(panel('Soukromé zprávy',[notice(unread?'Nepřečtené zprávy: '+unread:'Žádné nepřečtené zprávy.'),button([icon('eye'),'Otevřít zprávy'],()=>ctx.go('chat'))],'chat'));}
 catch(error){if(generation===ctx.state.generation)main.append(panel('Soukromé zprávy',[notice('Stav zpráv není dostupný.','warning'),button('Otevřít zprávy',()=>ctx.go('chat'))],'chat'));}
}
