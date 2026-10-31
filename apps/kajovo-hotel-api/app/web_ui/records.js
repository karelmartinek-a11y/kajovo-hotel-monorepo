import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {api,getRole,exportLink} from './api.js';
import {saveMutation} from './operations.js';
import {inventoryExtras} from './inventory.js';
import {pragueInput,pragueInstant} from './time.js';
import {moduleReference} from './references.js';
import {photoDocumentation} from './photos.js';
export const modules={
 issues:{path:'issues',title:'Závady',id:'hotel.admin.14',member:'hotel.portal.54',newId:'hotel.admin.15',fields:[['Název','title','text',true],['Popis','description','textarea'],['Umístění','location','text',true],['Pokoj','room_number','text'],['Priorita','priority',[['low','Nízká'],['medium','Střední'],['high','Vysoká'],['critical','Kritická']]],['Stav','status',[['new','Nová'],['in_progress','Řeší se'],['resolved','Vyřešeno'],['closed','Uzavřeno']]],['Přiřazeno','assignee','text']]},
 reports:{path:'reports',title:'Provozní hlášení',id:'hotel.admin.22',member:'hotel.portal.62',newId:'hotel.admin.23',fields:[['Název','title','text',true],['Popis','description','textarea'],['Stav','status',[['open','Otevřené'],['in_progress','Řeší se'],['closed','Uzavřené']]]]},
 lostfound:{path:'lost-found',title:'Ztráty a nálezy',id:'hotel.admin.10',member:'hotel.portal.50',newId:'hotel.admin.11',fields:[['Typ','item_type',[['found','Nález'],['lost','Ztráta']]],['Popis','description','textarea',true],['Kategorie','category','text',true],['Umístění','location','text',true],['Pokoj','room_number','text'],['Datum a čas','event_at','datetime-local',true],['Stav','status',[['new','Nové'],['stored','Uloženo'],['claimed','Přihlásil se majitel'],['returned','Vráceno'],['disposed','Vyřazeno']]],['Majitel','claimant_name','text'],['Kontakt','claimant_contact','text'],['Poznámka k předání','handover_note','textarea']]},
 inventory:{path:'inventory',title:'Sklad',id:'hotel.admin.18',member:'hotel.portal.58',newId:'hotel.admin.19',fields:[['Název','name','text',true],['Jednotka','unit',[['ks','ks'],['g','g'],['l','l']]],['Minimální zásoba','min_stock','number',true],['Aktuální zásoba','current_stock','number',true],['Základních jednotek na kus','amount_per_piece_base','number',true]]}
};

const permission=config=>(config.path==='lost-found'?'lost_found':config.path)+':write';
function can(ctx,config,operation){
 if(!ctx.state.identity.permissions.includes(permission(config)))return false;
 const role=ctx.state.identity.active_role;
 if(config.path==='issues')return operation==='new'||operation==='photo'?['admin','pokojská','údržba'].includes(role):operation==='delete'?role==='admin':['admin','údržba'].includes(role);
 if(config.path==='lost-found'&&operation==='delete')return role==='admin';
 if(config.path==='lost-found'&&operation==='edit')return role!=='recepce';
 return true;
}
const reference=(ctx,config,kind)=>moduleReference(config.path,kind,ctx.state.identity.admin);
function selected(ctx,key){return ctx.state.recordIds?.get(key);}
function move(ctx,key,mode,row){ctx.state.recordIds??=new Map();if(row)ctx.state.recordIds.set(key,row.id);return ctx.go(key+(mode==='list'?'':'-'+mode));}
function display(config,key,value){const type=config.fields.find(field=>field[1]===key)?.[2];if(Array.isArray(type))return type.find(([id])=>id===value)?.[1]??value??'—';if(key==='event_at'&&value)return new Date(value+(/([Zz]|[+-]\d\d:\d\d)$/.test(value)?'':'Z')).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});return value??'—';}
export async function recordList(ctx,key){
 const config=modules[key],generation=ctx.state.generation,main=ctx.heading(ctx.state.identity.admin?config.id:config.member,config.title,'Projděte záznamy a otevřete podrobnosti vybrané položky.');
 const rows=await api('api/v1/'+config.path);if(generation!==ctx.state.generation)return;
 const search=el('input',{type:'search',placeholder:'Hledat','aria-label':'Hledat záznam'}),statusField=config.fields.find(field=>field[1]==='status'),status=statusField?select('Stav','status-filter',[['','Všechny stavy'],...statusField[2]],''):null,list=el('div');
 const draw=()=>{const q=search.value.toLocaleLowerCase('cs'),filtered=rows.filter(row=>config.fields.some(([,key])=>String(display(config,key,row[key])).toLocaleLowerCase('cs').includes(q))&&(!status||!status.querySelector('select').value||row.status===status.querySelector('select').value));list.replaceChildren(table(['Záznam','Umístění / jednotka','Stav / zásoba','Akce'],filtered.map(row=>[row.title??row.name??row.description,row.location??row.unit??'—',display(config,'status',row.current_stock??row.status),button('Detail',()=>move(ctx,key,'detail',row))])));};
 search.addEventListener('input',draw);status?.querySelector('select').addEventListener('change',draw);draw();
 main.append(panel(config.title,[el('div',{class:'toolbar'},search,status,can(ctx,config,'new')?button([icon('plus'),reference(ctx,config,'new').title],()=>move(ctx,key,'new')):null),config.path==='inventory'&&ctx.state.identity.admin?exportLink('api/v1/inventory/stocktake/pdf','Inventura (PDF)'):null,list],config.path==='lost-found'?'lostfound':key==='inventory'?'inventory':key==='issues'?'issue':'report'));
}
export async function recordEditor(ctx,key,mode){
 const config=modules[key],ref=reference(ctx,config,mode),main=ctx.heading(ref.id,ref.title,'Vyplňte údaje záznamu a uložte je. Výsledek se ověří následným načtením.');
 if(!can(ctx,config,mode)){main.append(notice('Pro tuto úpravu nemáte oprávnění.','warning'),button('Zpět na seznam',()=>move(ctx,key,'list')));return;}
 ctx.state.recordDrafts??=new Map();const draftKey=key+':'+mode+':'+(mode==='new'?'new':selected(ctx,key));let draft=ctx.state.recordDrafts.get(draftKey);
 if(!draft){
  const generation=ctx.state.generation,row=mode==='edit'?await api('api/v1/'+config.path+'/'+selected(ctx,key)):null;if(generation!==ctx.state.generation)return;
  const controls=el('div',{class:'form-grid'});
  for(const [title,name,type,required] of config.fields){
   const value=row?.[name]??(name==='unit'?'ks':name==='amount_per_piece_base'?1:type==='number'?0:''),limits={required,...(row&&config.path==='inventory'&&name==='current_stock'?{readOnly:true}:{}),...(type==='number'?{min:name==='amount_per_piece_base'?1:0,max:2147483647,step:1}:{}),...(type==='text'?{minlength:required?(['title'].includes(name)?3:1):undefined,maxlength:name==='room_number'?32:name==='category'?64:255}:{}),...(type==='datetime-local'?{step:1}:{})};
   if(Array.isArray(type))controls.append(select(title,name,type,value));
   else if(type==='textarea')controls.append(el('label',{class:'field wide'},el('span',{},title),el('textarea',{name,'aria-label':title,required,maxlength:name==='handover_note'?2000:4000,minlength:required?3:0},value)));
   else controls.append(field(title,name,type,type==='datetime-local'?pragueInput(value):value,limits));
   if(type==='datetime-local')controls.append(select('Výskyt času při změně letního času',name+'-fold',[['','Vyberte pouze při opakovaném čase'],['first','První výskyt'],['second','Druhý výskyt']],''));
  }
  if(config.path==='lost-found')controls.append(el('fieldset',{class:'wide'},el('legend',{},'Štítky'),[['kontaktova','Kontaktován'],['nezastizen','Nezastižen'],['vyzvedne','Vyzvedne'],['odesleme','Odešleme']].map(([name,title])=>el('label',{class:'check-field'},el('input',{type:'checkbox',name:'tag-'+name,checked:row?.tags?.includes(name)}),title))));
  const cancel=()=>{ctx.state.recordDrafts.delete(draftKey);move(ctx,key,'list');},form=el('form',{class:'record-form'},controls,el('div',{class:'form-actions actions'},button([icon('close'),'Zrušit'],cancel),el('button',{type:'submit',class:'primary'},icon('save'),'Uložit')));form.dataset.nativeRole=getRole();draft={form,row};ctx.state.recordDrafts.set(draftKey,draft);
  form.addEventListener('submit',event=>{
   event.preventDefault();const raw=formData(form),payload={};
   try{for(const [,name,type] of config.fields){
    if(row&&config.path==='inventory'&&name==='current_stock')continue;
    if(type==='number'){payload[name]=Number(raw[name]);if(!Number.isSafeInteger(payload[name]))throw Error('Zadejte celé číslo v povoleném rozsahu.');}
    else if(type==='datetime-local')payload[name]=row&&raw[name]===pragueInput(row[name])?(/([Zz]|[+-]\d\d:\d\d)$/.test(row[name])?row[name]:row[name]+'Z'):pragueInstant(raw[name],raw[name+'-fold']);
    else payload[name]=raw[name]===''?null:raw[name];
   }}catch(error){showError(form,error);return;}
   if(config.path==='lost-found')payload.tags=['kontaktova','nezastizen','vyzvedne','odesleme'].filter(name=>raw['tag-'+name]==='on');
   saveMutation(form,{path:'api/v1/'+config.path+(row?'/'+row.id:''),method:row?'PUT':'POST',body:payload,verify:async(result,{read})=>{
    if(!result?.id)throw Error('Odpověď neobsahuje identitu uloženého záznamu.');const actual=await read('api/v1/'+config.path+'/'+result.id);
    for(const [name,value] of Object.entries(payload)){const same=name==='event_at'?Date.parse(actual[name]+(/([Zz]|[+-]\d\d:\d\d)$/.test(actual[name])?'':'Z'))===Date.parse(value):JSON.stringify(actual[name])===JSON.stringify(value);if(!same)throw Error('Následné načtení nepotvrdilo údaj: '+(config.fields.find(field=>field[1]===name)?.[0]??'Štítky'));}
   },done:async result=>{ctx.state.recordDrafts.delete(draftKey);if(ctx.state.view===key+'-'+mode)await move(ctx,key,'detail',result);}});
  });
 }
 main.append(panel(ref.title,[button([icon('arrow-left'),'Zpět na seznam'],()=>move(ctx,key,'list')),draft.form],key==='inventory'?'inventory':key==='issues'?'issue':key==='lostfound'?'lostfound':'report'));
}
export async function recordDetail(ctx,key){
 const config=modules[key],generation=ctx.state.generation,ref=reference(ctx,config,'detail'),main=ctx.heading(ref.id,ref.title,'Projděte uložené údaje, historii a dostupné akce záznamu.');
 const actual=await api('api/v1/'+config.path+'/'+selected(ctx,key));if(generation!==ctx.state.generation)return;
 const refresh=()=>ctx.state.view===key+'-detail'&&selected(ctx,key)===actual.id?ctx.go(key+'-detail'):undefined;
 const detailFields=config.path==='lost-found'?[['Typ záznamu','item_type'],['Kategorie','category'],['Místo nálezu/ztráty','location'],['Datum a čas','event_at'],['Stav workflow','status'],['Štítky','tags'],['Popis položky','description'],['Jméno nálezce/žadatele','claimant_name'],['Kontakt','claimant_contact'],['Předávací záznam','handover_note']]:config.fields;
 const value=name=>name==='tags'?(actual.tags?.map(tag=>({kontaktova:'Kontaktován',nezastizen:'Nezastižen',vyzvedne:'Vyzvedne',odesleme:'Odešleme'})[tag]??tag).join(', ')||'Žádné'):name==='location'&&actual.room_number?actual.location+' · pokoj '+actual.room_number:display(config,name,actual[name]);
 const content=el('div',{},el('div',{class:'record-details'},detailFields.map(([title,name])=>el('div',{},el('small',{},title),el('strong',{},value(name))))));
 const actions=el('div',{class:'actions'},button([icon('arrow-left'),'Zpět na seznam'],()=>move(ctx,key,'list')),can(ctx,config,'edit')?button([icon('edit'),'Upravit'],()=>move(ctx,key,'edit',actual)):null);actions.dataset.nativeRole=getRole();
 if(config.path==='lost-found'&&can(ctx,config,'new')&&actual.status!=='claimed')actions.append(button([icon('arrow-right'),'Označit jako zpracováno'],()=>saveMutation(actions,{path:'api/v1/'+config.path+'/'+actual.id,method:'PUT',body:{status:'claimed'},verify:async(_,{read})=>{const row=await read('api/v1/'+config.path+'/'+actual.id);if(row.status!=='claimed')throw Error('Zpracování nebylo potvrzeno.');},done:refresh}),'primary'));
 if(can(ctx,config,'delete'))actions.append(button([icon('trash'),'Odstranit'],()=>{const deletion=reference(ctx,config,'delete');modal(deletion.title,close=>{const confirmation=el('div',{},notice('Tuto operaci nelze automaticky vrátit.','warning'));confirmation.append(button('Odstranit tento záznam',()=>saveMutation(confirmation,{path:'api/v1/'+config.path+'/'+actual.id,method:'DELETE',verify:async(_,{read})=>{try{await read('api/v1/'+config.path+'/'+actual.id);}catch(error){if(error.status===404)return;throw error;}throw Error('Záznam stále existuje.');},done:async()=>{close();if(ctx.state.view===key+'-detail')await move(ctx,key,'list');}}),'danger'));return confirmation;},{id:deletion.id});},'danger'));
 content.append(actions);main.append(panel(actual.title??actual.name??ref.title,content,key==='inventory'?'inventory':key==='issues'?'issue':key==='lostfound'?'lostfound':'report'));
 if(config.path==='inventory')main.append(panel('Skladové pohyby a historie',inventoryExtras(actual,refresh,can(ctx,config,'edit')),'inventory'));
 else {
  const documentation=await photoDocumentation(ctx,config,actual,can(ctx,config,'photo'),refresh);if(generation!==ctx.state.generation)return;
  main.append(panel('Fotodokumentace a historie',el('div',{class:'record-history'},documentation,[['Záznam vytvořen',actual.created_at],['Poslední změna',actual.updated_at],['Zahájeno řešení',actual.in_progress_at],['Vyřešeno',actual.resolved_at],['Uzavřeno',actual.closed_at],['Zpracováno',actual.claimed_at],['Vráceno',actual.returned_at]].filter(([,time])=>time).map(([title,time])=>el('article',{},el('strong',{},title),el('time',{},display(config,'event_at',time))))),'clock'));
 }
}
