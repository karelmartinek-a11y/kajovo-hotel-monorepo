export const prefix='/sections/hotel/';
let role=null;
export const setRole=v=>role=v;
export const getRole=()=>role;
export async function api(path,{method='GET',body,blob=false,id,roleOverride}={}){
 const target=new URL(prefix+path,location.origin);const selected=roleOverride??role;if(selected)target.searchParams.set('_role',selected);
 const mutation=!['GET','HEAD'].includes(method),requestId=mutation?(id??crypto.randomUUID()):null,multipart=body instanceof FormData;
 let r;try{r=await fetch(target,{method,headers:{...(body===undefined||multipart?{}:{'Content-Type':'application/json'}),...(requestId?{'Idempotency-Key':requestId}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});}
 catch{const error=Error(mutation?'Výsledek zápisu není ověřený. Načtěte původní výsledek.':'Data nejsou dostupná.');error.uncertain=mutation;error.requestId=requestId;throw error;}
 if(!r.ok){
  let data;try{data=await r.json();}catch{}
  const validation=Array.isArray(data?.detail)?data.detail.map(v=>(v.loc??[]).filter(x=>x!=='body').join(' · ')+': '+v.msg).join('; '):null;
  const error=Error(data?.error?.message??data?.detail?.message??(typeof data?.detail==='string'?data.detail:null)??validation??'Požadavek nebyl povolen nebo se nepodařil.');
  error.status=r.status;error.code=data?.error?.code;error.requestId=requestId;error.uncertain=mutation&&(data?.uncertain===true||![401,403,422].includes(r.status));throw error;
 }
 if(r.status===204)return null;return blob?r.blob():r.json();
}
export function view(id,title,description){
 const main=document.querySelector('#content');main.dataset.view=id;main.replaceChildren();const crumb=document.createElement('div');crumb.className='crumb';crumb.textContent='KájovoCML Ng Lite  ›  KájovoHotel';const label=document.createElement('div');label.className='eyebrow';label.textContent=id;const heading=document.createElement('h1');heading.textContent=title;const p=document.createElement('p');p.className='page-description';p.textContent=description;main.append(crumb,label,heading,p);parent.postMessage({type:'KAJOVO_VIEW',prefix,id},location.origin);return main;
}
export async function download(path,options={}){const blob=await api(path,{...options,blob:true}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=options.filename??'export';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

export function exportLink(path,label){
 const url=new URL(prefix+path,location.origin);if(url.origin!==location.origin||!url.pathname.startsWith(prefix))throw Error('Neplatná exportní cesta.');if(role)url.searchParams.set('_role',role);
 const link=document.createElement('a');link.className='button export-link';link.href=url.href;link.setAttribute('download','');link.textContent=label;return link;
}
