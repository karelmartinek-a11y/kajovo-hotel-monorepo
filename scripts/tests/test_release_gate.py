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
        self.assertIn('voice-registry-ui', names)
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
