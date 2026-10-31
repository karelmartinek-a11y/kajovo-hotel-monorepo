import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../app/web_ui/time.js',import.meta.url),'utf8');
const {pragueInstant,pragueInput}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('Prague form dates reject the spring gap and require an explicit autumn instance',()=>{
 assert.throws(()=>pragueInstant('2026-03-29T02:30'),/neexistuje/);
 assert.throws(()=>pragueInstant('2026-10-25T02:30'),/dvakrát/);
 assert.equal(pragueInstant('2026-10-25T02:30','first'),'2026-10-25T00:30:00.000Z');
 assert.equal(pragueInstant('2026-10-25T02:30','second'),'2026-10-25T01:30:00.000Z');
 assert.throws(()=>pragueInstant('2026-02-31T12:00'),/platné/);
});
test('A retained fold choice cannot erase an ordinary summer timestamp',()=>{
 assert.equal(pragueInstant('2026-07-01T12:30','second'),'2026-07-01T10:30:00.000Z');
 assert.equal(pragueInput('2026-07-01T10:30:00Z'),'2026-07-01T12:30:00');
 assert.equal(pragueInput('2026-10-25T01:30:00Z'),'2026-10-25T02:30:00');
});
