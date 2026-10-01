"""Root coordinator-owned post-PASS storage cleanup; never a deploy preparation step."""
import json
import os
import shutil
import subprocess
from pathlib import Path

RELEASE_ROOT = Path('/home/deploy-hotel/kajovo-deploy-releases')


def cleanup(state_path=Path('/var/lib/home-assistant-mcp-control/cutover.json')):
    state = json.loads(state_path.read_text())
    if state.get('phase') not in {'accepted_cleanup_pending', 'accepted'}:
        raise RuntimeError('final_acceptance_required_before_prune')
    rows = json.loads(subprocess.check_output(['docker', 'inspect',
                      'kajovo-prod-api-1', 'kajovo-prod-web-1', 'kajovo-prod-admin-1']))
    roots = {Path(row['Config']['Labels']['com.docker.compose.project.working_dir']).parent.resolve() for row in rows}
    if len(roots) != 1:
        raise RuntimeError('runtime_releases_incoherent')
    current = roots.pop()
    root = RELEASE_ROOT.resolve()
    if current.parent != root or current.name != state['hotel_sha']:
        raise RuntimeError('accepted_release_mismatch')
    backup = Path(state['backup'])
    previous = json.loads((backup / 'containers.json').read_text()) if (backup / 'containers.json').exists() else []
    # Only hotel source trees and the captured obsolete hotel images are affected.
    for release in root.iterdir():
        if release.is_dir() and release.resolve() != current:
            shutil.rmtree(release)
    present = set(subprocess.check_output(['docker', 'image', 'ls', '--quiet', '--no-trunc']).decode().splitlines())
    for image in {row['Image'] for row in previous} & present:
        used = subprocess.check_output(['docker', 'ps', '-aq', '--filter', 'ancestor=' + image]).strip()
        if not used:
            subprocess.run(['docker', 'image', 'rm', image], check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL)
    # Cache maintenance happens only after acceptance, is age bounded, and
    # keeps a useful cache budget. Runtime images/volumes are not prune inputs.
    subprocess.run(['docker', 'builder', 'prune', '--force', '--filter', 'until=168h',
                    '--keep-storage', '2GB'], check=True, stdout=subprocess.DEVNULL)
    print('Accepted hotel release/image cleanup PASS')


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise SystemExit('root_coordinator_required')
    cleanup()
