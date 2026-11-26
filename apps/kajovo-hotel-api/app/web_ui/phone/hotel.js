import {card,element,facts,inputField,moveDay,options,today} from './controls.js';
import {records} from './records.js';
import {rooms} from './rooms.js';
import {breakfast} from './breakfast.js';
import {warehouse} from './warehouse.js';
import {setLocale,text} from './locale.js';
import {commit,prefix,request} from './transport.js';

const navigation = document.querySelector('nav');
const agendas = document.querySelector('#agendas');
const workspace = document.querySelector('#work');
const notification = document.querySelector('#feedback');
const preferences = document.querySelector('#preferences');
const agendaData = new Map([
  ['overview','Přehled'],['rooms','Pokoje'],['breakfast','Snídaně'],['issues','Závady'],
  ['lostfound','Ztráty a nálezy'],['inventory','Sklad snídaně'],['inventory-drogerie','Sklad drogerie'],
]);
const allowedId = raw=>/^[1-9]\d{0,9}$/.test(raw??'')&&Number(raw)<=2147483647?Number(raw):null;
const languages = {cs:'Čeština',en:'English',uk:'Українська'};
const submissions = new Map();
const days = {rooms:today(),breakfast:today()};
let identity;
let manifest;
let latest;
let current;

function notify(message = '') {
  notification.textContent = message;
}

function guarded(task) {
  return async (...parameters)=>{
    try {await task(...parameters);}
    catch(error) {if(error.name!=='AbortError') notify(error.message);}
  };
}

const routeOf = entry=>new URL(entry.path,location.origin).searchParams.get('view');
const localized = entry=>entry?.localizations?.[identity.preferred_locale]?.title ?? entry?.title;
const has = permission=>identity.permissions.includes(permission);
const read = (path,settings)=>request(path,{...settings,role:identity.active_role});
const updateEntry = async ()=>{
  manifest = await read('ui-manifest.json');
};

function url(view,id) {
  const query=new URLSearchParams({ui:'phone',view});
  if (id) query.set('id',id);
  return prefix+'?'+query;
}

async function go(view,id) {
  if (workspace.querySelector('[data-pending]') || document.querySelector('dialog [data-pending]')) {
    notify('Nejdřív ověřte původní výsledek zápisu.');
    return;
  }
  agendas.open = false;
  history.pushState(null,'',url(view,id));
  await render();
}

function navLink(view,label,id) {
  const link = element('a',{href:url(view,id),'aria-current':current.view===view?'page':null},label);
  link.addEventListener('click',guarded(async event=>{
    if (event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await go(view,id);
  }));
  return link;
}

function drawPreferences() {
  setLocale(identity.preferred_locale);
  preferences.replaceChildren();
  if (identity.languages.length>1) {
    const menu=options(identity.languages.map(language=>[language,languages[language]]),identity.preferred_locale);
    const setting=element('div',{},inputField('Jazyk',menu));
    menu.addEventListener('change',guarded(async()=>{
      const locale=menu.value;
      await commit(setting,{
        path:'api/auth/locale',method:'PATCH',body:{locale},read,
        verify:async()=>{
          const currentIdentity = await read('identity');
          if (currentIdentity.preferred_locale!==locale) throw Error('Uložená jazyková volba nepotvrdila změnu.');
          identity = currentIdentity;
        },
        done:async()=>{drawPreferences();await render();},
      });
    }));
    preferences.append(setting);
  }
  if (!identity.cml_modules && identity.roles.length>1) {
    const chooser=options(identity.roles.map(role=>[role,role]),identity.active_role);
    chooser.addEventListener('change',guarded(async()=>{
      try {
        identity = await request('identity',{role:chooser.value});
        await updateEntry();
        await render();
      } finally {chooser.value=identity.active_role;}
    }));
    preferences.append(inputField('Pracovní role',chooser));
  }
}

function renderNav() {
  const declared = new Map(manifest.views.filter(entry=>entry.navigation!==false).map(entry=>[routeOf(entry),entry]));
  const items = [...agendaData].filter(([view])=>declared.has(view)).map(([view,title])=>[view,localized(declared.get(view))??title]);
  navigation.replaceChildren(...items.map(([view,title])=>navLink(view,title)));
  return items;
}

async function render() {
  latest?.abort();
  const controller=latest=new AbortController();
  const signal=controller.signal;
  const query=new URLSearchParams(location.search);
  const inputView=query.get('view');
  const allowed=manifest.views.some(entry=>routeOf(entry)===inputView);
  const receiptView=/^(issues|lostfound)-submitted$/.exec(inputView??'');
  const visible = new Set(manifest.views.map(routeOf));
  const sequence = identity.admin ? [...agendaData.keys()] :
    ['rooms','breakfast','issues','inventory','inventory-drogerie','lostfound','overview'];
  const start = [...sequence,'issues-new','lostfound-new'].find(view=>visible.has(view));
  const view = allowed || receiptView && submissions.has(receiptView[1])?inputView:start;
  if (!view) throw Error('K účtu není přidělena žádná agenda.');
  const id = allowedId(query.get('id'));
  current={view,id};
  agendas.querySelector('summary').textContent=text('Agendy hotelu');
  navigation.setAttribute('aria-label',text('Agendy hotelu'));
  const choices = renderNav();
  const title = localized(manifest.views.find(entry=>routeOf(entry)===view))??'Uložené potvrzení';
  const heading = element('h1',{tabindex:'-1'},title);
  workspace.replaceChildren(heading);
  notify();
  document.title = title+' · KájovoHotel';
  document.documentElement.lang=identity.preferred_locale;
  const role = identity.active_role;
  const context = {
    identity,has,submissions,start,days,guard:guarded,
    go,signal,
    read:(path,opts={})=>request(path,{...opts,role,signal:['GET','HEAD'].includes(opts.method??'GET')?signal:undefined}),
    blob:data=>{
      const objectURL=URL.createObjectURL(data);
      signal.addEventListener('abort',()=>URL.revokeObjectURL(objectURL),{once:true});
      return objectURL;
    },
    reload:render,
  };
  const section=/^(issues|lostfound)(?:-(new|detail|edit|submitted))?$/.exec(view);
  let content;
  if (section) content = await records(context,section[1],section[2],id);
  else if (/^breakfast(?:-(new|edit|detail))?$/.test(view)) content = await breakfast(context,view.split('-')[1],id);
  else if (view==='inventory'||view.startsWith('inventory-')) content = await warehouse(context,view,id);
  else if (view==='rooms') content = await rooms(context);
  else if (view==='overview') content = await overview(context,choices);
  else throw Error('Pohled se nepodařilo otevřít.');
  if (signal.aborted) return;
  workspace.append(...content);
  window.scrollTo(0,0);
  heading.focus({preventScroll:true});
}

async function overview(context,sections) {
  const date=today();
  const reads=[
    ['Snídaně','breakfast:read',async()=>{
      const summary = day=>context.read('api/v1/breakfast/daily-summary?service_date='+day);
      const [current,next] = await Promise.all([summary(date),summary(moveDay(date,1))]);
      return [['Porcí dnes',current.total_guests],['Porcí zítra',next.total_guests]];
    }],
    ['Neopravené závady','issues:read',async()=>[['Otevřené',(await context.read('api/v1/issues'))
      .filter(item=>['new','in_progress'].includes(item.status)).length]]],
    ['Nezpracované nálezy','lost_found:read',async()=>[['Čeká na zpracování',(await context.read('api/v1/lost-found'))
      .filter(item=>item.status==='new').length]]],
    ...[['snidane','Sklad snídaně'],['drogerie','Sklad drogerie']].map(([warehouse,caption])=>[
      caption,'inventory_'+warehouse+':read',async()=>{
        const rows=await context.read('api/v1/inventory?warehouse='+warehouse);
        const quantities=new Map();
        for(const row of rows) {
          if (!Number.isSafeInteger(row.current_stock)||row.current_stock<0) throw Error('Skladová zásoba vyžaduje ověření.');
          quantities.set(row.unit,(quantities.get(row.unit)??0n)+BigInt(row.current_stock));
        }
        return [['Položek',rows.length],...Array.from(quantities,([unit,amount])=>['Zásoba '+unit,amount.toString()])];
      },
    ]),
  ].filter(([,permission])=>context.has(permission));
  const results=await Promise.allSettled(reads.map(([, ,lookup])=>lookup()));
  return [
    ...results.map((result,index)=>card(reads[index][0],result.status==='fulfilled'?facts(result.value):
      element('p',{},'Provozní údaj se nepodařilo ověřit.'))),
    card('Provozní agendy',element('div',{class:'actions'},...sections.filter(([name])=>name!=='overview')
      .map(([name,label])=>navLink(name,label)))),
  ];
}

window.addEventListener('popstate',guarded(async()=>{
  if (workspace.querySelector('[data-pending]')||document.querySelector('dialog [data-pending]')) {
    history.pushState(null,'',url(current.view,current.id));
    notify('Nejdřív ověřte původní výsledek zápisu.');
    return;
  }
  await render();
}));
void guarded(async()=>{
  identity=await request('identity');
  await updateEntry();
  drawPreferences();
  await render();
})();
