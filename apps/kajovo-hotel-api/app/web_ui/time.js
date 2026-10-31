const formatters=new Map();
function wall(instant,zone){
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 const parts=Object.fromEntries(formatters.get(zone).formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return String(parts.year).padStart(4,'0')+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second;
}
export function localInstants(value,zone='Europe/Prague'){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))throw Error('Zadejte platné datum a čas.');
 const normalized=value.length===16?value+':00':value,base=Date.parse(normalized+'Z');if(!Number.isFinite(base)||wall(base,'UTC')!==normalized.slice(0,19))throw Error('Zadejte platné datum a čas.');
 const offsets=new Set();for(const hours of [-48,-24,0,24,48]){const sample=Math.floor((base+hours*3600000)/1000)*1000;offsets.add(Date.parse(wall(sample,zone)+'Z')-sample);}
 return [...offsets].map(offset=>base-offset).filter(candidate=>wall(candidate,zone)===normalized.slice(0,19)).sort((a,b)=>a-b).map(instant=>new Date(instant).toISOString());
}
const nano=instant=>instant.replace(/\.(\d{3})Z$/,'.$1000000Z');
export function dateBounds(from,until,zone='Europe/Prague'){
 const result={};if(from){const values=localInstants(from+'T00:00',zone);if(values.length!==1)throw Error('Počátek dne není jednoznačný.');result.from_time=nano(values[0]);}
 if(until){const next=new Date(until+'T00:00:00Z');if(!Number.isFinite(+next)||next.toISOString().slice(0,10)!==until)throw Error('Zadejte platný konec období.');next.setUTCDate(next.getUTCDate()+1);const values=localInstants(next.toISOString().slice(0,10)+'T00:00',zone);if(values.length!==1)throw Error('Konec dne není jednoznačný.');result.until_time=nano(values[0]);}
 return result;
}
export function pragueInput(value){
 if(!value)return '';
 const instant=/([Zz]|[+-]\d\d:\d\d)$/.test(value)?value:value+'Z';
 return wall(Date.parse(instant),'Europe/Prague');
}
export function pragueInstant(value,occurrence=''){
 const times=localInstants(value);
 if(!times.length)throw Error('Tento místní čas v Praze neexistuje.');
 if(times.length>1&&!['first','second'].includes(occurrence))throw Error('Tento čas nastává dvakrát. Vyberte první nebo druhý výskyt.');
 return times[times.length>1&&occurrence==='second'?1:0];
}
