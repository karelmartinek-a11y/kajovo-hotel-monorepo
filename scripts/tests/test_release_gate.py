import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('release_gate', Path(__file__).parents[1] / 'release_gate.py')
gate = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = gate
SPEC.loader.exec_module(gate)


class ReleaseGateTests(unittest.TestCase):
    def test_postgres_guard_rejects_production_downgrade_and_major_migration(self):
        spec = importlib.util.spec_from_file_location('postgres_guard', Path(__file__).parents[1] / 'check_postgres_deploy_version.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.check_version('postgres (PostgreSQL) 16.15', 'postgres:16.15-alpine3.23')
        module.check_version('postgres (PostgreSQL) 16.4', 'postgres:16.15-alpine3.23')
        for image in ('postgres:16.4-alpine', 'postgres:17.6-alpine', 'postgres:latest', 'postgres:16-alpine'):
            with self.subTest(image=image), self.assertRaises(ValueError):
                module.check_version('postgres (PostgreSQL) 16.15', image)
        with self.assertRaises(ValueError):
            module.check_version('unknown', 'postgres:16.15-alpine3.23')

    def test_protected_snapshot_detects_smartplan_release_and_config_changes(self):
        spec = importlib.util.spec_from_file_location('protected_snapshot', Path(__file__).parents[1] / 'protected_runtime_snapshot.py')
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'etc/smartplan/config.json'
            config.parent.mkdir(parents=True)
            config.write_text('private-fixture-a')
            current = root / 'opt/smartplan/current'
            current.parent.mkdir(parents=True)
            current.symlink_to('releases/a')
            commands = []
            def unit_state(args, **kwargs):
                commands.append(args)
                return 'Id=smartplan.service\nMainPID=42\n'
            first = runtime.snapshot(root, unit_state)
            self.assertIn('smartplan.service', commands[0])
            self.assertIn('kajovosmart-mcp.service', commands[0])
            self.assertIn('kajovosmart-mcp-chatgpt-oauth.service', commands[0])
            self.assertNotIn('private-fixture-a', json.dumps(first))
            config.write_text('private-fixture-b')
            self.assertNotEqual(first, runtime.snapshot(root, unit_state))
            config.write_text('private-fixture-a')
            current.unlink()
            current.symlink_to('releases/b')
            self.assertNotEqual(first, runtime.snapshot(root, unit_state))
            self.assertFalse(any('/var/lib/' in path or path.endswith(('.db', '.sqlite', '-wal')) for path in runtime.FILES))

    def test_protected_snapshot_hashes_dropins_and_marks_denied_traversal(self):
        spec = importlib.util.spec_from_file_location('protected_snapshot', Path(__file__).parents[1] / 'protected_runtime_snapshot.py')
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dropin = root / 'etc/systemd/system/kajavoiceha.service.d/smartplan.conf'
            dropin.parent.mkdir(parents=True)
            dropin.write_text('private-fixture-a')
            def unit_state(*args, **kwargs):
                return 'Id=kajavoiceha.service\nDropInPaths=/etc/systemd/system/kajavoiceha.service.d/smartplan.conf\n'
            first = runtime.snapshot(root, unit_state)
            dropin.write_text('private-fixture-b')
            self.assertNotEqual(first, runtime.snapshot(root, unit_state))
            self.assertNotIn('private-fixture-a', json.dumps(first))
            def denied(*args, **kwargs):
                raise PermissionError('fixture')
            (root / 'etc/smartplan').mkdir(parents=True)
            with patch.object(runtime.os, 'walk', denied):
                report = runtime.snapshot(root, unit_state)
            # stat succeeds; traversal denial must still be explicit.
            self.assertEqual(report['coverage'], 'privileged_required')
            self.assertTrue(report['privileged_snapshot_required'])

    def test_targeted_deploy_accepts_updated_validation_but_rejects_web(self):
        spec = importlib.util.spec_from_file_location('select_deploy_scope', Path(__file__).parents[1] / 'select_deploy_scope.py')
        scope = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(scope)
        message = 'Connect SmartPlan\n\nHotel-Deploy-Scope: api-admin\n'
        paths = ['packages/dagmar-server/src/dagmar_server/smartplan.py', 'scripts/release_gate.py', 'scripts/tests/test_release_gate.py']
        self.assertEqual(scope.select_scope(message, paths), 'api-admin')
        with self.assertRaises(ValueError):
            scope.select_scope(message, paths + ['apps/kajovo-hotel-web/src/App.tsx'])

    def test_failed_process_is_failure(self):
        result = gate._run_check('failure', [sys.executable, '-c', 'raise SystemExit(3)'])
        self.assertEqual((result.status, result.return_code), ('FAIL', 3))

    def test_missing_executable_is_failure(self):
        with patch.object(gate.subprocess, 'run', side_effect=FileNotFoundError):
            result = gate._run_check('missing', ['missing-command'])
        self.assertEqual((result.status, result.return_code), ('FAIL', 127))

    def test_plan_has_no_opt_out_or_recursive_runner(self):
        with patch.dict(gate.os.environ, {'RUN_FRONTEND_GATES': '0', 'RUN_E2E_SMOKE': '0'}):
            plan = gate.check_plan()
        names = [name for name, _ in plan]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn('api-contract', names)
        self.assertIn('dagmar-contract', names)
        self.assertIn('dagmar-copy-out', names)
        self.assertIn('browser-baseline', names)
        self.assertIn('api-and-voice-tests', names)
        self.assertNotIn('voice-registry-ui', names)
        self.assertNotIn('smartplan-owner-ui', names)
        for _, command in plan:
            self.assertNotIn('ci:gates', command)
            self.assertFalse(len(command) > 1 and command[1].endswith('live_smoke.py'))

    def test_failure_artifact_keeps_sha_and_prevents_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            failed = gate.CheckResult('failure', ['missing'], 'FAIL', 127, 'start', 'end')
            previous_cwd = Path.cwd()
            try:
                with patch.object(gate, '__file__', str(root / 'scripts/release_gate.py')), patch.object(gate, 'check_plan', return_value=[('failure', ['missing'])]), patch.object(gate, '_run_check', return_value=failed), patch.object(gate, '_git_sha', return_value='tested-sha'):
                    self.assertEqual(gate.main(), 1)
                artifact = json.loads(next((root / 'artifacts/release-gate').glob('*.json')).read_text())
                self.assertEqual(artifact['sha'], 'tested-sha')
                self.assertEqual(artifact['overall_status'], 'FAIL')
                self.assertEqual(artifact['checks'][0]['return_code'], 127)
            finally:
                gate.os.chdir(previous_cwd)
