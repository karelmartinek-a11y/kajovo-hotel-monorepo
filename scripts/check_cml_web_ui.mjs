import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../apps/kajovo-hotel-api/app/web_ui/',import.meta.url),files=(await readdir(root)).filter(name=>name.endsWith('.js')).sort();
for(const file of files){const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:await readFile(new URL(file,root)),encoding:'utf8'});assert.equal(result.status,0,file+': '+result.stderr);}
const manifest=JSON.parse(await readFile(new URL('ui-manifest.json',root),'utf8'));assert.equal(manifest.contract,'kajovo-web-ui/1');
for(const role of ['admin','member']){
 const visible=manifest.views.filter(view=>(!view.admin||role==='admin')&&(!view.audienceRole||view.audienceRole===role));
 const ids=new Set();for(const view of visible){assert(!ids.has(view.id),'Duplicate '+role+' view: '+view.id);ids.add(view.id);assert.match(view.id,/^hotel\.[a-zA-Z0-9_.-]+$/);assert.match(view.path,/^\/sections\/hotel\/\?view=[a-z_-]+$/);assert.equal(typeof view.title,'string');if(view.navigation_title)assert(view.navigation_title.length<=120);if(view.group)assert(view.group.length<=80);}
 for(const view of visible)if(view.parent)assert(ids.has(view.parent),'Missing '+role+' parent '+view.parent);
}
console.log(JSON.stringify({syntaxFiles:files.length,manifestRoles:['admin','member'],root:fileURLToPath(root),status:'PASS'}));
