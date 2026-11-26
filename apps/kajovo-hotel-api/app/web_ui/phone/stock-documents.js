import {text} from './locale.js';
import {action,card,element,facts,inputField,options,today} from './controls.js';
import {commit} from './transport.js';
import {intMax,missing,movementKinds,numberField,remove} from './stock-fields.js';

function actions(context) {
  const bar=element('div',{class:'actions'},action('Zpět na sklad',context.home));
  if (context.write) bar.append(action('Nový skladový doklad',()=>context.branch('card-new'),true));
  return bar;
}

export async function documents(context,mode,id) {
  const {read,endpoint,branch,admin,home}=context;
  if (mode==='card-new') {
    if (!context.write) throw Error('Pro vytvoření dokladu je potřeba právo zápisu v tomto skladu.');
    return createDocument(context,await read(endpoint()));
  }
  if (mode==='cards') {
    const rows=await read(endpoint('/cards'));
    return [actions(context),...(rows.length?rows.map(row=>card(row.number,facts([
      ['Typ',movementKinds[row.card_type]],['Datum',row.card_date],['Dodavatel',row.supplier],['Reference',row.reference],
    ]),action('Otevřít doklad',()=>branch('card-detail',row.id)))):[element('p',{},'Sklad nemá žádný doklad.')])];
  }
  if (!id) throw Error('Vyber doklad ze seznamu.');
  const resource=endpoint('/cards/'+id);
  const row=await read(resource);
  const back=()=>branch('cards');
  const controls=element('div',{class:'actions'},action('Zpět na doklady',back),action('Zpět na sklad',home));
  if (admin) controls.append(action('Odstranit skladový doklad',()=>remove(context,'Odstranit doklad',
    'Odstraněním dokladu '+row.number+' se vrátí jeho pohyby. Dostatečnou zásobu ověří sklad.',
    resource,async()=>{
      await missing(read,resource);
      const ingredients=new Set(row.items.map(item=>item.ingredient_id));
      for (const itemId of ingredients) {
        const ingredient=await read(endpoint('/'+itemId));
        if (ingredient.movements.some(movement=>movement.card_id===row.id)) throw Error('V evidenci zůstaly pohyby tohoto dokladu.');
      }
    },back)));
  return [card(row.number,facts([
    ['Typ dokladu',movementKinds[row.card_type]],['Datum',row.card_date],['Dodavatel',row.supplier],['Reference',row.reference],['Poznámka',row.note],
  ]),controls),element('h2',{},'Položky dokladu'),...row.items.map(item=>card(item.ingredient_name??'Položka '+item.ingredient_id,facts([
    ['Množství',item.quantity_base+' '+(item.unit??'')],['Kusy',item.quantity_pieces],['Poznámka',item.note],
  ])))];
}

function createDocument(context,inventory) {
  const {read,endpoint,branch}=context;
  if (!inventory.length) return [card(null,element('p',{},'Nejdřív založ skladovou položku.'),action('Zpět na sklad',context.home))];
  const lines=element('div');
  const status=element('p',{role:'status'});
  const map=new Map(inventory.map(item=>[item.id,item]));
  const type=options(Object.entries(movementKinds),'in',{name:'card_type'});
  const basic=element('div',{},inputField('Typ dokladu',type),
    inputField('Datum dokladu',element('input',{type:'date',name:'card_date',value:today(),required:true})),
    inputField('Dodavatel',element('input',{name:'supplier',maxlength:255})),
    inputField('Reference',element('input',{name:'reference',maxlength:64})),
    inputField('Poznámka',element('textarea',{name:'note',maxlength:2000})));
  const form=element('form',{},basic,lines,action('Přidat řádek',append),status,
    element('div',{class:'actions'},action('Zrušit',context.home),
      element('button',{type:'submit',class:'primary'},text('Uložit doklad'))));
  let sequence=0;
  function append() {
    sequence++;
    const item=options(inventory.map(row=>[row.id,row.name+' · '+row.unit]),inventory[0].id,{name:'ingredient_id'});
    const details=element('p',{role:'status'});
    function showBalance() {
      const row=map.get(Number(item.value));
      details.textContent='Na skladě '+row.current_stock+' '+row.unit+' · 1 ks obsahuje '+row.amount_per_piece_base+' '+row.unit;
    }
    const fieldset=element('fieldset',{},element('legend',{},'Řádek '+sequence),inputField('Položka',item),details,
      numberField('Množství v základních jednotkách','quantity_base',1,1),
      numberField('Počet kusů','quantity_pieces',0,0),
      inputField('Poznámka k řádku',element('textarea',{name:'line_note',maxlength:2000})),
      action('Odebrat řádek',()=>{
        if (lines.childElementCount===1) {status.textContent='Doklad musí mít alespoň jeden řádek.';return;}
        fieldset.remove();
      }));
    item.addEventListener('change',showBalance);
    showBalance();
    lines.append(fieldset);
  }
  append();
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const fields = new FormData(form);
    const items = Array.from(lines.children,line=>({
      ingredient_id:Number(line.elements.ingredient_id.value),quantity_base:Number(line.elements.quantity_base.value),
      quantity_pieces:Number(line.elements.quantity_pieces.value),note:line.elements.line_note.value.trim()||null,
    }));
    const totals=new Map();
    for (const item of items) totals.set(item.ingredient_id,(totals.get(item.ingredient_id)??0)+item.quantity_base);
    const mode=fields.get('card_type');
    const invalidItem=items.some(item=>!map.has(item.ingredient_id)||!Number.isSafeInteger(item.quantity_base)||
      item.quantity_base<1||item.quantity_base>intMax||!Number.isSafeInteger(item.quantity_pieces)||item.quantity_pieces<0||item.quantity_pieces>intMax);
    const invalidTotal=[...totals].some(([ingredient,amount])=>!Number.isSafeInteger(amount)||amount>intMax||
      (mode==='in'?map.get(ingredient).current_stock+amount>intMax:amount>map.get(ingredient).current_stock));
    if (!Object.hasOwn(movementKinds,mode)||!items.length||invalidItem||invalidTotal) {
      status.textContent='Součet jednoho nebo více řádků překračuje skladovou zásobu nebo podporovaný rozsah.';
      return;
    }
    const extra=name=>String(fields.get(name)??'').trim()||null;
    const data={card_type:mode,card_date:fields.get('card_date'),supplier:extra('supplier'),
      reference:extra('reference'),note:extra('note'),items};
    void commit(form,{
      read,path:endpoint('/cards'),body:data,
      verify:async result=>{
        if (!Number.isInteger(result?.id)) throw Error('Uložený skladový doklad nemá ID.');
        const actual=await read(endpoint('/cards/'+result.id));
        if (['card_type','card_date','supplier','reference','note'].some(key=>actual[key]!==data[key])||
          actual.items.length!==items.length||actual.items.some((item,index)=>Object.entries(items[index]).some(([key,value])=>item[key]!==value))) {
          throw Error('Uložený doklad se liší v údajích nebo v řádcích.');
        }
        for (const [ingredient,total] of totals) {
          const snapshot=await read(endpoint('/'+ingredient));
          const movements=snapshot.movements.filter(item=>item.card_id===actual.id);
          if (movements.reduce((amount,item)=>amount+item.quantity,0)!==total||
            movements.some(item=>item.movement_type!==mode||item.card_number!==actual.number)) {
            throw Error('Původní pohyby nepotvrdily uložený skladový doklad.');
          }
        }
      },
      done:result=>branch('card-detail',result.id),
    });
  });
  return [card('Skladový doklad',form)];
}

export async function history(context) {
  const {read,endpoint,branch}=context;
  const rows=await read(endpoint('/movements'));
  const search=element('input',{type:'search',placeholder:'Položka, doklad nebo poznámka'});
  const type=options([['','Všechny typy'],...Object.entries(movementKinds)],'');
  const body=element('div');
  const update=()=>{
    const query=search.value.trim().toLocaleLowerCase('cs');
    const result=rows.filter(row=>(!type.value||row.movement_type===type.value)&&
      [row.item_name,row.document_number,row.document_reference,row.note].some(value=>String(value??'').toLocaleLowerCase('cs').includes(query)));
    body.replaceChildren(...result.map(row=>card(row.item_name??'Skladový pohyb',facts([
      ['Datum',row.document_date],['Doklad',row.card_number??row.document_number],['Typ',movementKinds[row.movement_type]],
      ['Množství',row.quantity+' '+(row.unit??'')],['Kusy',row.quantity_pieces],['Poznámka',row.note],
    ]),row.card_id?action('Otevřít původní doklad',()=>branch('card-detail',row.card_id)):null)));
    if (!result.length) body.append(element('p',{},'Pohyby pro tento filtr nejsou dostupné.'));
  };
  type.addEventListener('change',update);
  search.addEventListener('input',update);
  update();
  return [actions(context),card(null,inputField('Typ pohybu',type),inputField('Hledat pohyb',search)),body];
}
