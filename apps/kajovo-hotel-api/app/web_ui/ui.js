import {t,locale} from './i18n.js';
import {getRole} from './api.js';
export function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(v===null||v===undefined||v===false)continue;if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='class')n.className=v;else if(k==='checked'||k==='disabled'||k==='readOnly')n[k]=v;else n.setAttribute(k,v===true?'':String(v));}for(const c of children.flat(Infinity))if(c!==null&&c!==undefined)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n;}
export const icon=name=>el('span',{class:'icon icon-'+name,'aria-hidden':'true'});
export const button=(text,fn,kind='')=>el('button',{type:'button',class:kind,onclick:fn},text);
export const field=(label,name,type='text',value='',extra={})=>el('label',{class:'field'},el('span',{},label),el('input',{name,type,value,'aria-label':label,...extra}));
export const select=(label,name,options,value)=>el('label',{class:'field'},el('span',{},label),el('select',{name,'aria-label':label},options.map(([id,text])=>el('option',{value:id,selected:id===value},text))));
export function notice(message,type=''){return el('div',{class:'notice '+type,role:type==='error'?'alert':'status'},message);}
export function panel(title,body,ico='dashboard'){return el('section',{class:'panel'},el('div',{class:'panel-title'},icon(ico),el('h2',{},title)),el('div',{class:'panel-body'},body));}
export function table(headers,rows){return el('div',{class:'table-scroll',tabindex:0},el('table',{},el('thead',{},el('tr',{},headers.map(t=>el('th',{scope:'col'},t)))),el('tbody',{},rows.length?rows.map(row=>el('tr',{},row.map(v=>el('td',{},v)))):el('tr',{},el('td',{colspan:headers.length,class:'empty'},t('Žádné záznamy.'))))));}
export function formData(form){return Object.fromEntries(new FormData(form));}
export function busy(form,task){const controls=[...form.querySelectorAll('button,input,select,textarea')],prior=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);return task().finally(()=>controls.forEach((n,i)=>n.disabled=prior[i]));}
export function showError(container,error){container.querySelector('[role=alert]')?.remove();container.prepend(notice(t(error.message),'error'));}
export function modal(title,build,options={}){
 const d=document.querySelector('#dialog'),announce=(id,title)=>parent.postMessage({type:'KAJOVO_VIEW',prefix:'/sections/hotel/',id,title},location.origin);
 const modalToken=Symbol('native-modal');d.nativeModalToken=modalToken;d.dataset.nativeRole=getRole()??'';d.className=options.className??'';delete d.dataset.mutationBusy;d.removeAttribute('aria-busy');
 d.replaceChildren(el('h2',{id:'dialog-title'},title));const close=()=>{if(d.nativeModalToken===modalToken)d.close();};d.append(build(close));d.append(el('div',{class:'actions'},button(t('Zavřít'),close)));
 d.onclose=()=>{if(d.open)return;d.replaceChildren();announce(document.querySelector('#content').dataset.view);};
 d.oncancel=event=>{if(d.dataset.mutationBusy==='true')event.preventDefault();};
 if(!d.open)d.showModal();if(options.id)announce(options.id,title);return d;
}
export function otp(name='code'){
 const hidden=el('input',{type:'hidden',name}),inputs=Array.from({length:6},(_,i)=>el('input',{type:'text',inputmode:'numeric',autocomplete:i===0?'one-time-code':'off',maxlength:1,'aria-label':t('Číslice ')+(i+1)})),box=el('div',{class:'otp',role:'group','aria-label':t('Šestimístný ověřovací kód')},hidden,inputs);
 const sync=()=>hidden.value=inputs.map(n=>n.value).join('');
 const fill=(value,index)=>{const digits=value.replace(/\D/g,'').slice(0,6-index);[...digits].forEach((c,j)=>inputs[index+j].value=c);sync();inputs[Math.min(5,index+digits.length)].focus();};
 inputs.forEach((n,i)=>{n.addEventListener('input',()=>{const v=n.value; n.value='';fill(v,i);});n.addEventListener('paste',e=>{e.preventDefault();fill(e.clipboardData.getData('text'),i);});n.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!n.value&&i>0){e.preventDefault();inputs[i-1].value='';sync();inputs[i-1].focus();}if(e.key==='ArrowLeft'&&i)inputs[i-1].focus();if(e.key==='ArrowRight'&&i<5)inputs[i+1].focus();});});
 return box;
}
