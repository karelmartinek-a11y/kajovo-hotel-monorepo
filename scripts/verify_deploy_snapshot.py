"""Real Docker acceptance: unreadable host config, symlinks, strict hashes and read-only mounts."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

from protected_runtime_snapshot import filesystem_command, filesystem_snapshot


def run(image):
    image_id = subprocess.check_output(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], text=True).strip()
    with tempfile.TemporaryDirectory(prefix='protected-deploy-') as directory:
        root = Path(directory)
        root.chmod(0o777)
        def write_fixture(mode='0o600', value='fixture-private-a', target='private.conf'):
            code = ("from pathlib import Path; p=Path('/fixture'); "
                f"(p/'{target}').write_text('{value}'); (p/'{target}').chmod({mode}); "
                "(p/'enabled.conf').unlink(missing_ok=True); "
                f"(p/'enabled.conf').symlink_to('/etc/nginx/{target}')")
            subprocess.run(['docker','run','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges:true',
                '--user=0:0','--mount',f'type=bind,src={root},dst=/fixture',
                '--entrypoint=python',image_id,'-c',code],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            write_fixture()
            if os.geteuid() != 0:
                try:
                    (root/'private.conf').read_text()
                    raise AssertionError('caller unexpectedly read root-only fixture')
                except PermissionError:
                    pass
            units = 'Id=nginx.service\nFragmentPath=/etc/nginx/private.conf\n'
            mounts = [(str(root), '/etc/nginx')]
            before = filesystem_snapshot(image_id, units, mounts)
            assert before['coverage'] == 'complete' and not before['privileged_snapshot_required']
            assert 'fixture-private-a' not in json.dumps(before)
            assert filesystem_snapshot(image_id, units, mounts) == before
            # A real write attempt through the exact same restricted mount must fail.
            command = filesystem_command(image_id, mounts) + ['--entrypoint=python', image_id, '-c',
                "from pathlib import Path; Path('/etc/nginx/private.conf').write_text('forbidden')"]
            rejected = subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            assert rejected.returncode != 0
            assert filesystem_snapshot(image_id, units, mounts) == before
            write_fixture(value='fixture-private-b')
            assert filesystem_snapshot(image_id, units, mounts) != before
            write_fixture(value='fixture-private-b', target='other.conf')
            linked = filesystem_snapshot(image_id, units, mounts)
            assert linked['config_trees']['/etc/nginx']['enabled.conf']['symlink'] == '/etc/nginx/other.conf'
            write_fixture(mode='0o000')
            try:
                filesystem_snapshot(image_id, units, mounts)
                raise AssertionError('unreadable evidence was accepted')
            except subprocess.CalledProcessError:
                pass
        finally:
            root.chmod(0o755)
    print('Docker protected snapshot: private config, stable hashes, changes, symlinks, read-only mounts and fail-closed evidence PASS')




def verify_stale_root_artifact_cleanup(image):
    from github_deploy_via_ssh import pre_upload_cleanup_script
    import uuid
    image_id = subprocess.check_output(['docker','image','inspect',image,'--format','{{.Id}}'],text=True).strip()
    project = 'deploy-cleanup-test-' + uuid.uuid4().hex[:10]
    guard = project + '-api-1'
    subprocess.run(['docker','create','--name',guard,'--network=none','--entrypoint=python',image_id,'-c','pass'],
                   check=True,stdout=subprocess.PIPE)
    try:
        with tempfile.TemporaryDirectory(prefix='deploy-cleanup-') as directory:
            root = Path(directory)
            old, latest = root/('1'*40), root/('2'*40)
            old.mkdir(mode=0o777)
            old.chmod(0o777)
            (old/'source.py').write_text('stale fixture')
            latest.mkdir()
            (latest/'source.py').write_text('preserved fixture')
            unrecognized = root/'unrecognized'
            unrecognized.mkdir()
            (unrecognized/'keep').write_text('preserved fixture')
            outside = root/'outside'
            outside.mkdir()
            (outside/'keep').write_text('never follow source links')
            (root/('3'*40)).symlink_to(outside,target_is_directory=True)
            code = "from pathlib import Path; p=Path('/fixture/artifacts'); p.mkdir(mode=0o700); (p/'metadata.json').write_text('root-only fixture')"
            subprocess.run(['docker','run','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges:true',
                '--user=0:0','--mount',f'type=bind,src={old},dst=/fixture',
                '--entrypoint=python',image_id,'-c',code],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            os.utime(old,(1,1))
            os.utime(latest,(2,2))
            script = pre_upload_cleanup_script().split("python3 - <<'PY'\n",1)[1].split('\nPY\n',1)[0]
            environment = {**os.environ,'RELEASE_DIR':str(root),'COMPOSE_PROJECT_NAME':project}
            subprocess.run([__import__('sys').executable,'-c',script],env=environment,check=True)
            assert not old.exists()
            assert (latest/'source.py').read_text() == 'preserved fixture'
            assert (unrecognized/'keep').exists() and (outside/'keep').exists()
    finally:
        subprocess.run(['docker','rm',guard],check=True,stdout=subprocess.PIPE)
    print('Docker stale-release cleanup: root-owned artifacts removed without permission changes; latest/unrecognized/symlink targets preserved PASS')


def verify_snapshot_image_survives_gc(image):
    import uuid
    token = uuid.uuid4().hex[:10]
    base_tag, child_tag = 'deploy-snapshot-base:' + token, 'deploy-snapshot-gc:' + token
    label = 'io.kajovo.snapshot-gc-test=' + token
    subprocess.run(['docker','image','tag',image,base_tag],check=True)
    guard = None
    try:
        with tempfile.TemporaryDirectory(prefix='snapshot-gc-') as directory:
            root = Path(directory)
            (root/'Dockerfile').write_text('FROM ' + base_tag + '\nLABEL ' + label + '\n')
            subprocess.run(['docker','build','--pull=false','--network=none','-q','-t',child_tag,str(root)],check=True,
                           stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            image_id = subprocess.check_output(['docker','image','inspect',child_tag,'--format','{{.Id}}'],text=True).strip()
            guard = subprocess.check_output(['docker','create','--pull=never','--network=none','--read-only',
                '--cap-drop=ALL','--security-opt=no-new-privileges:true','--entrypoint=python',image_id,'-c','pass'],text=True).strip()
            subprocess.run(['docker','image','prune','-af','--filter','label='+label],check=True,stdout=subprocess.PIPE)
            subprocess.run(['docker','image','inspect',image_id],check=True,stdout=subprocess.PIPE)
            state = subprocess.check_output(['docker','inspect',guard,'--format','{{.State.Status}}'],text=True).strip()
            assert state == 'created'
            # The same original runtime remains executable after real filtered GC.
            subprocess.run(['docker','run','--rm','--network=none','--read-only','--cap-drop=ALL',
                '--entrypoint=python',image_id,'-c','pass'],check=True)
            subprocess.run(['docker','rm',guard],check=True,stdout=subprocess.PIPE)
            guard = None
            subprocess.run(['docker','image','prune','-af','--filter','label='+label],check=True,stdout=subprocess.PIPE)
            gone = subprocess.run(['docker','image','inspect',image_id],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            assert gone.returncode != 0
    finally:
        if guard:
            subprocess.run(['docker','rm',guard],check=True,stdout=subprocess.PIPE)
        subprocess.run(['docker','image','prune','-af','--filter','label='+label],check=True,stdout=subprocess.PIPE)
        subprocess.run(['docker','image','rm',base_tag],check=True,stdout=subprocess.PIPE)
    print('Docker immutable snapshot runtime survives filtered image GC until the unstarted guard is removed PASS')


if __name__ == '__main__':
    image = os.environ.get('DEPLOY_SNAPSHOT_TEST_IMAGE', 'kajovo-api-ci')
    run(image)
    verify_stale_root_artifact_cleanup(image)
    verify_snapshot_image_survives_gc(image)
