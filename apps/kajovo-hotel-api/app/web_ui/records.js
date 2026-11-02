import {t,locale} from './i18n.js';
import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {api,getRole,exportLink} from './api.js';
import {saveMutation,storedMutation} from './operations.js';
import {inventoryExtras} from './inventory.js';
import {pragueInput,pragueInstant} from './time.js';
import {moduleReference} from './references.js';
import {photoDocumentation,pictogramDocumentation} from './photos.js';
import {warehouseList} from './warehouse.js';
export const modules={
 issues:{path:'issues',title:t('Závady'),id:'hotel.admin.14',member:'hotel.portal.54',newId:'hotel.admin.15',fields:[[t('Název'),'title','text',true],[t('Popis'),'description','textarea'],[t('Umístění'),'location','text',true],[t('Pokoj'),'room_number','text'],[t('Priorita'),'priority',[['low',t('Nízká')],['medium',t('Střední')],['high',t('Vysoká')],['critical',t('Kritická')]]],[t('Stav'),'status',[['new',t('Nová')],['in_progress',t('Řeší se')],['resolved',t('Vyřešeno')],['closed',t('Uzavřeno')]]],[t('Přiřazeno'),'assignee','text']]},
 reports:{path:'reports',title:t('Provozní hlášení'),id:'hotel.admin.22',member:'hotel.portal.62',newId:'hotel.admin.23',fields:[[t('Název'),'title','text',true],[t('Popis'),'description','textarea'],[t('Stav'),'status',[['open',t('Otevřené')],['in_progress',t('Řeší se')],['closed',t('Uzavřené')]]]]},
 lostfound:{path:'lost-found',title:t('Ztráty a nálezy'),id:'hotel.admin.10',member:'hotel.portal.50',newId:'hotel.admin.11',fields:[[t('Typ'),'item_type',[['found',t('Nález')],['lost',t('Ztráta')]]],[t('Popis'),'description','textarea',true],[t('Kategorie'),'category','text',true],[t('Umístění'),'location','text',true],[t('Pokoj'),'room_number','text'],[t('Datum a čas'),'event_at','datetime-local',true],[t('Stav'),'status',[['new',t('Nové')],['stored',t('Uloženo')],['claimed',t('Přihlásil se majitel')],['returned',t('Vráceno')],['disposed',t('Vyřazeno')]]],[t('Majitel'),'claimant_name','text'],[t('Kontakt'),'claimant_contact','text'],[t('Poznámka k předání'),'handover_note','textarea']]},
 inventory:{path:'inventory',title:t('Sklad'),id:'hotel.admin.18',member:'hotel.portal.58',newId:'hotel.admin.19',fields:[[t('Název'),'name','text',true],[t('Jednotka'),'unit',[['ks','ks'],['g','g'],['l','l']]],[t('Minimální zásoba'),'min_stock','number',true],[t('Aktuální zásoba'),'current_stock','number',true],[t('Základních jednotek na kus'),'amount_per_piece_base','number',true]]}
};

const permission=config=>(config.path==='lost-found'?'lost_found':config.path)+':write';
const readPermission=config=>permission(config).replace(':write',':read');
const back=(ctx,key)=>ctx.go(ctx.state.identity.available_permissions.includes(readPermission(modules[key]))?key:ctx.state.identity.available_permissions.includes('housekeeping:read')?'rooms':'chat');
function can(ctx,config,operation){
 if(!ctx.state.identity.permissions.includes(permission(config)))return false;
 const role=ctx.state.identity.active_role;
 if(config.path==='issues')return operation==='new'||operation==='photo'?['admin','pokojská','údržba'].includes(role):operation==='delete'?role==='admin':['admin','údržba'].includes(role);
 if(config.path==='inventory'&&operation==='delete')return role==='admin';
 if(config.path==='lost-found'&&operation==='delete')return role==='admin';
 if(config.path==='lost-found'&&operation==='edit')return role!=='recepce';
 return true;
}
const reference=(ctx,config,kind)=>moduleReference(config.path,kind,ctx.state.identity.admin);
function selected(ctx,key){return ctx.state.recordIds?.get(key);}
function move(ctx,key,mode,row){ctx.state.recordIds??=new Map();if(row)ctx.state.recordIds.set(key,row.id);return ctx.go(key+(mode==='list'?'':'-'+mode));}
function display(config,key,value){const type=config.fields.find(field=>field[1]===key)?.[2];if(Array.isArray(type))return type.find(([id])=>id===value)?.[1]??value??'—';if(key==='event_at'&&value)return new Date(value+(/([Zz]|[+-]\d\d:\d\d)$/.test(value)?'':'Z')).toLocaleString(locale,{hourCycle:'h23',timeZone:'Europe/Prague'});return value??'—';}
export async function recordList(ctx,key){
 if(key==='inventory')return warehouseList(ctx,{newItem:()=>move(ctx,key,'new'),detail:row=>move(ctx,key,'detail',row)});
 const config=modules[key],generation=ctx.state.generation,main=ctx.heading(ctx.state.identity.admin?config.id:config.member,config.title,t('Projděte záznamy a otevřete podrobnosti vybrané položky.'));
 const rows=await api('api/v1/'+config.path);if(generation!==ctx.state.generation)return;
 const search=el('input',{type:'search',placeholder:t('Hledat'),'aria-label':t('Hledat záznam')}),statusField=config.fields.find(field=>field[1]==='status'),status=statusField?select(t('Stav'),'status-filter',[['',t('Všechny stavy')],...statusField[2]],''):null,list=el('div');
 const draw=()=>{const q=search.value.toLocaleLowerCase('cs'),filtered=rows.filter(row=>config.fields.some(([,key])=>String(display(config,key,row[key])).toLocaleLowerCase('cs').includes(q))&&(!status||!status.querySelector('select').value||row.status===status.querySelector('select').value));list.replaceChildren(table([t('Záznam'),t('Umístění / jednotka'),t('Stav / zásoba'),t('Akce')],filtered.map(row=>[row.title??row.name??row.description,row.location??row.unit??'—',display(config,'status',row.current_stock??row.status),button(t('Detail'),()=>move(ctx,key,'detail',row))])));};
 search.addEventListener('input',draw);status?.querySelector('select').addEventListener('change',draw);draw();
 main.append(panel(config.title,[el('div',{class:'toolbar'},search,status,can(ctx,config,'new')?button([icon('plus'),reference(ctx,config,'new').title],()=>move(ctx,key,'new')):null),config.path==='inventory'&&ctx.state.identity.admin?exportLink('api/v1/inventory/stocktake/pdf',t('Inventura (PDF)')):null,list],config.path==='lost-found'?'lostfound':key==='inventory'?'inventory':key==='issues'?'issue':'report'));
}
export async function recordEditor(ctx,key,mode){
 const config=modules[key],ref=reference(ctx,config,mode),main=ctx.heading(ref.id,ref.title,t('Vyplňte údaje záznamu a uložte je. Výsledek se ověří následným načtením.'));
 if(!can(ctx,config,mode)){main.append(notice(t('Pro tuto úpravu nemáte oprávnění.'),'warning'),button(t('Zpět na seznam'),()=>move(ctx,key,'list')));return;}
 ctx.state.recordDrafts??=new Map();const draftKey=key+':'+mode+':'+(mode==='new'?'new':selected(ctx,key));let draft=ctx.state.recordDrafts.get(draftKey);
 if(!draft){
  const generation=ctx.state.generation,row=mode==='edit'?await api('api/v1/'+config.path+'/'+selected(ctx,key)):null;if(generation!==ctx.state.generation)return;
  const controls=el('div',{class:'form-grid'});
  for(const [title,name,type,required] of config.fields){
   const value=row?.[name]??(name==='unit'?'ks':name==='amount_per_piece_base'?1:type==='number'?0:''),limits={required,...(row&&config.path==='inventory'&&name==='current_stock'?{readOnly:true}:{}),...(type==='number'?{min:name==='amount_per_piece_base'?1:0,max:2147483647,step:1}:{}),...(type==='text'?{minlength:required?(['title'].includes(name)?3:1):undefined,maxlength:name==='room_number'?32:name==='category'?64:255}:{}),...(type==='datetime-local'?{step:1}:{})};
   if(Array.isArray(type))controls.append(select(title,name,type,value));
   else if(type==='textarea')controls.append(el('label',{class:'field wide'},el('span',{},title),el('textarea',{name,'aria-label':title,required,maxlength:name==='handover_note'?2000:4000,minlength:required?3:0},value)));
   else controls.append(field(title,name,type,type==='datetime-local'?pragueInput(value):value,limits));
   if(type==='datetime-local')controls.append(select(t('Výskyt času při změně letního času'),name+'-fold',[['',t('Vyberte pouze při opakovaném čase')],['first',t('První výskyt')],['second',t('Druhý výskyt')]],''));
  }
  if(config.path==='lost-found')controls.append(el('fieldset',{class:'wide'},el('legend',{},t('Štítky')),[['kontaktova',t('Kontaktován')],['nezastizen',t('Nezastižen')],['vyzvedne',t('Vyzvedne')],['odesleme',t('Odešleme')]].map(([name,title])=>el('label',{class:'check-field'},el('input',{type:'checkbox',name:'tag-'+name,checked:row?.tags?.includes(name)}),title))));
  const cancel=()=>{ctx.state.recordDrafts.delete(draftKey);back(ctx,key);},form=el('form',{class:'record-form'},controls,el('div',{class:'form-actions actions'},button([icon('close'),t('Zrušit')],cancel),el('button',{type:'submit',class:'primary'},icon('save'),t('Uložit'))));form.dataset.nativeRole=getRole();draft={form,row};ctx.state.recordDrafts.set(draftKey,draft);
  form.addEventListener('submit',event=>{
   event.preventDefault();const raw=formData(form),payload={};
   try{for(const [,name,type] of config.fields){
    if(row&&config.path==='inventory'&&name==='current_stock')continue;
    if(type==='number'){payload[name]=Number(raw[name]);if(!Number.isSafeInteger(payload[name]))throw Error(t('Zadejte celé číslo v povoleném rozsahu.'));}
    else if(type==='datetime-local')payload[name]=row&&raw[name]===pragueInput(row[name])?(/([Zz]|[+-]\d\d:\d\d)$/.test(row[name])?row[name]:row[name]+'Z'):pragueInstant(raw[name],raw[name+'-fold']);
    else payload[name]=raw[name]===''?null:raw[name];
   }}catch(error){showError(form,error);return;}
   if(config.path==='lost-found')payload.tags=['kontaktova','nezastizen','vyzvedne','odesleme'].filter(name=>raw['tag-'+name]==='on');
   const mayRead=ctx.state.identity.role_permissions[form.dataset.nativeRole].includes(readPermission(config));
   saveMutation(form,{path:'api/v1/'+config.path+(row?'/'+row.id:''),method:row?'PUT':'POST',body:payload,verify:async(result,{id,read})=>{
    if(!result?.id)throw Error(t('Odpověď neobsahuje identitu uloženého záznamu.'));const actual=mayRead?await read('api/v1/'+config.path+'/'+result.id):await storedMutation(read,id);if(actual?.id!==result.id)throw Error(t('Původní potvrzení obsahuje jinou identitu.'));
    for(const [name,value] of Object.entries(payload)){const same=name==='event_at'?Date.parse(actual[name]+(/([Zz]|[+-]\d\d:\d\d)$/.test(actual[name])?'':'Z'))===Date.parse(value):JSON.stringify(actual[name])===JSON.stringify(value);if(!same)throw Error(t('Následné načtení nepotvrdilo údaj: ')+(config.fields.find(field=>field[1]===name)?.[0]??t('Štítky')));}
   },done:async(result,{id})=>{ctx.state.recordDrafts.delete(draftKey);if(!mayRead){ctx.state.recordSubmissions??=new Map();ctx.state.recordSubmissions.set(key,{result,id,role:form.dataset.nativeRole,photos:[]});}if(ctx.state.view===key+'-'+mode)await move(ctx,key,mayRead?'detail':'submitted',result);}});
  });
 }
 main.append(panel(ref.title,[button([icon('arrow-left'),ctx.state.identity.available_permissions.includes(readPermission(config))?t('Zpět na seznam'):t('Zpět na pokoje')],()=>back(ctx,key)),draft.form],key==='inventory'?'inventory':key==='issues'?'issue':key==='lostfound'?'lostfound':'report'));
}
export async function recordDetail(ctx,key){
 const config=modules[key],generation=ctx.state.generation,ref=reference(ctx,config,'detail'),main=ctx.heading(ref.id,ref.title,t('Projděte uložené údaje, historii a dostupné akce záznamu.'));
 const actual=await api('api/v1/'+config.path+'/'+selected(ctx,key));if(generation!==ctx.state.generation)return;
 const refresh=()=>ctx.state.view===key+'-detail'&&selected(ctx,key)===actual.id?ctx.go(key+'-detail'):undefined;
 const detailFields=config.path==='lost-found'?[[t('Typ záznamu'),'item_type'],[t('Kategorie'),'category'],[t('Místo nálezu/ztráty'),'location'],[t('Datum a čas'),'event_at'],[t('Stav workflow'),'status'],[t('Štítky'),'tags'],[t('Popis položky'),'description'],[t('Jméno nálezce/žadatele'),'claimant_name'],[t('Kontakt'),'claimant_contact'],[t('Předávací záznam'),'handover_note']]:config.fields;
 const value=name=>name==='tags'?(actual.tags?.map(tag=>({kontaktova:t('Kontaktován'),nezastizen:t('Nezastižen'),vyzvedne:t('Vyzvedne'),odesleme:t('Odešleme')})[tag]??tag).join(', ')||t('Žádné')):name==='location'&&actual.room_number?actual.location+' · pokoj '+actual.room_number:display(config,name,actual[name]);
 const content=el('div',{},el('div',{class:'record-details'},detailFields.map(([title,name])=>el('div',{},el('small',{},title),el('strong',{},value(name))))));
 const actions=el('div',{class:'actions'},button([icon('arrow-left'),t('Zpět na seznam')],()=>move(ctx,key,'list')),can(ctx,config,'edit')?button([icon('edit'),t('Upravit')],()=>move(ctx,key,'edit',actual)):null);actions.dataset.nativeRole=getRole();
 if(config.path==='lost-found'&&can(ctx,config,'new')&&actual.status!=='claimed')actions.append(button([icon('arrow-right'),t('Označit jako zpracováno')],()=>saveMutation(actions,{path:'api/v1/'+config.path+'/'+actual.id,method:'PUT',body:{status:'claimed'},verify:async(_,{read})=>{const row=await read('api/v1/'+config.path+'/'+actual.id);if(row.status!=='claimed')throw Error(t('Zpracování nebylo potvrzeno.'));},done:refresh}),'primary'));
 if(can(ctx,config,'delete'))actions.append(button([icon('trash'),t('Odstranit')],()=>{const deletion=reference(ctx,config,'delete');modal(deletion.title,close=>{const confirmation=el('div',{},notice(t('Tuto operaci nelze automaticky vrátit.'),'warning'));confirmation.append(button(t('Odstranit tento záznam'),()=>saveMutation(confirmation,{path:'api/v1/'+config.path+'/'+actual.id,method:'DELETE',verify:async(_,{read})=>{try{await read('api/v1/'+config.path+'/'+actual.id);}catch(error){if(error.status===404)return;throw error;}throw Error(t('Záznam stále existuje.'));},done:async()=>{close();if(ctx.state.view===key+'-detail')await move(ctx,key,'list');}}),'danger'));return confirmation;},{id:deletion.id});},'danger'));
 content.append(actions);main.append(panel(actual.title??actual.name??ref.title,content,key==='inventory'?'inventory':key==='issues'?'issue':key==='lostfound'?'lostfound':'report'));
 if(config.path==='inventory'){const pictogram=await pictogramDocumentation(ctx,actual,can(ctx,config,'edit'),refresh);if(generation!==ctx.state.generation)return;main.append(panel(t('Piktogram'),pictogram,'camera'),panel(t('Skladové pohyby a historie'),inventoryExtras(actual,refresh,can(ctx,config,'edit'),ctx.state.identity.active_role==='admin'),'inventory'));}
 else {
  const documentation=await photoDocumentation(ctx,config,actual,can(ctx,config,'photo'),refresh);if(generation!==ctx.state.generation)return;
  main.append(panel(t('Fotodokumentace a historie'),el('div',{class:'record-history'},documentation,[[t('Záznam vytvořen'),actual.created_at],[t('Poslední změna'),actual.updated_at],[t('Zahájeno řešení'),actual.in_progress_at],[t('Vyřešeno'),actual.resolved_at],[t('Uzavřeno'),actual.closed_at],[t('Zpracováno'),actual.claimed_at],[t('Vráceno'),actual.returned_at]].filter(([,time])=>time).map(([title,time])=>el('article',{},el('strong',{},title),el('time',{},display(config,'event_at',time))))),'clock'));
 }
}

export async function recordSubmitted(ctx,key){
 const submission=ctx.state.recordSubmissions?.get(key),config=modules[key];
 const main=ctx.heading('hotel.record.submitted',t('Záznam byl přijat'),t('Potvrzení právě odeslaného záznamu v rámci vaší pracovní role.'));
 if(!submission){main.append(notice(t('Potvrzení tohoto zápisu není v otevřeném dokumentu dostupné. Nevytvářejte stejný záznam znovu.'),'warning'),button(t('Zpět na pokoje'),()=>back(ctx,key)));return;}
 const generation=ctx.state.generation,read=(path,options={})=>api(path,{...options,roleOverride:submission.role});
 const accepted=await storedMutation(read,submission.id);if(generation!==ctx.state.generation)return;if(accepted.id!==submission.result.id)throw Error(t('Původní potvrzení obsahuje jinou identitu.'));
 main.append(panel(config.title+t(' · záznam č. ')+accepted.id,[notice(t('Záznam byl přijat. V této pracovní roli nemůžete číst jeho další stav.')),el('div',{class:'record-details'},config.fields.map(([title,name])=>el('div',{},el('small',{},title),el('strong',{},display(config,name,accepted[name]))))),el('div',{class:'actions'},button([icon('arrow-left'),t('Zpět na pokoje')],()=>back(ctx,key)))],key==='issues'?'issue':'lostfound'));
 const refresh=()=>ctx.state.view===key+'-submitted'?ctx.go(key+'-submitted'):undefined;
 const documentation=await photoDocumentation(ctx,config,{...accepted,photos:submission.photos},true,refresh,{writeOnly:true,role:submission.role,onSaved:photos=>submission.photos=photos});if(generation!==ctx.state.generation)return;
 main.append(panel(t('Připojit fotografie'),documentation,'camera'));
}
