"""Reject removed contracts in active source/config/docs, without banning MCP."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
removed=['smart'+'_technologies', 'SMART'+'_TECHNOLOGIES', 'VoiceTool'+'Executor',
         'function_call'+'_output', '/voice-core/'+'tools', 'connector'+'_id', 'ha_device_catalog'+'.v3']
for area in ['apps','packages','infra','docs','.github']:
    for path in (ROOT/area).rglob('*'):
        if not path.is_file() or any(p in {'node_modules','dist','.venv','__pycache__','test-results','playwright-report'} for p in path.parts):
            continue
        if path.suffix not in {'.py','.ts','.tsx','.md','.yml','.yaml','.json','.toml','.conf','.mjs'}:
            continue
        text=path.read_text()
        if any(token in text for token in removed):
            raise SystemExit(f'Removed integration contract in {path.relative_to(ROOT)}')
print('Native MCP cutover source PASS')
