from pathlib import Path


def test_country_dependency_is_present_in_production_image_and_ci_gate():
    root = Path(__file__).resolve().parents[3]
    assert "pycountry==24.6.1" in (root / "apps/kajovo-hotel-api/Dockerfile").read_text()
    workflow = (root / ".github/workflows/ci-gates.yml").read_text()
    assert "api-runtime-image:" in workflow
    assert "docker run --rm --entrypoint python kajovo-api-ci" in workflow
    assert "from app.main import app" in workflow
