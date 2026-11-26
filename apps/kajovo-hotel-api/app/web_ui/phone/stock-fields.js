import {action,element,inputField,sheet} from './controls.js';
import {commit} from './transport.js';

export const movementKinds={in:'Příjem',out:'Výdej',adjust:'Odpis'};
export const intMax=2147483647;
export const units=['ks','g','l'];
export function numberField(label,name,value,min,max=intMax) {
  return inputField(label,element('input',{type:'number',name,value,min,max,step:1,required:true}));
}

export function remove(context,title,message,endpoint,verify,done) {
  const body=element('div',{},element('p',{},message));
  body.append(action('Potvrdit odstranění',()=>commit(body,{
    read:context.read,path:endpoint,method:'DELETE',verify,
    done:async()=>{box.close();await done();},
  }),true));
  const box=sheet(title,body);
}

export async function missing(read,path) {
  try {await read(path);} catch(error) {if(error.status===404) return;throw error;}
  throw Error('Záznam je v evidenci stále přítomný.');
}
