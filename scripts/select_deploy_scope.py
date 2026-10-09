"""Explicit commit trailer selects API/admin; invalid reduced scopes fail closed."""
import subprocess
import sys


def select_scope(message, paths):
    trailers = [line.removeprefix('Hotel-Deploy-Scope:').strip() for line in message.splitlines() if line.startswith('Hotel-Deploy-Scope:')]
    if not trailers:
        return 'full'
    if trailers != ['api-admin']:
        raise ValueError('invalid_explicit_deploy_scope')
    allowed_prefixes = ('apps/kajovo-hotel-api/', 'apps/kajovo-hotel-admin/', 'packages/dagmar-', 'packages/voice-core', 'docs/')
    allowed_files = {'AGENTS.md', 'README.md', '.github/workflows/ci-gates.yml', '.github/workflows/deploy-production.yml',
        'scripts/select_deploy_scope.py', 'scripts/verify_live_admin_users_smoke.mjs', 'scripts/mail_mcp_fixture_acceptance.py', 'scripts/github_deploy_via_ssh.py', 'scripts/verify_voice_memory_postgres.py',
        'infra/ops/deploy-production.sh', 'infra/compose.prod.yml', 'infra/.env.example', 'packages/shared/src/generated/client.ts',
        'examples/dagmar-host/native_acceptance.py', 'examples/dagmar-host/README.md'}
    if not paths or any(not (path.startswith(allowed_prefixes) or path in allowed_files) for path in paths):
        raise ValueError('api_admin_scope_contains_other_sources')
    return 'api-admin'


if __name__ == '__main__':
    sha = sys.argv[1]
    message = subprocess.check_output(['git', 'show', '-s', '--format=%B', sha], text=True)
    paths = subprocess.check_output(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', sha], text=True).splitlines()
    print(select_scope(message, paths))
