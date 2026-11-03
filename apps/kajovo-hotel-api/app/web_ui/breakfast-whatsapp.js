import {api} from './api.js';
import {el,field,button,panel,notice,formData,showError} from './ui.js';

const path='api/v1/admin/settings/breakfast-whatsapp';
const stamp=value=>value?new Date(value).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'}):'—';
const states={preparing:'Načítání snídaní',ready:'Připraveno',pending:'Čeká na odeslání',queued:'Ve frontě WhatsApp',submitting:'Předává se',accepted:'Přijato poskytovatelem',delivered:'Doručeno',read:'Přečteno',unknown:'Výsledek není ověřen',blocked:'Odesílání pozastaveno',failed:'Neúspěšné',cancelled:'Zrušeno',needs_attention:'Vyžaduje kontrolu'};

export async function breakfastWhatsappSettings(ctx,main){
 const generation=ctx.state.generation,wrapper=el('section',{class:'breakfast-whatsapp'});
 const current=()=>generation===ctx.state.generation;
 const render=data=>{
  if(!current())return;
  const enabled=el('input',{type:'checkbox',name:'enabled',checked:data.enabled,disabled:!data.transport_configured&&!data.enabled});
  const phones=el('textarea',{name:'recipients',rows:4,maxlength:1000,placeholder:'+420123456789',spellcheck:'false'},data.recipients.join('\n'));
  const feedback=el('div',{'aria-live':'polite'}),previewBox=el('div',{'aria-live':'polite'});
  const save=el('button',{type:'submit'},'Uložit zasílání snídaní');
  const reload=button('Obnovit nastavení',async()=>{reload.disabled=true;try{render(await api(path));}catch(error){showError(feedback,error);reload.disabled=false;}});
  const preview=button('Načíst náhled na zítřek',async()=>{
   preview.disabled=true;
   try{const result=await api(path+'/preview');if(current())previewBox.replaceChildren(notice(el('div',{},el('strong',{},result.message),el('p',{},'Ověřeno: '+stamp(result.source_checked_at)+'. Náhled neodesílá zprávu.'))));}
   catch(error){if(current())showError(previewBox,error);}finally{preview.disabled=false;}
  });
  const form=el('form',{},el('label',{class:'check-field'},enabled,'Každý den posílat počet snídaní na zítřek'),
   el('div',{class:'form-grid'},field('Čas odeslání (český čas)','send_time','time',data.send_time,{required:true,step:60}),
    el('label',{class:'field phone-field'},el('span',{},'Telefonní čísla WhatsApp'),phones,el('small',{},'Jedno číslo na řádek včetně předvolby, například +420123456789. Nejvýše 20 příjemců.'))),
   notice('Souhrn obsahuje datum a celkový počet snídaní na následující den. Změny platí pro další plánované odeslání. Již předané zprávy nelze odvolat.'),
   el('p',{'data-next-run':'true'},data.enabled?'Příští odeslání: '+stamp(data.next_run_at):'Automatické odesílání je vypnuté.'),
   feedback,el('div',{class:'actions'},save,reload,preview),previewBox);
  if(!data.transport_configured)form.prepend(notice('WhatsApp připojení není na serveru připravené. Čísla a čas lze uložit, zapnutí bude dostupné po jeho zprovoznění.','warning'));
  let saving=false;
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;
   const values=formData(form),payload={enabled:enabled.checked,send_time:values.send_time,recipients:values.recipients.split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean),revision:data.revision};
   if(payload.enabled&&!payload.recipients.length){showError(feedback,Error('Pro zapnutí zadejte alespoň jedno telefonní číslo.'));return;}
   saving=true;save.disabled=true;reload.disabled=true;
   try{
    const stored=await api(path,{method:'PUT',body:payload});
    const verified=await api(path);
    if(verified.revision!==stored.revision||verified.enabled!==stored.enabled||verified.send_time!==stored.send_time||JSON.stringify(verified.recipients)!==JSON.stringify(stored.recipients))throw Error('Následné načtení nepotvrdilo uložené nastavení.');
    if(current()){render(verified);wrapper.querySelector('[aria-live]').append(notice('Nastavení je uloženo a ověřeno načtením.'));}
   }catch(error){
    if(current()){showError(feedback,error);feedback.append(notice('Před dalším uložením obnovte nastavení. Původní požadavek se nebude opakovat.','warning'));}
   }finally{reload.disabled=false;}
  });
  const history=el('div',{class:'breakfast-whatsapp-history'});
  if(data.last_run){const run=data.last_run;history.append(el('h3',{},'Poslední souhrn'),el('p',{},'Snídaně '+run.service_date+' · '+(run.breakfast_count??'počet není ověřen')+' · '+(states[run.state]??run.state)));
   if(run.error_code)history.append(notice('Data nebo odeslání nejsou dostupné: '+run.error_code,'warning'));
   for(const delivery of run.deliveries)history.append(el('p',{},delivery.recipient+' · '+(states[delivery.state]??delivery.state)+(delivery.error_code?' · '+delivery.error_code:'')));
   history.append(el('small',{},'Přijetí poskytovatelem ještě neznamená doručení. Stav aktualizuje doručenka WhatsApp.'));
  }
  wrapper.replaceChildren(panel('Denní souhrn snídaní přes WhatsApp',el('div',{},form,history),'send'));
 };
 main.append(wrapper);render(await api(path));
}
