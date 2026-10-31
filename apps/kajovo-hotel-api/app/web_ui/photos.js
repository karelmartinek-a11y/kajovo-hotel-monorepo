import {api,getRole,exportLink} from './api.js';
import {el,icon,button,notice,modal,showError} from './ui.js';
import {saveMutation,storedMutation} from './operations.js';
const accepted=new Set(['image/jpeg','image/png','image/webp']);
export async function photoDocumentation(ctx,config,row,canUpload,refresh,{writeOnly=false,role=getRole(),onSaved}={}){
 const root=el('div',{class:'photo-documentation'}),generation=ctx.state.generation,urls=[];
 ctx.state.cleanup??=[];ctx.state.cleanup.push(()=>urls.forEach(url=>URL.revokeObjectURL(url)));
 const photos=writeOnly?(row.photos??[]):await api('api/v1/'+config.path+'/'+row.id+'/photos',{roleOverride:role});if(generation!==ctx.state.generation)return root;
 const gallery=el('div',{class:'photo-gallery'});root.append(gallery);
 if(writeOnly)gallery.append(notice('Připojených fotografií: '+photos.length+'. Prohlížení evidence fotografií v této pracovní roli není dostupné.'));
 if(!writeOnly&&!photos.length)gallery.append(el('div',{class:'photo-empty'},icon('camera'),el('span',{},'K tomuto záznamu nejsou připojené fotografie.')));
 for(const [index,photo] of (writeOnly?[]:photos).entries()){
  const path='api/v1/'+config.path+'/'+row.id+'/photos/'+photo.id,preview=el('img',{alt:'Fotografie záznamu '+(index+1),loading:'lazy'}),box=el('figure',{},preview,el('figcaption',{},'Fotografie '+(index+1)+' · '+photo.size_bytes.toLocaleString('cs-CZ')+' B'),el('div',{class:'actions'},button('Zvětšit',async()=>{
   try{const image=await api(path+'/original',{blob:true,roleOverride:role});if(generation!==ctx.state.generation)return;const url=URL.createObjectURL(image);const dialog=modal('Fotografie záznamu '+(index+1),()=>el('img',{class:'photo-original',src:url,alt:'Fotografie záznamu '+(index+1)}));dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});}catch(error){showError(root,error);}
  }),exportLink(path+'/original?download=true','Stáhnout originál')));gallery.append(box);
  try{const image=await api(path+'/thumb',{blob:true,roleOverride:role});if(generation!==ctx.state.generation)return root;const url=URL.createObjectURL(image);urls.push(url);preview.src=url;preview.addEventListener('error',()=>{preview.hidden=true;box.prepend(notice('Náhled fotografie není dostupný.','warning'));},{once:true});}catch(error){box.prepend(notice(error.message,'error'));}
 }
 if(canUpload){
  ctx.state.photoDrafts??=new Map();const draftKey=config.path+':'+row.id,existing=ctx.state.photoDrafts.get(draftKey);if(existing){root.append(existing);return root;}
  const files=el('input',{type:'file',multiple:true,accept:'image/jpeg,image/png,image/webp','aria-label':'Fotografie k připojení',required:true}),form=el('form',{class:'photo-upload'},el('div',{class:'field'},el('span',{},'Připojit fotografie'),el('label',{class:'photo-file-picker'},files,el('span',{},'Vybrat fotografie')),el('small',{'data-photo-files':''},'Žádné vybrané fotografie'),el('small',{},'JPEG, PNG nebo WebP. Nejvýše 3 soubory, každý do 2 MB.')),el('button',{type:'submit'},icon('upload'),'Nahrát fotografie'));form.dataset.nativeRole=role;ctx.state.photoDrafts.set(draftKey,form);files.addEventListener('change',()=>form.querySelector('[data-photo-files]').textContent=[...files.files].map(file=>file.name).join(' · ')||'Žádné vybrané fotografie');
  form.addEventListener('submit',event=>{
   event.preventDefault();const chosen=[...files.files];if(!chosen.length||chosen.length>3||chosen.some(file=>!accepted.has(file.type)||file.size<=0||file.size>2_000_000)){showError(form,Error('Vyberte 1 až 3 fotografie JPEG, PNG nebo WebP, každou do 2 MB.'));return;}
   const previous=new Set(photos.map(photo=>photo.id)),body=new FormData();chosen.forEach(file=>body.append('photos',file));
   saveMutation(form,{path:'api/v1/'+config.path+'/'+row.id+'/photos',body,verify:async(result,{id,read})=>{
    const added=result.filter(photo=>!previous.has(photo.id));if(added.length!==chosen.length)throw Error('Odpověď nepotvrdila všechny fotografie.');const current=writeOnly?await storedMutation(read,id):await read('api/v1/'+config.path+'/'+row.id+'/photos');
    if(added.some((photo,index)=>!current.some(actual=>actual.id===photo.id&&actual.size_bytes===chosen[index].size&&actual.mime_type===chosen[index].type)))throw Error('Připojené fotografie nebyly potvrzeny následným načtením.');
   },done:async result=>{onSaved?.(result);ctx.state.photoDrafts.delete(draftKey);await refresh();}});
  });root.append(form);
 }
 return root;
}
