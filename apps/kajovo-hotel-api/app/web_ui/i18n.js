import {translations} from './translations.js';
const languages=['cs','en','uk'];
const requested=new URLSearchParams(globalThis.location?.search??'').get('lang');
export const locale=languages.includes(requested)?requested:'cs';
export const t=text=>locale==='cs'?text:(translations[text]?.[languages.indexOf(locale)-1]??text);
if(globalThis.document)document.documentElement.lang=locale;
export function restoreLocale(identity){
 const selected=requested??identity.preferred_locale??'cs';
 const valid=(identity.languages??['cs']).includes(selected)?selected:'cs';
 if(valid===locale)return false;
 const url=new URL(location.href);url.searchParams.set('lang',valid);location.replace(url);return true;
}
export function languageSelector(identity,{save,error}){
 const label=document.createElement('label');label.className='native-language';
 const caption=document.createElement('span');caption.textContent=t('Jazyk');label.append(caption);
 const select=document.createElement('select');select.name='locale';select.setAttribute('aria-label',t('Jazyk'));
 const names={cs:'Čeština',en:'English',uk:'Українська'};
 for(const value of languages.filter(v=>(identity.languages??['cs']).includes(v))){const option=document.createElement('option');option.value=value;option.textContent=names[value];option.selected=value===locale;select.append(option);}
 select.addEventListener('change',async()=>{
  select.disabled=true;const selected=select.value;
  try{await save(selected);const url=new URL(location.href);url.searchParams.set('lang',selected);location.assign(url);}
  catch(e){select.value=locale;error(e);select.disabled=false;}
 });label.append(select);return label;
}
