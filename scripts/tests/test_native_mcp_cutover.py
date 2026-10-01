"""Historical evidence must survive while active legacy contracts fail."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('cutover_guard_under_test', ROOT / 'scripts/check_native_mcp_cutover.py')
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


def write(root, name, body):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)


def test_historical_docs_and_negative_test_fixtures_are_not_active_contracts(tmp_path):
    write(tmp_path, 'docs/forensic-report.md', 'Old connector_id:null was rejected; VoiceToolExecutor retired.')
    write(tmp_path, 'apps/api/tests/test_removed.py', 'payload = {"connector_id": "negative fixture"}')
    write(tmp_path, 'packages/core/fixtures/old.json', '{"type":"function_call_output"}')
    write(tmp_path, 'apps/api/runtime.py', '"""Removed connector_id contract."""\n# VoiceToolExecutor retired\nvalue = 1\n')
    assert guard.violations(tmp_path) == []


@pytest.mark.parametrize('name,body,token', [
    ('apps/api/runtime.py', 'payload = {"connector_id": None}', 'connector_id'),
    ('apps/api/runtime.py', 'payload = {"type": "function_call_output"}', 'function_call_output'),
    ('apps/api/runtime.py', 'payload = {"connector" + "_id": None}', 'connector_id'),
    ('apps/api/runtime.py', 'class VoiceToolExecutor: pass', 'VoiceToolExecutor'),
    ('apps/web/src/runtime.ts', 'send({type: "function_call_output"});', 'function_call_output'),
    ('infra/settings.yml', 'connector_id: old', 'connector_id'),
    ('infra/nginx.conf', 'location /voice-core/tools/execute {}', '/voice-core/tools'),
    ('.github/workflows/build.yml', 'env:\n  SMART_TECHNOLOGIES: enabled', 'SMART_TECHNOLOGIES'),
])
def test_production_contract_and_route_violations_fail(tmp_path, name, body, token):
    write(tmp_path, name, body)
    assert (name, token) in guard.violations(tmp_path)


def test_comments_and_narrative_strings_do_not_activate_javascript_contracts(tmp_path):
    write(tmp_path, 'apps/web/src/runtime.ts', '''// connector_id is retired
/* old function_call_output wire */
const description = "Old connector_id was removed.";
const endpoint = "https://example.invalid/current";
''')
    assert guard.violations(tmp_path) == []


def test_invalid_production_python_fails_closed(tmp_path):
    write(tmp_path, 'apps/api/runtime.py', 'def broken(:')
    assert guard.violations(tmp_path) == [('apps/api/runtime.py', 'invalid_python_source')]


@pytest.mark.parametrize('body', [
    'const payload = `${session.connector_id}`;',
    'const payload = `${fn({ok: 1}) + session.connector_id}`;',
    r'const data = {"connec\u0074or_id": value};',
    r"const data = {'connec\x74or_id': value};",
    "const data = {'connector' + '_id': value};",
    'const data = `unclosed ${session.value`;',
])
def test_executable_interpolations_escaped_and_split_wire_keys_fail_closed(body):
    hits = guard.text_contracts(body, '.ts')
    assert 'connector_id' in hits or 'ambiguous_template_expression' in hits


def test_retired_field_comment_with_split_example_remains_evidence():
    assert not guard.text_contracts("// Retired wire: 'connector' + '_id'\nconst current = true;", '.ts')


@pytest.mark.parametrize('body', [
    'const retired = `function_${"call"}_output`;',
    'const retired = `${"connector"}_${"id"}`;',
    'const retired = `${`connector_${"id"}`}`;',
])
def test_constant_template_wire_values_are_folded_and_rejected(body):
    assert guard.text_contracts(body, '.ts')


def test_config_hash_inside_description_cannot_hide_later_active_wire_key():
    assert 'connector_id' in guard.text_contracts('{"description":"old # marker","connector_id":null}', '.json')


def test_nested_valid_templates_and_escaped_interpolation_remain_valid():
    assert not guard.text_contracts('const label = `prefix ${enabled ? `active-${id}` : "idle"}`;', '.tsx')
    assert not guard.text_contracts(r'const narrative = `Retired \${session.connector_id} selector`;', '.ts')


@pytest.mark.parametrize('body,token', [
    ('from retired import VoiceToolExecutor as Executor', 'VoiceToolExecutor'),
    ('import retired.VoiceToolExecutor as Executor', 'VoiceToolExecutor'),
    ('send(connector_id=None)', 'connector_id'),
    ('def bind(connector_id): return None', 'connector_id'),
    ('payload = {f"connector_{\'id\'}": None}', 'connector_id'),
])
def test_python_alias_keyword_argument_and_constant_fstring_are_active_contracts(body, token):
    assert token in guard.python_contracts(body)
