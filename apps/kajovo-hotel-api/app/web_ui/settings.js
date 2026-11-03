import {api} from './api.js';
import {el,icon,field,button,panel,notice,formData,showError} from './ui.js';
import {breakfastWhatsappSettings} from './breakfast-whatsapp.js';
const stamp=value=>value?new Date(value).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'}):'Dosud netestováno';
export async function hotelSettings(ctx){
 const generation=ctx.state.generation,main=ctx.heading('hotel.admin.27','Nastavení Hotelu','Nastavte denní WhatsApp souhrn snídaní a odesílání e-mailů Hotelu.');
 const [stored,operational]=await Promise.all([api('api/v1/admin/settings/smtp'),api('api/v1/admin/settings/smtp/status')]);if(generation!==ctx.state.generation)return;
 const password=field('SMTP heslo','password','password','',{autocomplete:'new-password','aria-label':'SMTP heslo',maxlength:1024,required:!stored.password_masked}),secret=password.querySelector('input');
 const reveal=button(icon('eye'),event=>{const visible=secret.type==='password';secret.type=visible?'text':'password';event.currentTarget.setAttribute('aria-label',visible?'Skrýt heslo':'Zobrazit heslo');});reveal.setAttribute('aria-label','Zobrazit heslo');password.append(el('div',{class:'password-wrap'},secret,reveal));password.append(el('small',{},'Ponecháním prázdného pole zachováte uložené heslo.'));
 const toggle=(name,title,checked)=>el('label',{class:'check-field smtp-transport'},el('input',{type:'checkbox',name,checked}),title),tls=toggle('use_tls','Použít TLS',stored.use_tls),ssl=toggle('use_ssl','Použít SSL',stored.use_ssl),port=field('SMTP port','port','number',stored.port,{required:true,min:1,max:65535,step:1});
 for(const [source,other] of [[tls,ssl],[ssl,tls]])source.querySelector('input').addEventListener('change',()=>{if(source.querySelector('input').checked)other.querySelector('input').checked=false;});
 const recipient=field('Testovací příjemce','recipient','email','',{maxlength:255}),feedback=el('div',{'aria-live':'polite'}),save=el('button',{type:'submit'},icon('save'),'Uložit SMTP'),test=button([icon('send'),'Odeslat testovací e-mail'],sendTest,'primary');
 const form=el('form',{class:'smtp-settings'},notice(el('div',{},el('strong',{},stored.password_masked?'Heslo je uložené.':'Heslo dosud není uložené.'),el('p',{},'Uloženou hodnotu nelze zobrazit. Novou zadejte pouze při změně konfigurace.'))),el('div',{class:'form-grid'},field('SMTP odesílatel','from_email','email',stored.from_email,{required:true,maxlength:255}),field('SMTP host','host','text',stored.host,{required:true,maxlength:255}),port,field('SMTP uživatel','username','text',stored.username,{required:true,maxlength:255}),password,recipient,tls,ssl),feedback,el('div',{class:'actions smtp-actions'},save,test));
 let saving=false,saveAccepted=false,testPending=false;
 const readStatus=async()=>{const status=await api('api/v1/admin/settings/smtp/status');feedback.append(notice('Poslední dostupný test: '+stamp(status.last_tested_at)+(status.last_test_recipient?' · '+status.last_test_recipient:'')+' · '+(status.last_test_success===true?'úspěšný':status.last_test_success===false?'neúspěšný':'výsledek není známý')));return status;};
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving||saveAccepted)return;const values=formData(form),payload={from_email:values.from_email.trim().toLowerCase(),host:values.host.trim(),port:Number(values.port),username:values.username.trim(),use_tls:values.use_tls==='on',use_ssl:values.use_ssl==='on'};
  if(values.password)payload.password=values.password;
  if(payload.use_tls&&payload.use_ssl||payload.port===465&&payload.use_tls||payload.port===587&&payload.use_ssl){showError(form,Error('Zkontrolujte režim TLS/SSL pro zadaný port.'));return;}
  saving=true;save.disabled=true;test.disabled=true;
  const verify=async()=>{const current=await api('api/v1/admin/settings/smtp');for(const key of ['from_email','host','port','username','use_tls','use_ssl'])if(current[key]!==payload[key])throw Error('Následné načtení nepotvrdilo uloženou konfiguraci.');return current;};
  try{
   await api('api/v1/admin/settings/smtp',{method:'PUT',body:payload});saveAccepted=true;secret.value='';
   await verify();feedback.replaceChildren(notice('Konfigurace SMTP je uložena a ověřena načtením. Připojení ověří až samostatný test.'));saveAccepted=false;
  }catch(error){
   showError(form,error);
   if(saveAccepted||error.uncertain){saveAccepted=true;feedback.append(notice('Změna se nebude znovu odesílat. Nejprve načtěte aktuální konfiguraci.','warning'),button('Načíst konfiguraci po změně',async()=>{try{await verify();secret.value='';feedback.append(notice(payload.password?'Adresa a server odpovídají změně. Uložení nového hesla po ztracené odpovědi nelze samostatně potvrdit.':'Aktuální konfigurace odpovídá změně.'));}catch(e){showError(feedback,e);}}));}
  }finally{saving=false;save.disabled=saveAccepted;test.disabled=testPending||!operational.can_send_real_email;}
 });
 async function sendTest(){
  if(testPending)return;if(!recipient.querySelector('input').value||!recipient.querySelector('input').reportValidity())return;
  const target=recipient.querySelector('input').value;testPending=true;test.disabled=true;
  try{const result=await api('api/v1/admin/settings/smtp/test-email',{method:'POST',body:{recipient:target}});feedback.append(notice(result.message+(result.send_attempted?' SMTP přijetí není potvrzením doručení.':'')));await readStatus();testPending=false;}
  catch(error){showError(feedback,error);if(error.uncertain)feedback.append(button('Načíst stav posledního testu',()=>readStatus().catch(e=>showError(feedback,e))));else testPending=false;}
  finally{test.disabled=testPending;}
 }
 test.disabled=!operational.can_send_real_email;if(!operational.can_send_real_email)form.append(notice('Odesílání e-mailů není na serveru aktivní.'));
 main.append(panel('Odesílání e-mailů Hotelu',form,'gear'));
 await breakfastWhatsappSettings(ctx,main);
}
