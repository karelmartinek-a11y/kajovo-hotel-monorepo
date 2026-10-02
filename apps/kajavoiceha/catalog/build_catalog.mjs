import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';

const [input, outputDirectory] = process.argv.slice(2);
if (!input || !outputDirectory) throw new Error('Usage: build_catalog.mjs public.json output-directory');
const catalog = JSON.parse(await fs.readFile(input, 'utf8'));
await fs.mkdir(outputDirectory, {recursive: true});
const wb = Workbook.create();
const sheet = wb.worksheets.add('Katalog zařízení');
sheet.showGridLines = false;
sheet.tabColor = '#254D73';

const operationGroups = controls => {
  const groups = new Map();
  for (const control of controls) {
    const split = control.label.lastIndexOf(': ');
    const target = control.label.slice(0, split);
    const operation = control.label.slice(split+2);
    const group = groups.get(target) || {operations: [], parameters: new Map()};
    group.operations.push(`${operation.toLowerCase()} (${control.function})${control.supported ? '' : ` – ${control.unavailable_reason}`}`);
    for (const [name, schema] of Object.entries(control.parameters.properties || {})) group.parameters.set(name, schema);
    groups.set(target, group);
  }
  return [...groups].map(([label, group]) => {
    const parameters = [...group.parameters].map(([name, schema]) => {
      let text = schema.description || name;
      if ('minimum' in schema || 'maximum' in schema) text += ` ${schema.minimum ?? '…'}–${schema.maximum ?? '…'}`;
      if (schema.enum) text += schema.enum.length <= 8 ? `: ${schema.enum.join(', ')}` : ` (${schema.enum.length} standardních barev; také RGB)`;
      if ('default' in schema) text += `, výchozí ${schema.default}`;
      return text;
    });
    return label + ': ' + group.operations.join(', ') + (parameters.length ? '\nParametry: ' + parameters.join('; ') : '');
  }).join('\n');
};

const readingGroups = readings => {
  const groups = new Map();
  for (const reading of readings) {
    const split = reading.label.lastIndexOf(': ');
    const target = reading.label.slice(0, split);
    const property = reading.label.slice(split+2);
    const group = groups.get(target) || [];
    group.push(`${property.toLowerCase()} (${reading.function})${reading.unit ? ` [${reading.unit}]` : ''}`);
    groups.set(target, group);
  }
  return [...groups].map(([label, group]) => label + ': ' + group.join(', ')).join('\n');
};

const display = value => value == null ? 'nezjištěno' : Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
const statesText = states => {
  const groups = new Map();
  for (const state of states) {
    const split = state.label.lastIndexOf(': ');
    const target = state.label.slice(0, split);
    const property = state.label.slice(split+2);
    const group = groups.get(target) || [];
    group.push(`${property.toLowerCase()} ${display(state.value)}${state.unit ? ` ${state.unit}` : ''}`);
    groups.set(target, group);
  }
  return [...groups].map(([label, values]) => label + ': ' + values.join('; ')).join('\n');
};
const possibleText = values => values.map(v => {
  const parts = [];
  if (v.states) parts.push(v.states.join('/'));
  if (v.options) parts.push('volby ' + v.options.join(', '));
  if (v.capabilities) parts.push(v.capabilities.join(', '));
  if (v.ranges) parts.push(...v.ranges.map(r => `${r.label} ${r.min}–${r.max} ${r.unit || ''}`.trim()));
  if (v.events) parts.push('události ' + v.events.join(', '));
  return v.label + ': ' + parts.join('; ');
}).join('\n');
const rows = catalog.devices.map(d => [d.name, d.location, d.kind, operationGroups(d.controls) || 'Bez ovládací funkce', readingGroups(d.readings) || 'Bez čitelných údajů', statesText(d.current_state) || 'Stav nelze zjistit', possibleText(d.possible_states) || 'Možné stavy nejsou deklarované', d.availability.available ? 'Dostupné' : 'Momentálně nedostupné']);
const safe = value => typeof value === 'string' && /^=/.test(value) ? `'${value}` : value;
for (const row of rows) for (const value of row) {
  if (typeof value === 'string' && value.length > 32760) throw new Error('Excel text cell would exceed its maximum size');
  if (typeof value === 'string' && /home[ _-]*assistant|\bha\b|access_token|(?:light|switch|sensor|camera|select)\.[\w-]+/i.test(value)) throw new Error('Private implementation detail in clean workbook');
}
const last = rows.length + 6;
const widths = [32, 24, 29, 120, 86, 86, 95, 27];
sheet.getRange(`A1:H${last}`).format.font = {name:'Arial',size:10,color:'#183247'};
sheet.getRange(`A1:H${last}`).format.verticalAlignment = 'top';
sheet.getRange('A2').values = [['KajaVoiceHA – katalog zařízení']];
sheet.getRange('A2').format.font = {name:'Arial',size:14,bold:true,color:'#183247'};
sheet.getRange('A2:H2').format.rowHeight = 26;
const fetched = new Date(catalog.fetched_at).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});
sheet.getRange('A3').values = [[`${rows.length} schválených zařízení. Aktuální údaje načtené ${fetched} (Europe/Prague).`]];
sheet.getRange('A4').values = [[`Revize ${catalog.revision}. Ve voláních se zařízení označuje pořadím 1–${rows.length} v katalogu.`]];
sheet.getRange('A3:H4').format.rowHeight = 22;
sheet.getRange('A6:H6').values = [catalog.fields.map(f => f.label)];
sheet.getRange('A6:H6').format = {fill:'#254D73',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:36};
sheet.getRange(`A7:H${last}`).values = rows.map(row => row.map(safe));
sheet.getRange(`A7:H${last}`).format.wrapText = true;
widths.forEach((width, index) => sheet.getRange(`${String.fromCharCode(65+index)}6:${String.fromCharCode(65+index)}${last}`).format.columnWidth = width);
sheet.freezePanes.freezeRows(6);
sheet.freezePanes.freezeColumns(2);
sheet.tables.add(`A6:H${last}`,true,'VoiceDeviceCatalog').showFilterButton = true;
for (let index=0;index<rows.length;index++) {
  const lines = Math.max(...rows[index].map((v,c) => String(v).split('\n').reduce((sum,line) => sum+Math.max(1,Math.ceil(line.length/(widths[c]-4))),0)));
  sheet.getRange(`A${index+7}:H${index+7}`).format.rowHeight = Math.max(42,Math.min(405,lines*13.25+10));
}
sheet.getRange(`H7:H${last}`).conditionalFormats.add('containsText',{text:'nedostupné',format:{fill:'#FCE4D6',font:{color:'#9C2B16'}}});
wb.recalculate();
const checks = await wb.inspect({kind:'table',range:'Katalog zařízení!A6:H9',include:'values,formulas',tableMaxRows:4,tableMaxCols:8,tableMaxCellChars:130,maxChars:2200});
console.log(checks.ndjson);
const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:1000});
console.log(errors.ndjson);
for (const [name,range] of [['overview','A1:C14'],['capabilities','D6:H9'],['camera','D56:H56']]) {
  const preview = await wb.render({sheetName:'Katalog zařízení',range,scale:1,format:'png'});
  await fs.writeFile(path.join(outputDirectory,`${name}-preview.png`),new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(wb);
const filename = path.join(outputDirectory,'KajaVoiceHA-katalog-zarizeni.xlsx');
await output.save(filename);
console.log(JSON.stringify({output:filename,devices:rows.length,columns:catalog.fields.length,revision:catalog.revision}));
