import {element} from './controls.js';
import {request} from './transport.js';

const fragment = new URLSearchParams(location.hash.slice(1));
const ticket = fragment.get('ticket');
const purpose = document.querySelector('#purpose');
const scopes = document.querySelector('#scopes');
const approve = document.querySelector('#approve');
const result = document.querySelector('#result');
const failed = 'Požadavek na připojení nešlo ověřit. Zahajte připojení znovu v ChatGPT.';
const submit = action=>request('oauth/consent',{method:'POST',body:{ticket,action}});

if (fragment.size!==1 || !/^[A-Za-z0-9_-]{43}$/.test(ticket??'')) purpose.textContent='V odkazu chybí jednorázová žádost.';
else {
  try {
    const reply = await submit('inspect');
    if (!Array.isArray(reply.scopes)||!reply.scopes.length||reply.scopes.some(scope=>typeof scope!=='string')) throw Error();
    purpose.textContent='ChatGPT žádá o následující oprávnění';
    scopes.replaceChildren(...reply.scopes.map(scope=>element('li',{},scope)));
    approve.disabled = false;
  } catch {
    purpose.textContent=failed;
  }
}

approve.addEventListener('click',async()=>{
  approve.disabled=true;
  try {
    const response=await submit('approve');
    const destination=new URL(response.redirect);
    if (destination.origin!=='https://chatgpt.com'||destination.username||destination.password) throw Error();
    const link=element('a',{href:destination.href,target:'_top',rel:'noreferrer'},'Dokončit v ChatGPT');
    result.replaceChildren(link);
    approve.remove();
    link.focus();
  } catch {
    result.textContent=failed;
  }
});
