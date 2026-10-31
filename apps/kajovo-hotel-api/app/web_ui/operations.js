import {api,getRole} from './api.js';
import {el,button,notice,showError} from './ui.js';

// Capture the payload before entering this function. Accepted writes are kept
// apart from their subsequent read-back; a failed read can never create again.
export async function saveMutation(container,{path,method='POST',body,verify,done}){
 if(container.nativeMutation)return;
 const role=container.dataset.nativeRole||container.closest('dialog')?.dataset.nativeRole||getRole();
 const apiRead=(path,options={})=>api(path,{...options,roleOverride:role});
 const operation={id:crypto.randomUUID(),accepted:false,result:null,reading:false,role};
 container.nativeMutation=operation;
 const controls=[...container.querySelectorAll('button,input,select,textarea')],previous=controls.map(n=>n.disabled);
 controls.forEach(n=>n.disabled=true);
 const progress=notice('Ukládám a ověřuji výsledek…');container.prepend(progress);
 const verified=async()=>{
  await verify?.(operation.result,{id:operation.id,read:apiRead});
  progress.remove();operation.finished=true;
  await done?.(operation.result,{id:operation.id,read:apiRead});
 };
 const recovery=()=>{
  progress.remove();
  if(container.querySelector('[data-native-recovery]'))return;
  const box=el('div',{'data-native-recovery':'',class:'native-recovery'},notice('Zápis se nebude opakovat. Nejdříve ověřte původní výsledek.','warning'));
  const read=button('Načíst původní výsledek',async()=>{
   if(operation.reading||operation.finished)return;operation.reading=true;read.disabled=true;
   try{
    if(!operation.accepted){
     const receipt=await apiRead('api/request-status?request_id='+encodeURIComponent(operation.id));
     if(receipt.state!=='completed')throw Error('Původní výsledek dosud není ověřený. Další zápis se neprovede.');
     if(receipt.status<200||receipt.status>=300)throw Error('Původní požadavek vrátil chybu. Účinek tím není potvrzený; načtěte aktuální údaje.');
     operation.result=receipt.body;operation.accepted=true;
    }
    await verified();box.remove();
   }catch(error){showError(box,error);}finally{operation.reading=false;if(read.isConnected)read.disabled=false;}
  });box.append(read);container.prepend(box);
  // A long native document scrolls in the CML viewport. Bring the recovery
  // action to its center so a fixed shell header cannot cover it in WebKit.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(read.isConnected&&!document.hidden&&parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cml-visible-height'))!==0){read.scrollIntoView({block:'center',inline:'nearest'});read.focus({preventScroll:true});}}));
 };
 try{
  operation.result=await api(path,{method,body,id:operation.id,roleOverride:role});operation.accepted=true;
  await verified();
 }catch(error){
  progress.remove();showError(container,error);
  if(operation.accepted||error.uncertain)recovery();
  else{delete container.nativeMutation;controls.forEach((n,i)=>n.disabled=previous[i]);}
 }
}

// A write-only worker can read its own stored response, never the wider record
// catalog. This proves the acknowledged creation, not a later business state.
export async function storedMutation(read,id){
 const receipt=await read('api/request-status?request_id='+encodeURIComponent(id));
 if(receipt.state!=='completed'||receipt.status<200||receipt.status>=300)throw Error('Původní potvrzení není dostupné. Zápis se nebude opakovat.');
 return receipt.body;
}
