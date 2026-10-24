"""Reject application deploys that downgrade PostgreSQL or require a major migration."""
import re
import sys


def check_version(running_version: str, target_image: str) -> None:
    running = re.fullmatch(r'postgres \(PostgreSQL\) (\d+)\.(\d+)(?:\s.*)?', running_version.strip())
    target = re.fullmatch(r'postgres:(\d+)\.(\d+)-alpine(?:\d+\.\d+)?', target_image)
    if not running or not target:
        raise ValueError('Cannot verify PostgreSQL deploy version; use an explicit supported image tag.')
    current = tuple(map(int, running.groups()))
    desired = tuple(map(int, target.groups()))
    if current[0] != desired[0]:
        raise ValueError('PostgreSQL major migration is outside an application deploy.')
    if desired < current:
        raise ValueError('PostgreSQL downgrade rejected before stopping production services.')


if __name__ == '__main__':
    try:
        check_version(*sys.argv[1:])
    except (ValueError, TypeError) as exc:
        raise SystemExit(str(exc)) from exc
    print('PostgreSQL deploy version guard: PASS')
