import {t,locale} from './i18n.js';
import {api,getRole,exportLink} from './api.js';
import {el,icon,field,select,button,table,panel,notice,modal,formData,showError} from './ui.js';
import {saveMutation} from './operations.js';
const kinds={in:t('Příjem'),out:t('Výdej'),adjust:t('Odpis')},max=2147483647;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
const writable=ctx=>ctx.state.identity.permissions.includes('inventory:write');
const admin=ctx=>ctx.state.identity.active_role==='admin';
const quantity=(value,unit)=>value.toLocaleString(locale)+' '+unit;
const noteField=(label,name)=>el('label',{class:'field'},el('span',{},label),el('textarea',{name,'aria-label':label,maxlength:2000}));
function openCard(ctx,row){ctx.state.inventoryCardId=row.id;return ctx.go('inventory-card-detail');}
function detailFields(rows){return el('div',{class:'record-details'},rows.map(([label,value])=>el('div',{},el('small',{},label),el('strong',{},value??'—'))));}
export async function warehouseList(ctx,{newItem,detail}){
 const generation=ctx.state.generation,main=ctx.heading(ctx.state.identity.admin?'hotel.admin.18':'hotel.portal.58',t('Sklad'),t('Skladové položky, aktuální stav a limity; filtrování a oprávněné vytváření položek.'));
 const rows=await api('api/v1/inventory');if(generation!==ctx.state.generation)return;
 const tools=el('div',{class:'actions warehouse-tools'},writable(ctx)?button([icon('plus'),t('Nová skladová položka')],newItem,'primary'):null,writable(ctx)?button([icon('plus'),t('Nový pohyb skladu')],()=>ctx.go('inventory-card-new')):null,admin(ctx)?exportLink('api/v1/inventory/stocktake/pdf',t('Inventurní protokol (PDF)')):null,button([icon('refresh'),t('Obnovit')],()=>ctx.go('inventory')));
 main.append(panel(t('Sklad'),tools,'inventory'));
 const search=field(t('Hledat položku'),'inventory-search','search',''),low=el('input',{type:'checkbox','aria-label':t('Pouze pod minimem')}),list=el('div');
 const draw=()=>{const q=search.querySelector('input').value.toLocaleLowerCase('cs');list.replaceChildren(table([t('Položka'),t('Veličina v 1 ks'),t('Aktuální stav'),t('Minimální stav'),t('Stav zásoby'),t('Akce')],rows.filter(row=>row.name.toLocaleLowerCase('cs').includes(q)&&(!low.checked||row.current_stock<row.min_stock)).map(row=>[el('strong',{},row.name),quantity(row.amount_per_piece_base,row.unit),quantity(row.current_stock,row.unit),quantity(row.min_stock,row.unit),el('span',{class:'badge '+(row.current_stock<row.min_stock?'stock-low':'stock-ok')},icon(row.current_stock<row.min_stock?'warning':'check'),row.current_stock<row.min_stock?t('Pod minimem'):t('Dostatečná')),button([icon('eye'),t('Detail')],()=>detail(row))])));};
 search.querySelector('input').addEventListener('input',draw);low.addEventListener('change',draw);draw();
 const filters=el('details',{class:'warehouse-filters'},el('summary',{},icon('filter'),t('Filtry')),el('div',{class:'toolbar'},search,el('label',{class:'check-field'},low,t('Pouze pod minimem'))));tools.append(filters);const items=panel(t('Skladové položky'),list,'inventory');items.classList.add('warehouse-items');
 main.append(items,panel(t('Skladové doklady a pohyby'),el('div',{class:'actions'},button([icon('document'),t('Skladové doklady')],()=>ctx.go('inventory-cards')),button([icon('clock'),t('Historie pohybů')],()=>ctx.go('inventory-movements'))),'inventory'));
}
export async function warehouseCards(ctx){
 const generation=ctx.state.generation,main=ctx.heading('hotel.inventory.cards',t('Skladové doklady'),t('Příjmy, výdeje a odpisy s původním číslem dokladu a samostatnými řádky.'));
 const rows=await api('api/v1/inventory/cards');if(generation!==ctx.state.generation)return;
 main.append(panel(t('Skladové doklady'),[el('div',{class:'actions'},button([icon('arrow-left'),t('Zpět na sklad')],()=>ctx.go('inventory')),writable(ctx)?button([icon('plus'),t('Nový pohyb skladu')],()=>ctx.go('inventory-card-new'),'primary'):null),table([t('Číslo'),t('Typ'),t('Datum'),t('Dodavatel'),t('Reference'),t('Akce')],rows.map(row=>[row.number,kinds[row.card_type],row.card_date,row.supplier??'—',row.reference??'—',button(t('Detail dokladu'),()=>openCard(ctx,row))]))],'document'));
}
export async function warehouseCardForm(ctx){
 const main=ctx.heading('hotel.inventory.card-new',t('Nový pohyb skladu'),t('Vytvořte skladový doklad s jedním nebo více řádky. Skladové množství je v základních jednotkách položky.'));
 if(!writable(ctx)){main.append(notice(t('Pro vytvoření dokladu nemáte oprávnění.'),'warning'));return;}
 if(!ctx.state.inventoryCardDraft){
  const generation=ctx.state.generation,ingredients=await api('api/v1/inventory');if(generation!==ctx.state.generation)return;
  if(!ingredients.length){main.append(notice(t('Nejdříve založte skladovou položku.')),button(t('Zpět na sklad'),()=>ctx.go('inventory')));return;}
  const type=select(t('Typ dokladu'),'card_type',Object.entries(kinds),'in'),lines=el('div',{class:'stock-document-lines'}),form=el('form',{class:'record-form stock-document-form'},el('div',{class:'form-grid'},type,field(t('Datum dokladu'),'card_date','date',today(),{required:true}),field(t('Dodavatel'),'supplier','text','',{maxlength:255}),field(t('Reference dokladu'),'reference','text','',{maxlength:64})),noteField(t('Poznámka k dokladu'),'note'),lines);
  let sequence=0;const appendLine=()=>{
   const index=++sequence,pick=select(t('Položka řádku ')+index,'ingredient',ingredients.map(row=>[String(row.id),row.name+' · '+row.unit]),String(ingredients[0].id)),amount=field(t('Množství v základní jednotce řádku ')+index,'quantity','number',1,{required:true,min:1,max,step:1}),pieces=field(t('Počet kusů řádku ')+index,'pieces','number',0,{required:true,min:0,max,step:1}),balance=el('small',{}),line=el('fieldset',{'data-stock-line':''},el('legend',{},t('Řádek ')+index),el('div',{class:'form-grid'},pick,amount,pieces,noteField(t('Poznámka řádku ')+index,'line-note')),balance);
   const update=()=>{const item=ingredients.find(row=>row.id===Number(pick.querySelector('select').value));balance.textContent=t('Základní jednotka ')+item.unit+t(' · nyní skladem ')+quantity(item.current_stock,item.unit)+' · v 1 ks '+quantity(item.amount_per_piece_base,item.unit);};pick.querySelector('select').addEventListener('change',update);update();
   line.append(button([icon('trash'),t('Odebrat řádek ')+index],()=>{if(lines.children.length===1){showError(form,Error(t('Doklad musí mít alespoň jeden řádek.')));return;}line.remove();}));lines.append(line);
  };appendLine();form.append(el('div',{class:'actions'},button([icon('plus'),t('Přidat řádek dokladu')],appendLine)),el('div',{class:'form-actions actions'},button(t('Zrušit'),()=>{ctx.state.inventoryCardDraft=null;ctx.go('inventory');}),el('button',{type:'submit',class:'primary'},icon('save'),t('Uložit skladový doklad'))));form.dataset.nativeRole=getRole();ctx.state.inventoryCardDraft=form;
  form.addEventListener('submit',event=>{
   event.preventDefault();const raw=formData(form),items=[...lines.querySelectorAll('[data-stock-line]')].map(line=>({ingredient_id:Number(line.querySelector('select').value),quantity_base:Number(line.querySelector('[name=quantity]').value),quantity_pieces:Number(line.querySelector('[name=pieces]').value),note:line.querySelector('[name=line-note]').value||null})),totals=new Map();
   for(const item of items){if(!Number.isSafeInteger(item.quantity_base)||item.quantity_base<1||item.quantity_base>max||!Number.isSafeInteger(item.quantity_pieces)||item.quantity_pieces<0||item.quantity_pieces>max){showError(form,Error(t('Množství musí být celé číslo v povoleném rozsahu.')));return;}totals.set(item.ingredient_id,(totals.get(item.ingredient_id)??0)+item.quantity_base);}
   for(const [id,total] of totals){const ingredient=ingredients.find(row=>row.id===id);if(!ingredient||!Number.isSafeInteger(total)||total>max||(raw.card_type==='in'?ingredient.current_stock+total>max:total>ingredient.current_stock)){showError(form,Error(t('Součet řádků překračuje dostupný stav nebo povolený rozsah položky.')));return;}}
   const payload={card_type:raw.card_type,card_date:raw.card_date,supplier:raw.supplier||null,reference:raw.reference||null,note:raw.note||null,items};
   saveMutation(form,{path:'api/v1/inventory/cards',body:payload,verify:async(result,{read})=>{
    if(!result?.id)throw Error(t('Chybí identita skladového dokladu.'));const actual=await read('api/v1/inventory/cards/'+result.id);for(const key of ['card_type','card_date','supplier','reference','note'])if(actual[key]!==payload[key])throw Error(t('Údaj dokladu nebyl potvrzen: ')+key);
    if(actual.items.length!==items.length||actual.items.some((row,index)=>['ingredient_id','quantity_base','quantity_pieces','note'].some(key=>row[key]!==items[index][key])))throw Error(t('Řádky dokladu nebyly potvrzeny následným načtením.'));
    for(const [id,total] of totals){const item=await read('api/v1/inventory/'+id),movements=item.movements.filter(row=>row.card_id===actual.id);if(movements.reduce((sum,row)=>sum+row.quantity,0)!==total||movements.some(row=>row.movement_type!==payload.card_type||row.card_number!==actual.number))throw Error(t('Původní pohyby nepotvrdily účinek dokladu.'));}
   },done:async result=>{ctx.state.inventoryCardDraft=null;if(ctx.state.view==='inventory-card-new')await openCard(ctx,result);}});
  });
 }
 main.append(panel(t('Nový skladový doklad'),[button([icon('arrow-left'),t('Zpět na sklad')],()=>ctx.go('inventory')),ctx.state.inventoryCardDraft],'document'));
}
export async function warehouseCardDetail(ctx){
 const generation=ctx.state.generation,main=ctx.heading('hotel.inventory.card-detail',t('Detail skladového dokladu'),t('Původní doklad, jeho řádky a aktuálně oprávněné akce.'));
 const row=await api('api/v1/inventory/cards/'+ctx.state.inventoryCardId);if(generation!==ctx.state.generation)return;
 const actions=el('div',{class:'actions'},button([icon('arrow-left'),t('Zpět na doklady')],()=>ctx.go('inventory-cards')));
 if(admin(ctx))actions.append(button([icon('trash'),t('Smazat skladový doklad')],()=>modal(t('Smazat skladový doklad'),close=>{
  const content=el('div',{},notice(t('Smazání dokladu ')+row.number+t(' vrátí jeho vlastní pohyby do skladu. Dostatečný aktuální stav ověří Hotel.'),'warning'));
  content.append(button(t('Smazat tento skladový doklad'),()=>saveMutation(content,{path:'api/v1/inventory/cards/'+row.id,method:'DELETE',verify:async(_,{read})=>{try{await read('api/v1/inventory/cards/'+row.id);}catch(error){if(error.status!==404)throw error;for(const id of new Set(row.items.map(item=>item.ingredient_id))){const item=await read('api/v1/inventory/'+id);if(item.movements.some(movement=>movement.card_id===row.id))throw Error(t('Doklad stále má navázané skladové pohyby.'));}return;}throw Error(t('Doklad stále existuje.'));},done:async()=>{close();if(ctx.state.view==='inventory-card-detail'&&ctx.state.inventoryCardId===row.id)await ctx.go('inventory-cards');}}),'danger'));return content;
 },{id:'hotel.inventory.card-delete'}),'danger'));
 main.append(panel(row.number,[detailFields([[t('Typ dokladu'),kinds[row.card_type]],[t('Datum'),row.card_date],[t('Dodavatel'),row.supplier],[t('Reference'),row.reference],[t('Poznámka'),row.note]]),actions,table([t('Položka'),t('Množství'),t('Kusy'),t('Poznámka')],row.items.map(item=>[item.ingredient_name??t('Položka č. ')+item.ingredient_id,quantity(item.quantity_base,item.unit??''),item.quantity_pieces,item.note??'—']))],'document'));
}
export async function warehouseMovements(ctx){
 const generation=ctx.state.generation,main=ctx.heading('hotel.inventory.movements',t('Historie skladových pohybů'),t('Původní pohyby všech položek a jejich vazby na skladové doklady.'));
 const rows=await api('api/v1/inventory/movements');if(generation!==ctx.state.generation)return;
 const filter=field(t('Hledat skladový pohyb'),'movement-search','search',''),kind=select(t('Typ pohybu'),'movement-type',[['',t('Všechny typy')],...Object.entries(kinds)],''),list=el('div');
 const draw=()=>{const q=filter.querySelector('input').value.toLocaleLowerCase('cs'),type=kind.querySelector('select').value;list.replaceChildren(table([t('Datum'),t('Doklad'),t('Položka'),t('Typ'),t('Množství'),t('Kusy'),t('Poznámka')],rows.filter(row=>(!type||row.movement_type===type)&&[row.item_name,row.document_number,row.document_reference,row.note].some(value=>String(value??'').toLocaleLowerCase('cs').includes(q))).map(row=>[row.document_date??'—',row.card_id?button(row.card_number??row.document_number,()=>openCard(ctx,{id:row.card_id})):row.document_number??'—',row.item_name??'—',kinds[row.movement_type],quantity(row.quantity,row.unit??''),row.quantity_pieces,row.note??'—'])));};filter.querySelector('input').addEventListener('input',draw);kind.querySelector('select').addEventListener('change',draw);draw();
 main.append(panel(t('Pohyby'),[button([icon('arrow-left'),t('Zpět na sklad')],()=>ctx.go('inventory')),el('div',{class:'toolbar'},filter,kind),list],'inventory'));
}
