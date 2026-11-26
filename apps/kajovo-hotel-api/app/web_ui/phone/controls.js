import {text} from './locale.js';

export function element(tag,attrs = {},...children) {
  const item = document.createElement(tag);
  for (const [name,value] of Object.entries(attrs)) {
    if (value!==null && value!==undefined && value!==false) item.setAttribute(name,value===true?'':String(value));
  }
  item.append(...children.filter(child=>child!==undefined && child!==null));
  return item;
}

export function action(label,handler,emphasized = false) {
  const button = element('button',{type:'button',class:emphasized?'primary':null},text(label));
  button.addEventListener('click',handler);
  return button;
}

export function inputField(label,control) {
  control.setAttribute('aria-label',text(label));
  return element('label',{},text(label),control);
}

export function options(values,selected,attrs = {}) {
  const menu = element('select',attrs,...values.map(([value,label])=>element('option',{value},label)));
  if (selected!=null) menu.value = selected;
  return menu;
}

export function card(title,...children) {
  return element('section',{class:'card'},title?element('h2',{},title):null,...children);
}

export function facts(rows) {
  return element('dl',{},...rows.flatMap(([name,value])=>[
    element('dt',{},text(name)),element('dd',{},value==null || value===''?'—':String(value)),
  ]));
}

export function sheet(title,content) {
  const heading = element('h2',{},text(title));
  const close = action('Zavřít',()=>{if (!content.querySelector('[data-pending]')&&!content.dataset.pending) dialog.close();});
  const toolbar = element('header',{class:'sheet-head'},heading,close);
  const dialog = element('dialog',{'aria-label':text(title)},toolbar,content);
  dialog.addEventListener('cancel',event=>{
    if (content.querySelector('[data-pending]')||content.dataset.pending) event.preventDefault();
  });
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

const calendar = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'});
export const today = ()=>calendar.format(new Date());
export function moveDay(day,delta) {
  const value = new Date(day+'T12:00:00Z');
  value.setUTCDate(value.getUTCDate()+delta);
  return value.toISOString().slice(0,10);
}

export function dateBar(day,change) {
  const input = element('input',{type:'date',required:true});
  input.value = day;
  input.addEventListener('change',()=>{if(input.validity.valid && input.value) change(input.value);});
  return element('div',{class:'actions'},
    action('Předchozí den',()=>change(moveDay(day,-1))),
    inputField('Datum',input),
    action('Další den',()=>change(moveDay(day,1))));
}
