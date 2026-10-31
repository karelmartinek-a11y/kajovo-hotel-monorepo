import {api,getRole,prefix} from './api.js';
import {el,icon,field,button,panel,notice,modal,showError} from './ui.js';
const base='api/v1/chat/';
const date=value=>new Date(value+(/([Zz]|[+-]\d\d:\d\d)$/.test(value)?'':'Z')).toLocaleString('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'short',timeStyle:'short'});
export async function privateChat(ctx){
 const generation=ctx.state.generation,role=getRole(),main=ctx.heading(ctx.state.identity.admin?'hotel.admin.2':'hotel.portal.40','Soukromé zprávy','Soukromý textový chat 1:1. Seznam konverzací, nepřečtené počty, výběr oprávněného příjemce, načtení historie a odeslání zprávy. Přečtení až po otevření. Push opt-in a odhlášení zvlášť.');
 const entry=new URLSearchParams(location.search).get('conversation_id');
 const requested=/^[1-9][0-9]{0,9}$/.test(entry??'')&&Number(entry)<=2147483647?Number(entry):null;
 const store=ctx.state.chatStore??={selected:requested,threads:new Map(),attempts:new Map(),conversationAttempts:new Map()};
 for(const state of store.threads.values()){state.messages=new Map();state.oldest=null;state.older=true;state.lastSynced=null;}
 const active=()=>ctx.state.generation===generation&&ctx.state.view==='chat';
 const read=(path,options={})=>api(base+path,{...options,roleOverride:role});
 const directory=el('div',{class:'private-chat-directory'}),thread=el('div',{class:'private-chat-thread'}),status=el('div',{'aria-live':'polite'}),workspace=el('div',{class:'private-chat-workspace'},directory,thread),container=panel('Soukromé zprávy',[status,workspace],'chat');container.classList.add('private-chat-panel');main.append(container);
 let conversations=[],selection=0,loading=false,timer,readTimer,disposed=false,threadUI=null,catalogRevision=0,directorySnapshot='';
 const current=id=>active()&&store.selected===id;
 const local=id=>{if(!store.threads.has(id))store.threads.set(id,{messages:new Map(),draft:'',oldest:null,older:true,readThrough:0,readPending:null});return store.threads.get(id);};
 const updateDirectory=()=>{
  const snapshot=JSON.stringify([store.selected,conversations]);if(snapshot===directorySnapshot)return;directorySnapshot=snapshot;
  directory.replaceChildren(button([icon('plus'),'Nová konverzace'],newConversation,'primary'));
  if(!conversations.length)directory.append(el('p',{},'Zatím nemáte žádné konverzace.'));
  for(const conversation of conversations){const entry=button(el('strong',{},conversation.participant.display_name),()=>selectConversation(conversation.id));entry.className='private-chat-contact';entry.setAttribute('aria-current',String(store.selected===conversation.id));if(conversation.unread_count)entry.append(el('span',{class:'badge'},conversation.unread_count+' nové'));entry.append(el('small',{},conversation.participant.is_active?(conversation.last_message?.body??'Zatím bez zpráv'):'Neaktivní příjemce · zachovaná historie'));directory.append(entry);}
 };
 const messageBox=message=>el('article',{class:'message '+(message.is_mine?'mine':''),'data-message-id':message.id},el('p',{},message.body),el('small',{},date(message.sent_at)+(message.is_mine?(message.read_at?' · přečteno':' · přijato serverem'):'')));
 async function confirmAttempt(attempt){
  if(attempt.checking||attempt.state==='confirmed')return;attempt.checking=true;
  try{
   const result=await api(base+'messages/result?client_message_id='+encodeURIComponent(attempt.id),{roleOverride:role});
   if(result.state!=='confirmed'||!result.message)throw Error('Potvrzení odeslání zatím není dostupné. Zpráva se nebude opakovat.');
   const message=result.message;if(message.conversation_id!==attempt.conversationId||message.body!==attempt.body||message.is_mine!==true)throw Error('Původní výsledek neodpovídá této zprávě.');
   attempt.state='confirmed';attempt.message=message;const state=local(attempt.conversationId);state.messages.set(message.id,message);if(state.draft.trim()===attempt.body)state.draft='';
  }catch(error){attempt.state='unconfirmed';attempt.error=error.message;}finally{attempt.checking=false;}
  if(current(attempt.conversationId))await selectConversation(attempt.conversationId,{keepPosition:true});
 }
 async function markVisibleRead(conversation,messages){
  if(!current(conversation.id)||document.hidden)return;const state=local(conversation.id);if(state.marking)return;
  const style=getComputedStyle(document.documentElement),visibleTop=parseFloat(style.getPropertyValue('--cml-visible-top'))||0,visibleHeight=parseFloat(style.getPropertyValue('--cml-visible-height'))||0;
  if(visibleHeight<=0)return;const pane=messages.getBoundingClientRect(),top=Math.max(pane.top,visibleTop),bottom=Math.min(pane.bottom,visibleTop+visibleHeight);if(bottom<=top)return;
  if(state.readPending){
   try{const values=await read('conversations/'+conversation.id+'/messages?before_id='+(state.readPending+1)+'&limit=1');if(values[0]?.id===state.readPending&&values[0].read_at){state.readThrough=Math.max(state.readThrough,state.readPending);state.readPending=null;}}catch{}return;
  }
  const visible=[...messages.querySelectorAll('[data-message-id]')].map(node=>{const value=state.messages.get(Number(node.dataset.messageId)),box=node.getBoundingClientRect();return value&&!value.is_mine&&!value.read_at&&value.id>state.readThrough&&box.bottom>top&&box.top<bottom?value.id:0;});
  const through=Math.max(0,...visible);if(!through)return;state.marking=true;state.readPending=through;
  try{await read('conversations/'+conversation.id+'/read',{method:'POST',body:{through_message_id:through}});}catch(error){if(current(conversation.id))status.replaceChildren(notice('Stav přečtení není ověřený. Obnovení provede pouze načtení.','warning'));}finally{state.marking=false;}
 }
 function scheduleRead(conversation,messages){clearTimeout(readTimer);readTimer=setTimeout(()=>markVisibleRead(conversation,messages),250);}
 async function selectConversation(id,{keepPosition=false}={}){
  store.selected=id;const request=++selection,conversation=conversations.find(row=>row.id===id);if(!conversation){thread.replaceChildren(notice('Vyberte konverzaci nebo založte novou.'));return;}updateDirectory();const state=local(id),previous=threadUI?.id===id?thread.querySelector('.messages'):null,oldTop=previous?.scrollTop??0;
  try{const newest=await read('conversations/'+id+'/messages?limit=50');if(!current(id)||request!==selection)return;for(const message of newest)state.messages.set(message.id,message);if(state.oldest===null){state.oldest=newest[0]?.id??null;state.older=newest.length===50;state.lastSynced=newest.at(-1)?.id??0;}}
  catch(error){if(current(id)&&request===selection)showError(thread,error);return;}
  if(!current(id)||request!==selection)return;
  const header=el('div',{class:'private-chat-thread-head'},el('strong',{},conversation.participant.display_name),el('div',{class:'actions'},button([icon('refresh'),'Obnovit'],sync),button([icon('gear'),'Upozornění'],()=>notificationSettings(ctx))));
  const history=el('div',{class:'messages',role:'log','aria-label':'Historie konverzace'}),older=button('Načíst starší zprávy',async()=>{
   if(state.loadingOlder||!state.older)return;state.loadingOlder=true;older.disabled=true;const height=history.scrollHeight,position=history.scrollTop;
   try{const rows=await read('conversations/'+id+'/messages?before_id='+state.oldest+'&limit=50');if(!current(id)||request!==selection)return;rows.forEach(message=>state.messages.set(message.id,message));state.oldest=rows[0]?.id??state.oldest;state.older=rows.length===50;drawMessages();history.scrollTop=history.scrollHeight-height+position;}catch(error){if(current(id))showError(status,error);}finally{state.loadingOlder=false;older.disabled=false;older.hidden=!state.older;}
  });
  const nodes=new Map();const drawMessages=()=>{let index=0;for(const message of [...state.messages.values()].sort((a,b)=>a.id-b.id)){let node=nodes.get(message.id);if(!node){node=messageBox(message);nodes.set(message.id,node);}const caption=date(message.sent_at)+(message.is_mine?(message.read_at?' · přečteno':' · přijato serverem'):'');if(node.querySelector('small').textContent!==caption)node.querySelector('small').textContent=caption;if(history.children[index]!==node)history.insertBefore(node,history.children[index]??null);index++;}older.hidden=!state.older;};drawMessages();
  const attempt=store.attempts.get(id),text=el('textarea',{name:'body',maxlength:4000,required:true,'aria-label':'Zpráva',placeholder:'Napište zprávu…'},state.draft),send=el('button',{type:'submit',class:'primary'},icon('send'),'Odeslat'),form=el('form',{class:'private-chat-composer'},text,send),feedback=el('div',{'aria-live':'polite'});
  const pending=attempt&&attempt.state!=='confirmed'&&attempt.state!=='rejected';text.readOnly=send.disabled=!!pending||!conversation.participant.is_active;
  text.addEventListener('input',()=>state.draft=text.value);text.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}});
  if(pending){feedback.append(notice(attempt.state==='posting'?'Odesílám zprávu…':attempt.error??'Výsledek odeslání není ověřený.','warning'));if(attempt.state!=='posting')feedback.append(button('Načíst původní výsledek odeslání',()=>confirmAttempt(attempt)));}
  if(!conversation.participant.is_active)feedback.append(notice('Příjemce je neaktivní. Historie zůstává dostupná.','warning'));
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(text.readOnly||send.disabled)return;const body=text.value.trim();if(!body){showError(feedback,Error('Zpráva nesmí být prázdná.'));return;}
   const attempt={id:crypto.randomUUID(),conversationId:id,recipientId:conversation.participant.id,body,role,state:'posting'};store.attempts.set(id,attempt);state.draft=text.value;text.readOnly=send.disabled=true;feedback.replaceChildren(notice('Odesílám zprávu…'));
   try{const result=await api(base+'messages',{method:'POST',body:{recipient_id:attempt.recipientId,body,client_message_id:attempt.id},roleOverride:role});attempt.message=result;attempt.state='accepted';await confirmAttempt(attempt);}
   catch(error){attempt.state=error.uncertain?'unconfirmed':'rejected';attempt.error=error.message;if(current(id)){await selectConversation(id,{keepPosition:true});if(attempt.state==='rejected')showError(thread,error);}}
  });
  thread.replaceChildren(header,older,history,feedback,form,el('small',{},'Soukromá konverzace mezi vámi a vybraným kolegou.'));
  threadUI={id,history,drawMessages,conversation,text,send,title:header.querySelector('strong')};history.scrollTop=keepPosition&&previous?oldTop:history.scrollHeight;history.addEventListener('scroll',()=>scheduleRead(conversation,history),{passive:true});scheduleRead(conversation,history);
 }
 async function sync(){
  if(loading||!active()||document.hidden)return;loading=true;
  try{const revision=catalogRevision,rows=await read('conversations');if(!active()||revision!==catalogRevision)return;conversations=rows;updateDirectory();if(store.selected===null&&rows.length)store.selected=rows[0].id;
   if(threadUI?.id===store.selected){const ui=threadUI,state=local(ui.id),after=state.lastSynced??0,newest=await read('conversations/'+ui.id+'/messages?after_id='+after+'&limit=100');if(!active()||threadUI!==ui)return;const refreshed=await read('conversations/'+ui.id+'/messages?limit=50');if(!active()||threadUI!==ui)return;for(const message of refreshed)if(state.messages.has(message.id))state.messages.set(message.id,message);const atBottom=ui.history.scrollHeight-ui.history.scrollTop-ui.history.clientHeight<30;newest.forEach(message=>state.messages.set(message.id,message));if(newest.length)state.lastSynced=newest.at(-1).id;ui.drawMessages();if(atBottom)ui.history.scrollTop=ui.history.scrollHeight;const peer=rows.find(row=>row.id===ui.id);if(peer){ui.conversation=peer;ui.title.textContent=peer.participant.display_name;const attempt=store.attempts.get(ui.id),pending=attempt&&!['confirmed','rejected'].includes(attempt.state);ui.text.readOnly=ui.send.disabled=!!pending||!peer.participant.is_active;if(attempt?.state==='confirmed'&&state.draft===''&&ui.text.value.trim()===attempt.body)ui.text.value='';}scheduleRead(ui.conversation,ui.history);
   }else if(store.selected!==null)await selectConversation(store.selected,{keepPosition:true});else thread.replaceChildren(notice('Vyberte konverzaci nebo založte novou.'));}
  catch(error){if(active())showError(status,error);}finally{loading=false;}
 }
 function newConversation(){
  const box=el('div',{},notice('Načítám dostupné příjemce…'));modal('Nová soukromá konverzace',()=>box,{id:'hotel.chat.new'});
  const recover=async(person,area,close)=>{
   try{const rows=await read('conversations'),conversation=rows.find(row=>row.participant.id===person.id);if(!conversation)throw Error('Konverzace zatím nebyla potvrzena. Nový požadavek se neprovede.');catalogRevision++;conversations=rows;store.conversationAttempts.delete(person.id);if(box.isConnected&&active()){close();await selectConversation(conversation.id);}}
   catch(error){if(area.isConnected)showError(area,error);}
  };
  read('directory').then(people=>{
   if(!box.isConnected||!active())return;const search=field('Hledat příjemce','recipient-search','search',''),list=el('div',{class:'chat-recipient-list'});box.replaceChildren(search,list);
   const draw=()=>{const q=search.querySelector('input').value.toLocaleLowerCase('cs');list.replaceChildren(...people.filter(person=>(person.display_name+' '+person.email).toLocaleLowerCase('cs').includes(q)).map(person=>{
    const area=el('div'),close=()=>document.querySelector('#dialog').close(),pending=store.conversationAttempts.get(person.id),action=button(person.display_name,async()=>{
     if(store.conversationAttempts.has(person.id))return;store.conversationAttempts.set(person.id,{role});action.disabled=true;
     try{const conversation=await read('conversations',{method:'POST',body:{recipient_id:person.id}});store.conversationAttempts.delete(person.id);catalogRevision++;conversations=[conversation,...conversations.filter(row=>row.id!==conversation.id)];if(box.isConnected&&active()){close();await selectConversation(conversation.id);}}
     catch(error){if(error.uncertain){if(area.isConnected)area.append(button('Načíst původní konverzaci',()=>recover(person,area,close)));}else{store.conversationAttempts.delete(person.id);action.disabled=false;}if(area.isConnected)showError(area,error);}
    });action.disabled=!!pending;area.append(action,el('small',{},person.email));if(pending)area.append(button('Načíst původní konverzaci',()=>recover(person,area,close)));return area;
   }));if(!list.children.length)list.append(notice('Žádný dostupný příjemce.'));};search.querySelector('input').addEventListener('input',draw);draw();
  }).catch(error=>{if(box.isConnected&&active())showError(box,error);});
 }
 const viewport=event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='CML_SECTION_VIEWPORT'&&event.data.prefix===prefix){const conversation=conversations.find(row=>row.id===store.selected),messages=thread.querySelector('.messages');if(conversation&&messages)scheduleRead(conversation,messages);}};
 addEventListener('message',viewport);const tick=async()=>{if(disposed)return;await sync();if(!disposed)timer=setTimeout(tick,10000);};ctx.state.cleanup.push(()=>{disposed=true;clearTimeout(timer);clearTimeout(readTimer);removeEventListener('message',viewport);});await sync();timer=setTimeout(tick,10000);
}
async function notificationSettings(ctx){
 const generation=ctx.state.generation,content=el('div',{},notice('Načítám nastavení upozornění…'));modal('Upozornění',()=>content,{id:'hotel.chat.notifications'});
 try{const config=await api(base+'push/config');if(!content.isConnected||ctx.state.generation!==generation)return;if(!config.enabled){content.replaceChildren(notice('Upozornění na tomto serveru nejsou zapnutá.'));return;}
  const state=await notificationRequest('get');if(!content.isConnected||ctx.state.generation!==generation)return;
  if(!state.supported){content.replaceChildren(notice('Tento prohlížeč upozornění nepodporuje.'));return;}
  content.replaceChildren(notice(state.subscribed?'Upozornění jsou zapnutá pro tento účet.':'Upozornění nejsou zapnutá pro tento účet.'),button(state.subscribed?'Vypnout upozornění':'Zapnout upozornění',async event=>{const control=event.currentTarget;control.disabled=true;try{const result=await notificationRequest(state.subscribed?'disable':'enable');if(content.isConnected)content.replaceChildren(notice(result.subscribed?'Upozornění jsou zapnutá.':'Upozornění jsou vypnutá.'));}catch(error){if(content.isConnected)showError(content,error);control.disabled=false;}}));
 }catch(error){if(content.isConnected)showError(content,error);}
}
function notificationRequest(operation){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>finish(null),120000);function finish(value){clearTimeout(timer);removeEventListener('message',receive);if(value?.ok)resolve(value.state);else reject(Error(value?.error??'Upozornění nebylo možné ověřit.'));}function receive(event){if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='CML_SECTION_NOTIFICATIONS_RESULT'||event.data.prefix!==prefix||event.data.requestId!==requestId)return;finish(event.data);}addEventListener('message',receive);parent.postMessage({type:'CML_SECTION_NOTIFICATIONS_REQUEST',prefix,requestId,operation},location.origin);});}
