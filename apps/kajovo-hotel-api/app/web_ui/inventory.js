import {el,icon,field,select,button,table,notice,modal,formData,showError} from './ui.js';
import {saveMutation} from './operations.js';
const labels={in:['Příjem','stock-in'],out:['Výdej','stock-out'],adjust:['Odpis','stock-adjust']};
const date=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
export function inventoryExtras(row,refresh,canWrite,canDelete=false){
 const content=el('div',{},el('h3',{},'Skladové pohyby'));
 if(canWrite)content.append(el('div',{class:'actions'},Object.entries(labels).map(([type,[label,ico]])=>button([icon(ico),label],()=>movementEditor(row,type,refresh)))));
 content.append(table(['Datum','Typ','Množství','Kusy','Doklad','Poznámka','Akce'],(row.movements??[]).map(m=>[
  m.document_date??'—',labels[m.movement_type]?.[0]??m.movement_type,m.quantity+' '+row.unit,m.quantity_pieces,m.document_number??'—',m.note??'—',canDelete?button('Odstranit pohyb',()=>removeMovement(row,m,refresh)):null,
 ])));
 if(row.audit_logs)content.append(el('h3',{},'Historie položky'),table(['Čas','Akce','Podrobnosti'],row.audit_logs.map(r=>[r.created_at,r.action,r.detail])));
 return content;
}
function movementEditor(row,type,refresh){
 const [title,ico]=labels[type];modal('Sklad · '+title.toLocaleLowerCase('cs'),close=>{
  const form=el('form',{},notice(row.name+' · aktuálně '+row.current_stock+' '+row.unit),el('div',{class:'form-grid'},field('Množství v základní jednotce ('+row.unit+')','quantity','number','',{required:true,min:1,max:type==='in'?2147483647:row.current_stock,step:1}),field('Počet kusů','quantity_pieces','number',0,{required:true,min:0,max:2147483647,step:1}),field('Datum dokladu','document_date','date',date(),{required:true}),field('Číslo souvisejícího dokladu','document_reference','text','',{required:type==='in',maxlength:64})),el('label',{class:'field'},el('span',{},'Poznámka'),el('textarea',{name:'note',maxlength:2000})),el('button',{type:'submit',class:'primary'},icon(ico),'Uložit '+title.toLocaleLowerCase('cs')));
  form.addEventListener('submit',event=>{
   event.preventDefault();const data=formData(form),quantity=Number(data.quantity),pieces=Number(data.quantity_pieces);
   if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(pieces)||pieces<0){showError(form,Error('Množství i počet kusů musí být celá čísla v povoleném rozsahu.'));return;}
   const originalIds=new Set((row.movements??[]).map(m=>m.id));
   saveMutation(form,{path:'api/v1/inventory/'+row.id+'/movements',body:{movement_type:type,quantity,quantity_pieces:pieces,document_date:data.document_date,document_reference:data.document_reference||null,note:data.note||null},verify:async (receipt,{read})=>{
    const accepted=(receipt.movements??[]).filter(m=>!originalIds.has(m.id)&&m.movement_type===type&&m.quantity===quantity&&m.quantity_pieces===pieces&&m.document_date===data.document_date);
    if(accepted.length!==1)throw Error('Původní odpověď neobsahuje jednoznačný uložený pohyb.');
    const current=await read('api/v1/inventory/'+row.id),saved=current.movements.find(m=>m.id===accepted[0].id);
    if(!saved||saved.quantity!==quantity||saved.movement_type!==type)throw Error('Původní pohyb se nepodařilo ověřit v historii položky.');
   },done:async()=>{close();await refresh();}});
  });return form;
 },{id:'hotel.inventory.movement-'+type});
}
function removeMovement(row,movement,refresh){modal('Smazat skladový pohyb',close=>{
 const body=el('div',{},notice('Odstranění pohybu změní skladový stav položky '+row.name+'.','warning'),table(['Typ','Množství','Doklad'],[[labels[movement.movement_type]?.[0],movement.quantity+' '+row.unit,movement.document_number??'—']]));
 body.append(button('Smazat tento pohyb',()=>saveMutation(body,{path:'api/v1/inventory/'+row.id+'/movements/'+movement.id,method:'DELETE',verify:async(_,{read})=>{const current=await read('api/v1/inventory/'+row.id);if(current.movements.some(m=>m.id===movement.id))throw Error('Pohyb je stále v aktuální historii.');},done:async()=>{close();await refresh();}}),'danger'));
 return body;
},{id:'hotel.inventory.delete'});}
