import {t,locale} from './i18n.js';
import {api} from './api.js';
import {el,icon,button,panel,notice} from './ui.js';
const agendas=[['rooms',t('Pokoje a úklid'),'housekeeping',t('Stavy pokojů, pobyty a požadavky')],['breakfast',t('Snídaně'),'breakfast',t('Počty, diety a výdej')],['lostfound',t('Ztráty a nálezy'),'lostfound',t('Evidence nálezů a ztrát')],['issues',t('Závady'),'issue',t('Opravy a průběh řešení')],['inventory',t('Sklad'),'inventory',t('Zásoby a skladové pohyby')],['reports',t('Hlášení'),'report',t('Provozní sdělení')]];
const permission={rooms:'housekeeping:read',breakfast:'breakfast:read',lostfound:'lost_found:read',issues:'issues:read',inventory:'inventory:read',reports:'reports:read'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
function agendaCards(ctx,only){return el('div',{class:'hotel-agenda-cards'},agendas.filter(([id])=>(!only||only.includes(id))&&(ctx.state.identity.available_permissions??ctx.state.identity.permissions).includes(permission[id])).map(([id,title,ico,description])=>button([icon(ico),el('div',{},el('strong',{},title),el('p',{},description))],()=>ctx.go(id))));}
export function reception(ctx){
 const main=ctx.heading('hotel.portal.43',t('Recepce'),t('Rozcestí recepce na nálezy, snídaně a hlášení; jednotlivé karty otevřou plné pracovní pohledy.'));
 main.append(panel(t('Pracovní agendy recepce'),agendaCards(ctx,['lostfound','breakfast','reports']),'reception'));
}
export async function overview(ctx){
 const generation=ctx.state.generation,main=ctx.heading(ctx.state.identity.admin?'hotel.admin.4':'hotel.portal.42',ctx.state.identity.admin?t('Hotel · přehled správce'):t('Hotel · provozní přehled'),t('Provozní souhrn a dostupné pracovní agendy.'));
 const read=(permission,path)=>{const identity=ctx.state.identity,role=identity.permissions.includes(permission)?identity.active_role:identity.roles.find(role=>identity.role_permissions?.[role]?.includes(permission));if(!role)throw Error(t('Oprávnění není dostupné.'));return api(path,{roleOverride:role});};
 const day=today(),next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const specs=[
  {label:t('Snídaně dnes'),ico:'breakfast',permission:'breakfast:read',read:async()=>{const [now,tomorrow]=await Promise.all([read('breakfast:read','api/v1/breakfast/daily-summary?service_date='+day),read('breakfast:read','api/v1/breakfast/daily-summary?service_date='+next.toISOString().slice(0,10))]);return [now.total_guests,t('Zítra: ')+tomorrow.total_guests];}},
  {label:t('Neopravené závady'),ico:'issue',permission:'issues:read',read:async()=>[(await read('issues:read','api/v1/issues')).filter(r=>['new','in_progress'].includes(r.status)).length,t('Aktuálně otevřené závady')]},
  {label:t('Nezpracované nálezy'),ico:'search',permission:'lost_found:read',read:async()=>[(await read('lost_found:read','api/v1/lost-found')).filter(r=>r.status==='new').length,t('Čekají na zpracování')]},
  {label:t('Stav skladu'),ico:'inventory',permission:'inventory:read',read:async()=>{const rows=await read('inventory:read','api/v1/inventory'),totals=new Map();for(const row of rows){if(!Number.isSafeInteger(row.current_stock)||row.current_stock<0)throw Error(t('Skladový stav není ověřený.'));totals.set(row.unit,(totals.get(row.unit)??0n)+BigInt(row.current_stock));}return [[...totals].map(([unit,total])=>total+' '+unit).join(' · ')||t('0 položek'),t('Položek v evidenci: ')+rows.length];}},
 ];
 const applicable=specs.filter(item=>(ctx.state.identity.available_permissions??ctx.state.identity.permissions).includes(item.permission)),results=await Promise.allSettled(applicable.map(s=>s.read()));if(generation!==ctx.state.generation)return;
 main.append(el('div',{class:'hotel-summary-cards'},results.map((result,i)=>el('article',{class:'hotel-summary-card'},el('div',{},applicable[i].label,icon(applicable[i].ico)),el('strong',{},result.status==='fulfilled'?result.value[0]:t('Neověřeno')),el('small',{},result.status==='fulfilled'?result.value[1]:t('Údaje nejsou dostupné.'))))),panel(t('Provozní agendy'),agendaCards(ctx),'hotel'));
 try{const conversations=await api('api/v1/chat/conversations');if(generation!==ctx.state.generation)return;const unread=conversations.reduce((sum,c)=>sum+c.unread_count,0);main.append(panel(t('Soukromé zprávy'),[notice(unread?t('Nepřečtené zprávy: ')+unread:t('Žádné nepřečtené zprávy.')),button([icon('eye'),t('Otevřít zprávy')],()=>ctx.go('chat'))],'chat'));}
 catch(error){if(generation===ctx.state.generation)main.append(panel(t('Soukromé zprávy'),[notice(t('Stav zpráv není dostupný.'),'warning'),button(t('Otevřít zprávy'),()=>ctx.go('chat'))],'chat'));}
}
