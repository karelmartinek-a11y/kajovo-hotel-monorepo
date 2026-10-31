import {prefix} from './api.js';
// The opaque section can request only its declared date. No storage key or
// central credentials are exposed to the section.
function exchange(type,key,value){
 if(parent===window)return Promise.resolve(null);
 return new Promise(resolve=>{
  const requestId=crypto.randomUUID();let timer;
  const finish=result=>{clearTimeout(timer);removeEventListener('message',receive);resolve(result);};
  const receive=event=>{const data=event.data;if(event.source!==parent||event.origin!==location.origin||data?.type!=='CML_SECTION_STATE_RESULT'||data.prefix!==prefix||data.requestId!==requestId||data.key!==key)return;finish(data.ok?data.value:null);};
  addEventListener('message',receive);timer=setTimeout(()=>finish(null),2000);
  parent.postMessage({type,prefix,requestId,key,...(value===undefined?{}:{value})},location.origin);
 });
}
export const readBreakfastDate=()=>exchange('CML_SECTION_STATE_READ','breakfast-date');
export const writeBreakfastDate=value=>exchange('CML_SECTION_STATE_WRITE','breakfast-date',value);
