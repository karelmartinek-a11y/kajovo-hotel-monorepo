"""Generate Dagmar-owned wire projections without a host schema or source tree."""
import argparse
import json
from pathlib import Path
from fastapi import FastAPI
from .application import DagmarApplication
from .ports import RuntimePorts
from .settings import DagmarSettings

ROOT_TYPES = {'MemoryRead','MemoryRequest','MemoryResult','NoteRecord','SettingsRead','SummaryRecord','RegistryView','VoiceSessionRead','VoiceSessionStatus'}

def schema():
    product = DagmarApplication(RuntimePorts(None,DagmarSettings(),lambda owner:None))
    app = FastAPI(title='Dagmar portable contract',version='1')
    app.include_router(product.core,prefix='/voice')
    app.include_router(product.memory,prefix='/memory')
    return app.openapi()

def typescript(value):
    if '$ref' in value:
        return value['$ref'].rsplit('/',1)[-1]
    if 'const' in value:
        return json.dumps(value['const'])
    if 'enum' in value:
        return ' | '.join(json.dumps(item) for item in value['enum'])
    for key,separator in [('anyOf',' | '),('oneOf',' | '),('allOf',' & ')]:
        if key in value:
            return separator.join(typescript(item) for item in value[key])
    kind=value.get('type')
    if kind=='array':
        return 'Array<'+typescript(value['items'])+'>'
    if kind=='object' or 'properties' in value:
        if not value.get('properties'):
            extra=value.get('additionalProperties')
            return 'Record<string, '+(typescript(extra) if isinstance(extra,dict) else 'unknown')+'>'
        required=set(value.get('required',[]))
        return '{\n'+'\n'.join('  '+json.dumps(key)+('' if key in required else '?')+': '+typescript(item)+';' for key,item in sorted(value['properties'].items()))+'\n}'
    return {'string':'string','integer':'number','number':'number','boolean':'boolean','null':'null'}.get(kind,'unknown')

def projections(document):
    schemas=document['components']['schemas']
    selected=set()
    def visit(name):
        if name in selected:
            return
        selected.add(name)
        def refs(value):
            if isinstance(value,dict):
                if '$ref' in value:
                    visit(value['$ref'].rsplit('/',1)[-1])
                for child in value.values():
                    refs(child)
            elif isinstance(value,list):
                for child in value:
                    refs(child)
        refs(schemas[name])
    for name in ROOT_TYPES:
        visit(name)
    return '// Generated from Dagmar own strict API; no host schemas.\n'+''.join('export type '+name+' = '+typescript(schemas[name])+';\n' for name in sorted(selected))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--typescript',required=True)
    parser.add_argument('--openapi',required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    document=schema()
    outputs={Path(args.typescript):projections(document),Path(args.openapi):json.dumps(document,sort_keys=True,ensure_ascii=False,indent=2)+'\n'}
    for path,content in outputs.items():
        if args.check:
            if not path.exists() or path.read_text()!=content:
                raise SystemExit('Dagmar generated contract drift: '+str(path))
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(content)

if __name__=='__main__':
    main()
