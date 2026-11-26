import {action,card,dateBar,element,facts,inputField,options,sheet,today} from './controls.js';
import {commit} from './transport.js';

const states = new Map([
  ['clean','Uklizeno pro nájezd'],['dirty','Neuklizeno'],
  ['stay_no_linen','Pobyt bez ložního prádla'],['stay_with_linen','Uklizeno s ložním prádlem'],
  ['do_not_disturb','Nerušit'],['technical_issue','Technický problém'],
  ['windows_cleaned','Umytá okna'],['painted','Vymalováno'],
]);
const filters = {floor:'',room:''};
const root = 'api/v1/housekeeping/';
const roomList = root+'rooms';
const blocks = {full:'Celý den',left:'Odjezd',right:'Příjezd'};
const text = value=>value===null || value===undefined?'—':String(value);
const queryFor = day=>'?'+new URLSearchParams({date:day,include_options:'true',include_blocks:'true'});
const sorter = new Intl.Collator('cs',{numeric:true,sensitivity:'base'});
const staysFor = room=>[['Odjezdy',room.departures],['Příjezdy',room.arrivals],['Pokračující pobyty',room.stays]];
const allStays = room=>staysFor(room).flatMap(([,entries])=>entries??[]);

function night(stay,day) {
  const days = value=>Math.round(Date.parse(value+'T12:00:00Z')/86_400_000);
  const total=days(stay.departure)-days(stay.arrival);
  const elapsed=days(day)-days(stay.arrival);
  return Number.isFinite(total)&&total>0&&elapsed>=0 ? Math.min(total,elapsed+1)+' / '+total : '—';
}

export async function rooms(context) {
  const day=context.days.rooms;
  const query=queryFor(day);
  const write = context.has('housekeeping:write');
  let overview=await context.read(roomList+query);
  const list=element('div');
  const notice=element('p',{role:'status'});
  const search=element('input',{type:'search',placeholder:'Číslo pokoje'});
  search.value=filters.room;
  const floors=options([['','Všechna patra'],...[...new Set(overview.rooms.map(room=>room.floor))]
    .sort(sorter.compare).map(floor=>[floor, floor])],filters.floor);
  const updateDay=context.guard(async value=>{
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'0001-01-01') throw Error('Vyber platný den.');
    context.days.rooms=value;
    await context.reload();
  });

  function populate() {
    const filtered=overview.rooms.filter(room=>(!filters.floor||String(room.floor)===filters.floor) &&
      String(room.room_number).includes(filters.room.trim()));
    filtered.sort((left,right)=>sorter.compare(left.room_number,right.room_number));
    const tiles=filtered.map(room=>{
      const counts=staysFor(room).map(([title,stays])=>[title,stays?.length??0]).filter(([,count])=>count);
      return card('Pokoj '+room.room_number,
        facts([
          ['Úklid',states.get(room.housekeeping_status_key)??'Neurčený stav'],
          ['Přítomnost',room.occupied?'Osob uvnitř · '+text(room.current_persons??room.persons):'Prázdný'],
          ...counts,
          ['Blokace prodeje',room.blocks?.length?room.blocks.length:'—'],
        ]),
        action('Detail pokoje '+room.room_number,()=>showRoom(context,room,day,write)));
    });
    list.replaceChildren(...tiles);
    if (!tiles.length) list.append(element('p',{},'Pro zadaný výběr nevidím žádné pokoje.'));
  }
  search.addEventListener('input',()=>{filters.room=search.value;populate();});
  floors.addEventListener('change',()=>{filters.floor=floors.value;populate();});
  populate();

  let loading = false;
  const refresh = async()=>{
    if (loading || document.hidden || document.querySelector('dialog[open]') || context.signal.aborted) return;
    loading = true;
    try {
      const snapshot=await context.read(roomList+query);
      if (context.signal.aborted) return;
      overview=snapshot;
      notice.textContent='';
      populate();
    } catch(error) {
      if (!context.signal.aborted) notice.textContent='Přehled se nepodařilo obnovit. Zatím jsou zobrazené poslední načtené údaje.';
    } finally {loading=false;}
  };
  window.addEventListener('focus',refresh,{signal:context.signal});
  document.addEventListener('visibilitychange',refresh,{signal:context.signal});
  window.addEventListener('pageshow',refresh,{signal:context.signal});
  const timer=setInterval(refresh,60000);
  context.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});

  const cross=element('div',{class:'actions'});
  if (context.has('issues:write')) cross.append(action('Nová závada',()=>context.go('issues-new')));
  if (context.has('lost_found:write')) cross.append(action('Nový nález nebo ztráta',()=>context.go('lostfound-new')));
  return [card(null,dateBar(day,updateDay),element('div',{class:'actions'},
    action('Dnes',()=>updateDay(today())),action('Obnovit',refresh)),
    inputField('Patro',floors),inputField('Hledat pokoj',search),cross,notice),list];
}

function showRoom(context,room,day,write) {
  const query=queryFor(day);
  const view=element('div',{},facts([['Stav úklidu',states.get(room.housekeeping_status_key)],
    ['Obsazenost právě teď',room.occupied?text(room.current_persons??room.persons)+' osob':'Prázdný']]));
  const commands=element('div',{class:'actions'});
  for (const [state,title] of states) {
    const button=action(title,()=>commit(view,{
      path:roomList+'/'+encodeURIComponent(room.room_id)+query,
      method:'PATCH',body:{status:state,expected_status:room.housekeeping_status_key,note:null},read:context.read,
      verify:async accepted=>{
        if (accepted?.room_id!==room.room_id||accepted.housekeeping_status_key!==state) throw Error('Služba nepotvrdila požadovaný stav pokoje.');
        const current=(await context.read(roomList+query)).rooms.find(item=>item.room_id===room.room_id);
        if (current?.housekeeping_status_key!==state) throw Error('Znovu načtený pokoj má jiný stav úklidu.');
      },
      done:async()=>{dialog.close();await context.reload();},
    }));
    button.disabled=!write || !room.housekeeping_status_key;
    commands.append(button);
  }
  view.append(commands);
  for (const block of room.blocks??[]) view.append(card('Blokace pokoje',facts([
    ['Od',block.arrival],['Do',block.departure],['Rozsah',blocks[block.coverage]??block.coverage],
  ])));
  view.append(element('h3',{},'Pobyty vybraného dne'));
  if (!allStays(room).length) view.append(element('p',{},'Bez pobytu ve vybraný den.'));
  for (const [caption,stays] of staysFor(room)) {
    if (!stays?.length) continue;
    const group=element('section',{},element('h3',{},caption));
    for (const stay of stays) {
      const fields=[
        ['Rezervace',stay.reservation_code??stay.reservation_id],
        ['Termín',stay.arrival+' → '+stay.departure],
        ['Stav',stay.reservation_status_name??stay.reservation_state],
        ['Hosté',(stay.guests??[]).map(guest=>guest.name).filter(Boolean).join(', ')],
        ['Firma',stay.company_name],['Osob',stay.persons],['Dospělí',stay.adults],['Děti',stay.children],['Mimina',stay.infants],
        ['Plánovaný příjezd',stay.arrival_time],['Plánovaný odjezd',stay.departure_time],
        ['Noc pobytu',night(stay,day)],['Země',stay.country_name??stay.country_code],['Poznámka pro úklid',stay.housekeeping_note],
        ['Skutečný check-in',stay.checked_in],['Skutečný check-out',stay.checked_out],
        ...(stay.charges??[]).map(charge=>[charge.label,[charge.quantity,charge.date].filter(Boolean).join(' · ')]),
      ];
      const entry=card(null,facts(fields));
      for (const kind of ['dog','cot']) {
        const quantity=kind==='dog'?stay.dog_count:Number(stay.cot_required===true);
        if (!quantity) continue;
        const item=(stay.amenities??[]).find(value=>value.kind===kind);
        const complete=item?.active===true&&item.state==='green';
        const version=item?.version??0;
        const name=kind==='dog'?'Pes ('+quantity+')':'Dětská postýlka';
        const setup=action(name+(complete?' · připraveno':' · potvrdit připravení'),()=>commit(view,{
          read:context.read,path:root+'reservations/'+encodeURIComponent(stay.reservation_id)+'/requirements/'+kind+'/confirm?'+
            new URLSearchParams({room_id:room.room_id,date:day}),body:{quantity,version},
          verify:async result=>{
            if (result?.kind!==kind || result.active!==true || result.state!=='green' || result.version!==version+1) {
              throw Error('Původní odpověď nepotvrdila požadované vybavení.');
            }
            const data=await context.read(roomList+query);
            const selected=data.rooms.find(entry=>entry.room_id===room.room_id);
            const booking=selected&&allStays(selected).find(entry=>entry.reservation_id===stay.reservation_id);
            const saved=booking?.amenities?.find(entry=>entry.kind===kind);
            const expected=kind==='dog'?booking?.dog_count:Number(booking?.cot_required===true);
            if (expected!==quantity || !saved?.active || saved.state!=='green' || saved.version<result.version) {
              throw Error('Připravení pro tento pokoj, den a pobyt se nepodařilo zpětně ověřit.');
            }
          },
          done:async()=>{dialog.close();await context.reload();},
        }));
        setup.disabled=complete||!write;
        entry.append(setup);
      }
      group.append(entry);
    }
    view.append(group);
  }
  const dialog=sheet('Pokoj '+room.room_number,view);
}
