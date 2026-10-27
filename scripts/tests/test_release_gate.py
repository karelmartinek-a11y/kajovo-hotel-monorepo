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
    def test_better_hotel_deploy_probe_requires_authenticated_inventory(self):
        import urllib.error
        from unittest.mock import MagicMock
        spec = importlib.util.spec_from_file_location('bh_probe', Path(__file__).parents[1] / 'check_better_hotel_credentials_env.py')
        probe = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(probe)
        env = {'A_TOKEN': 'private-a-fixture', 'C_TOKEN': 'private-c-fixture'}
        probe.check(env)
        with self.assertRaises(ValueError):
            probe.check({})
        with patch.object(probe.urllib.request, 'build_opener') as factory:
            opener = factory.return_value
            response = MagicMock()
            opener.open.return_value.__enter__.return_value = response
            response.read.return_value = b'{"data":[{"id":"room-101"}],"meta":{}}'
            probe.check(env, probe=True)
            request = opener.open.call_args.args[0]
            self.assertEqual(request.get_method(), 'GET')
            self.assertEqual(request.full_url, 'https://api.better-hotel.com/api/connector/v/1/room-current-status?count=1')
            self.assertEqual(request.get_header('X-access-token'), env['A_TOKEN'])
            self.assertEqual(request.get_header('User-agent'), 'kajovo-hotel-housekeeping/1.0')
            for payload in (b'{}', b'{"data":[]}', b'{"data":[{}],"meta":[]}', b'{"data":[{}],"meta":{"problems":["private"]}}', b'not json'):
                response.read.return_value = payload
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    probe.check(env, probe=True)
            opener.open.side_effect = urllib.error.HTTPError('private-url', 401, 'private-provider-body', {}, None)
            with self.assertRaises(ValueError) as error:
                probe.check(env, probe=True)
            self.assertIn('HTTP 401', str(error.exception))
            self.assertNotIn('private', str(error.exception))
            opener.reset_mock()
            with self.assertRaises(ValueError):
                probe.check({**env, 'BETTER_HOTEL_CONNECTOR_BASE_URL': 'https://other.invalid'}, probe=True)
            opener.open.assert_not_called()
        self.assertIsNone(probe.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))
        spec = importlib.util.spec_from_file_location('github_deploy', Path(__file__).parents[1] / 'github_deploy_via_ssh.py')
        deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(deploy)
        script = deploy.remote_script_text()
        self.assertIn('if credentials_changed:', script)
        self.assertLess(script.index('"--probe"'), script.index('env_path.write_text'))
        self.assertLess(script.index('"--probe"'), script.index('"$deploy_root/infra/ops/deploy-production.sh"'))

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

    def test_nginx_hashes_private_files_and_symlink_identity(self):
        spec = importlib.util.spec_from_file_location('protected_snapshot', Path(__file__).parents[1] / 'protected_runtime_snapshot.py')
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nginx = root / 'etc/nginx'
            nginx.mkdir(parents=True)
            (nginx / 'private.conf').write_text('private-fixture-a')
            (nginx / 'other.conf').write_text('private-fixture-a')
            link = nginx / 'enabled.conf'
            link.symlink_to('private.conf')
            first = runtime.snapshot(root, lambda *a, **kw: 'Id=nginx.service\n')
            self.assertEqual(first['coverage'], 'complete')
            self.assertNotIn('private-fixture-a', json.dumps(first))
            link.unlink()
            link.symlink_to('other.conf')
            self.assertNotEqual(first, runtime.snapshot(root, lambda *a, **kw: 'Id=nginx.service\n'))
            (nginx / 'private.conf').write_text('private-fixture-b')
            self.assertNotEqual(first, runtime.snapshot(root, lambda *a, **kw: 'Id=nginx.service\n'))

    def test_snapshot_container_uses_existing_rights_with_strict_readonly_isolation(self):
        spec = importlib.util.spec_from_file_location('protected_snapshot', Path(__file__).parents[1] / 'protected_runtime_snapshot.py')
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        image = 'sha256:' + 'a' * 64
        command = runtime.filesystem_command(image, [('/etc/nginx', '/etc/nginx')])
        for option in ('--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--user=0:0', '--pull=never'):
            self.assertIn(option, command)
        self.assertNotIn('--privileged', command)
        self.assertNotIn('/var/run/docker.sock', ' '.join(command))
        self.assertIn('type=bind,src=/etc/nginx,dst=/etc/nginx,readonly,bind-recursive=disabled', command)
        for bad in ('', 'kajovo-api:latest', 'sha256:short', 'sha256:' + 'z' * 64):
            with self.assertRaises(ValueError):
                runtime.filesystem_command(bad, [])
        for value in ({'coverage': 'privileged_required'}, {'coverage': 'complete', 'privileged_snapshot_required': ['private']}):
            with self.assertRaises(RuntimeError):
                runtime.require_complete(value)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            allowed = root / 'allowed'
            allowed.mkdir()
            outside = root / 'outside'
            outside.write_text('private-outside')
            (allowed / 'escape').symlink_to(outside)
            runtime._MOUNTED_ROOTS = (allowed,)
            with self.assertRaisesRegex(RuntimeError, 'outside_readonly_mounts'):
                runtime.fingerprint(allowed / 'escape')

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
