from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def _value(env: dict[str, str], *keys: str) -> str:
    return next((env[key].strip() for key in keys if env.get(key, '').strip()), '')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Nikdy nepředávat tokeny jinému endpointu přes přesměrování.
        return None


def check(env: dict[str, str], *, probe: bool = False) -> None:
    base_url = _value(env, 'BETTER_HOTEL_CONNECTOR_BASE_URL', 'KAJOVO_API_BETTER_HOTEL_CONNECTOR_BASE_URL') or 'https://api.better-hotel.com/api/connector/v/1'
    access_token = _value(env, 'BETTER_HOTEL_ACCESS_TOKEN', 'KAJOVO_API_BETTER_HOTEL_ACCESS_TOKEN', 'A_TOKEN', 'A_token')
    client_token = _value(env, 'BETTER_HOTEL_CLIENT_TOKEN', 'KAJOVO_API_BETTER_HOTEL_CLIENT_TOKEN', 'C_TOKEN', 'C_token')
    if not access_token or not client_token:
        raise ValueError('Missing Better Hotel access/client token environment.')
    if not probe:
        return
    target = urllib.parse.urlsplit(base_url)
    if (target.scheme, target.netloc, target.path.rstrip('/')) != ('https', 'api.better-hotel.com', '/api/connector/v/1') or target.query or target.fragment:
        raise ValueError('Better Hotel connection probe requires the production HTTPS connector endpoint.')
    request = urllib.request.Request(base_url.rstrip('/') + '/room-current-status?count=1', headers={
        'Accept': 'application/json',
        'X-Access-Token': access_token,
        'X-Client-Token': client_token,
        'User-Agent': 'kajovo-hotel-housekeeping/1.0',
    })
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            payload = json.loads(response.read(1024 * 1024).decode('utf-8'))
    except urllib.error.HTTPError as exc:
        # Bez těla odpovědi, URL a tokenů i v chybovém výstupu.
        raise ValueError(f'Better Hotel connection probe failed: HTTP {exc.code}. Renew credentials for HTTP 401.') from None
    except (OSError, ValueError) as exc:
        raise ValueError(f'Better Hotel connection probe failed ({type(exc).__name__}).') from None
    if not isinstance(payload, dict) or not isinstance(payload.get('data'), list) or not payload['data'] or not all(isinstance(room, dict) for room in payload['data']) or not isinstance(payload.get('meta', {}), dict) or payload.get('meta', {}).get('problems'):
        raise ValueError('Better Hotel connection probe returned an invalid or empty room inventory.')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true', help='Read one room from Better Hotel before deployment.')
    parser.add_argument('--env-file', type=Path, help='Private deployment environment; never evaluated as shell code.')
    args = parser.parse_args()
    env = dict(os.environ)
    if args.env_file:
        for line in args.env_file.read_text(encoding='utf-8').splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key] = value
    try:
        check(env, probe=args.probe)
    except ValueError as exc:
        print(f'Better Hotel credential check: FAIL: {exc}', file=sys.stderr)
        return 1
    print('Better Hotel credential check: PASS' + (' (authenticated room read)' if args.probe else ' (environment mapping)'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
