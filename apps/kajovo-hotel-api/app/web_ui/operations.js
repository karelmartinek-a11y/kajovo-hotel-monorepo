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
  await done?.(operation.result);
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
