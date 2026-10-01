from pathlib import Path

import yaml


def test_country_dependency_is_present_in_production_image_and_ci_gate():
    root = Path(__file__).resolve().parents[3]
    constraints = (root / "requirements/constraints.txt").read_text()
    dockerfile = (root / "apps/kajovo-hotel-api/Dockerfile").read_text()
    assert "pycountry==24.6.1" in constraints
    assert "firebase-admin==7.7.0" in constraints
    assert "COPY requirements/constraints.txt" in dockerfile
    assert "pyproject.toml" in dockerfile and "project']['dependencies']" in dockerfile
    assert "pip install --no-cache-dir -c /opt/requirements/constraints.txt" in dockerfile
    workflow = yaml.load((root / ".github/workflows/ci-gates.yml").read_text(), Loader=yaml.BaseLoader)
    runtime = workflow['jobs']['api-runtime-image']
    assert any('build_release_images.py --existing --sha "$GITHUB_SHA"' in step.get('run', '') for step in runtime['steps'])
    helper = (root / "scripts/build_release_images.py").read_text()
    assert 'from app.main import app; import pywebpush, firebase_admin;' in helper
    assert 'COUNTRY_TRANSLATION.gettext' in helper
    assert 'images["api"]["id"]' in helper
    assert 'verify_voice_core_proxy.py' in helper
    assert 'validate_bundle(output, sha)' in helper
