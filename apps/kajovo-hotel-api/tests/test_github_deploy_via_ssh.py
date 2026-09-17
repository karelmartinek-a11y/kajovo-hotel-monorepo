from scripts.github_deploy_via_ssh import pre_upload_cleanup_script


def test_pre_upload_cleanup_preserves_runtime_data_and_running_images() -> None:
    script = pre_upload_cleanup_script()

    assert "kajovo-deploy-*.tar.gz" in script
    assert "releases[1:]" in script
    assert "docker builder prune -af" in script
    assert "docker image prune -af" in script
    assert "docker volume" not in script
    assert "docker system prune" not in script
