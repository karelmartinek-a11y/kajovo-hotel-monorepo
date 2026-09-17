import importlib.util
from pathlib import Path


def _load_pre_upload_cleanup_script():
    script_path = Path(__file__).resolve().parents[3] / "scripts/github_deploy_via_ssh.py"
    spec = importlib.util.spec_from_file_location("github_deploy_via_ssh", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.pre_upload_cleanup_script


def test_pre_upload_cleanup_preserves_runtime_data_and_running_images() -> None:
    script = _load_pre_upload_cleanup_script()()

    assert "kajovo-deploy-*.tar.gz" in script
    assert "releases[1:]" in script
    assert "docker builder prune -af" in script
    assert "docker image prune -af" in script
    assert "docker volume" not in script
    assert "docker system prune" not in script
