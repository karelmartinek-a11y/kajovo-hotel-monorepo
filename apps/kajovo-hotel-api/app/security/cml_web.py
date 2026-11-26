"""ASGI entrypoint for independently deployed CML web sections."""
from __future__ import annotations

import asyncio
import re
import hmac
import json
import mimetypes
import os
import time
from pathlib import Path
from urllib.parse import parse_qs

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from starlette.responses import FileResponse, JSONResponse

from app.security.cml_assertion import AssertionDenied, central_settings, WebVerifier, central_administrator
from app.security.cml_requests import WebRequests, ReceiptFault, owner_key, request_id
from app.security.hotel_mcp_consent import consent as hotel_consent
from app.security.web_access import path_module

def central_write_authorized(claims):
    """Accept an authenticated owner policy or the original fresh verification."""
    return (
        claims.get('sub') == 'KRMAR78'
        and claims.get('role') == 'admin'
        and claims.get('nativeId') is None
        and claims.get('authzPolicy') == 'owner-no-additional-prompts/1'
    ) or (
        type(claims.get('reauthUntil')) is int
        and claims['reauthUntil'] > int(time.time())
    )


class CmlWebBoundary:
    def __init__(self, app, *, audience, session_factory, resolve_identity, ui_root, hotel_oauth=None):
        self.app = app
        self.audience = audience
        self.session_factory = session_factory
        self.resolve_identity = resolve_identity
        self.ui_root = Path(ui_root).resolve()
        self.requests = WebRequests(session_factory)
        self.hotel_oauth = hotel_oauth
        path = os.getenv('CML_WEB_JWKS_PATH')
        self.verifier = WebVerifier.from_file(audience, path) if path else None
        entry_only = os.getenv('CML_BROWSER_ENTRY_ONLY', '0')
        if entry_only not in {'0', '1'}:
            raise RuntimeError('CML_BROWSER_ENTRY_ONLY must be 0 or 1')
        self.browser_entry_only = entry_only == '1'

    def _identity(self, claims, selected_role):
        with self.session_factory() as db:
            try:
                db.execute(text('DELETE FROM cml_web_nonce WHERE expires_at < :now'), {'now': claims['iat'] - 20})
                db.execute(text('INSERT INTO cml_web_nonce(jti,expires_at) VALUES(:jti,:exp)'), claims)
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                raise AssertionDenied('assertion_replayed') from exc
            return self.resolve_identity(db, claims, selected_role)

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            scope.setdefault('state', {})['cml_browser_entry_only'] = self.browser_entry_only
        if scope['type'] != 'http' or not scope['path'].startswith('/cml-web/'):
            await self.app(scope, receive, send)
            return
        if self.verifier is None:
            await JSONResponse({'error': 'cml_web_unconfigured'}, status_code=503)(scope, receive, send)
            return
        try:
            headers = {k.decode('latin1').lower(): v.decode('latin1') for k, v in scope['headers']}
            if headers.get('origin') != 'https://kajovocml.hcasc.cz':
                raise AssertionDenied('issuer_required')
            body = bytearray()
            while True:
                message = await receive()
                if message['type'] != 'http.request':
                    raise AssertionDenied('incomplete_request')
                body.extend(message.get('body', b''))
                if len(body) > 8_000_000:
                    raise AssertionDenied('payload_too_large')
                if not message.get('more_body'):
                    break
            raw_path = scope.get('raw_path', scope['path'].encode()).decode('ascii')
            query = scope.get('query_string', b'').decode('ascii')
            exact_path = raw_path + ('?' + query if query else '')
            claims = self.verifier.verify(headers.get('x-cml-web-assertion', ''), scope['method'], exact_path, bytes(body))
            expected_prefix = '/sections/' + self.audience + '/'
            if headers.get('x-cml-web-prefix') != expected_prefix:
                raise AssertionDenied('prefix_mismatch')
            if scope['method'] not in {'GET', 'HEAD'} and not hmac.compare_digest(headers.get('x-csrf-token', ''), claims['csrf']):
                raise AssertionDenied('csrf_denied')
            suffix = scope['path'][len('/cml-web/'):]
            if central_administrator(claims):
                allowed=(suffix=='api/profiles' or re.fullmatch(r'api/profiles/[0-9a-f-]{36}',suffix) or
                         (self.audience=='hotel' and re.fullmatch(r'api/v1/users/[1-9][0-9]*(?:/(?:roles|active))?',suffix)) or
                         (self.audience=='dochazka' and re.fullmatch(r'api/v1/admin/(?:users/[1-9][0-9]*/employments|employments/[1-9][0-9]*)',suffix)))
                if not allowed or query or scope['method'] not in {'GET','POST','PUT','PATCH'}:
                    raise AssertionDenied('central_administration_path_denied')
            if central_settings(claims):
                if not re.fullmatch(r'api/v1/admin/settings/(?:smtp(?:/(?:status|test-email))?|breakfast-whatsapp(?:/preview)?|breakfast-sync|breakfast-import-logs)', suffix) or query:
                    raise AssertionDenied('central_settings_path_denied')
                if scope['method'] not in {'GET', 'HEAD'} and not central_write_authorized(claims):
                    raise AssertionDenied('central_settings_reauthentication_required')
            identity = await asyncio.to_thread(self._identity, claims, parse_qs(query).get('_role', [None])[0])
            suffix = scope['path'][len('/cml-web/'):]
            if any(v in raw_path.lower() for v in ('%2e', '%2f', '%5c', '%25')) or '..' in suffix.split('/') or '\\' in suffix:
                raise AssertionDenied('path_denied')
            if suffix == 'api/profiles' or suffix.startswith('api/profiles/'):
                from app.services.cml_profiles import ProfileFault, ProfileProvisioner
                if (claims['sub'] != 'KRMAR78' and not central_administrator(claims)) or query:
                    raise AssertionDenied('central_owner_required')
                if scope['method'] == 'POST' and suffix == 'api/profiles':
                    if not central_write_authorized(claims):
                        await JSONResponse({'error': {'code': 'cml_reauth_required'}}, status_code=403)(scope, receive, send)
                        return
                    if headers.get('content-type', '').split(';')[0] != 'application/json' or len(body) > 16384:
                        await JSONResponse({'error': {'code': 'PROFILE_INPUT_INVALID'}}, status_code=422)(scope, receive, send)
                        return
                    operation, argument = ProfileProvisioner(self.session_factory).create, bytes(body)
                elif scope['method'] == 'GET' and suffix.startswith('api/profiles/'):
                    operation, argument = ProfileProvisioner(self.session_factory).read, suffix[len('api/profiles/'):]
                else:
                    await JSONResponse({'error': {'code': 'METHOD_DENIED'}}, status_code=405)(scope, receive, send)
                    return
                try:
                    result = await asyncio.to_thread(operation, argument)
                    profile_response = JSONResponse(result, headers={'Cache-Control': 'no-store'})
                except ProfileFault as exc:
                    profile_response = JSONResponse({'error': {'code': exc.code}}, status_code=exc.status, headers={'Cache-Control': 'no-store'})
                await profile_response(scope, receive, send)
                return
            if self.audience == 'hotel' and suffix == 'oauth/consent' and self.hotel_oauth:
                if claims['sub'] != 'KRMAR78' or not central_write_authorized(claims):
                    raise AssertionDenied('hotel_oauth_owner_required')
                if scope['method'] == 'GET' and query == 'ui=phone':
                    response = FileResponse(
                        self.ui_root / 'phone' / 'consent.html', media_type='text/html',
                        headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},
                    )
                    await response(scope, receive, send)
                    return
                response = await hotel_consent(
                    self.hotel_oauth, scope['method'], query,
                    headers.get('content-type', '').split(';')[0], bytes(body), claims['sub'],
                )
                await response(scope, receive, send)
                return
            if suffix == 'identity':
                if self.audience == 'hotel' and 'breakfast:write' in identity['public'].get('permissions', []):
                    from app.services.breakfast.lighting import configured
                    if configured():
                        identity['public']['breakfast_lighting'] = True
                await JSONResponse(identity['public'], headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            if suffix == 'api/personal-activity':
                params = parse_qs(query, keep_blank_values=True)
                cursor = params.get('cursor', [])
                if scope['method'] != 'GET' or set(params) - {'cursor'} or len(cursor) > 1:
                    raise ReceiptFault('WEB_REQUEST_ID_INVALID', 400)
                if cursor:
                    request_id(cursor[0])
                result = await asyncio.to_thread(
                    self.requests.personal_activity, owner_key(claims), identity, cursor[0] if cursor else None,
                )
                await JSONResponse(result, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            if suffix == 'api/request-status':
                params = parse_qs(query, keep_blank_values=True)
                if scope['method'] != 'GET' or set(params) - {'request_id', '_role'} or len(params.get('request_id', [])) != 1:
                    raise ReceiptFault('WEB_REQUEST_ID_INVALID', 400)
                ident = request_id(params['request_id'][0])
                result = await asyncio.to_thread(self.requests.read, owner_key(claims), ident, identity)
                await JSONResponse(result, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            if suffix == 'ui-manifest.json':
                manifest = json.loads((self.ui_root / 'ui-manifest.json').read_text(encoding='utf-8'))
                manifest['views'] = [v for v in manifest['views'] if (not v.get('admin') or identity['public']['admin']) and (bool(identity['state'].get('_kajovo_auth_session', {}).get('cml_permissions')) or not v.get('roles') or any(role in v['roles'] for role in identity['public'].get('roles', []))) and (v.get('audienceRole') is None or v['audienceRole']==('admin' if identity['public']['admin'] else 'member')) and (not v.get('permission') or v['permission'] in identity['public'].get('available_permissions', identity['public'].get('permissions', [])))]
                await JSONResponse(manifest, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            hotel_mcp = self.audience == 'hotel' and suffix == 'mcp' and self.hotel_oauth is not None
            if not suffix.startswith('api/') and not hotel_mcp:
                if self.audience == 'hotel' and suffix == 'phone/consent.html':
                    raise AssertionDenied('hotel_oauth_owner_required')
                phone = self.audience == 'hotel' and suffix in {'', 'index.html'} and parse_qs(query).get('ui') == ['phone']
                path = self.ui_root / ('phone/index.html' if phone else (suffix or 'index.html'))
                if path.resolve().is_relative_to(self.ui_root) and path.is_file() and path.suffix in {'.html', '.js', '.css', '.svg', '.ttf', '.png'}:
                    response = FileResponse(path, media_type=mimetypes.guess_type(path)[0], headers={'Cache-Control': 'no-store'})
                    await response(scope, receive, send)
                else:
                    await JSONResponse({'error': 'not_found'}, status_code=404)(scope, receive, send)
                return
            # Account and employment administration is owned by the central CML screen.
            if self.audience == 'hotel' and suffix.startswith(('api/v1/admin/voice-core', 'api/v1/admin/voice-memory')):
                await JSONResponse({'error': {'code': 'voice_outside_cml', 'message': 'Hlasový chat není součástí přechodu do CML.'}}, status_code=403, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                return
            central = ((self.audience == 'hotel' and (suffix == 'api/v1/users' or suffix.startswith('api/v1/users/')))
                       or (self.audience == 'dochazka' and (suffix == 'api/v1/admin/users' or suffix.startswith(('api/v1/admin/users/', 'api/v1/admin/employments/')))))
            if central:
                if claims['sub'] != 'KRMAR78' and not central_administrator(claims):
                    raise AssertionDenied('central_administrator_required')
                if scope['method'] == 'POST' and suffix in {'api/v1/users', 'api/v1/admin/users'}:
                    raise AssertionDenied('central_profile_contract_required')
                if any(part in suffix.split('/') for part in ('set-password', 'send-reset', 'password', 'reset-link')):
                    raise AssertionDenied('central_credentials_only')
                if body and headers.get('content-type', '').split(';')[0] == 'application/json':
                    try:
                        payload = json.loads(body)
                    except (ValueError, UnicodeError) as exc:
                        raise AssertionDenied('invalid_json') from exc
                    if isinstance(payload, dict) and payload.get('password') is not None:
                        raise AssertionDenied('central_credentials_only')
                if scope['method'] not in {'GET', 'HEAD'} and (not central_write_authorized(claims)):
                    await JSONResponse({'error': {'code': 'cml_reauth_required', 'message': 'Nejprve čerstvě ověřte identitu v KájovoCML.'}}, status_code=403, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                    return
            # A signed request cannot start a local login or invoke a different public protocol.
            if (not hotel_mcp and not suffix.startswith(('api/v1/', 'api/auth/'))) or suffix.endswith(('/login', '/logout', '/reset-password', '/request-password-reset')):
                raise AssertionDenied('route_denied')
            module = None
            warehouse_route = suffix.split('/')[:3] == ['api', 'v1', 'inventory']
            if self.audience == 'hotel':
                module = path_module(suffix, parse_qs(query, keep_blank_values=True).get('warehouse', ()))
                if warehouse_route and module is None:
                    await JSONResponse({'detail': 'Neplatný výběr skladu.'}, status_code=422, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                    return
            if self.audience == 'hotel' and claims['sub'] != 'KRMAR78' and not central_administrator(claims) and not central_settings(claims):
                action = 'read' if scope['method'] in {'GET', 'HEAD'} else 'write'
                locale_route = suffix == 'api/auth/locale'
                if not (locale_route or hotel_mcp) and (module is None or module + ':' + action not in identity['public']['permissions']):
                    if warehouse_route:
                        await JSONResponse({'detail': 'K tomuto skladu nemáte oprávnění.'}, status_code=403, headers={'Cache-Control': 'no-store'})(scope, receive, send)
                        return
                    raise AssertionDenied('module_permission_denied')
            forwarded = dict(scope)
            forwarded['path'] = '/' + suffix
            forwarded['raw_path'] = ('/' + suffix).encode()
            forwarded['state'] = {**scope.get('state', {}), **identity.get('state', {}), 'cml_web_claims': claims}
            if hotel_mcp:
                public = identity["public"]
                forwarded["state"]["hotel_mcp_permissions"] = public["permissions"]
                forwarded["state"]["hotel_mcp_breakfast_manager"] = (
                    public["active_role"] in {"admin", "recepce"}
                    or "breakfast:write" in public["permissions"]
                )
            consumed = False

            async def replay_body():
                nonlocal consumed
                if not consumed:
                    consumed = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()

            # Only business module routes participate in the generic receipt journal.
            permission = module + ':write' if module else None
            if scope['method'] not in {'GET', 'HEAD'} and permission and 'idempotency-key' in headers:
                ident = request_id(headers['idempotency-key'])
                previous = await asyncio.to_thread(self.requests.admit, owner_key(claims), ident, identity, scope['method'], exact_path, bytes(body), permission)
                if previous is not None:
                    if previous['state'] != 'completed':
                        raise ReceiptFault('WEB_REQUEST_UNCERTAIN', 409)
                    from starlette.responses import Response
                    response = Response(status_code=204) if previous['status'] == 204 else JSONResponse(previous['body'], status_code=previous['status'])
                    response.headers['Cache-Control'] = 'no-store'
                    await response(scope, receive, send)
                    return
                await self.requests.dispatch(owner_key(claims), ident, self.app, forwarded, replay_body, send)
            else:
                await self.app(forwarded, replay_body, send)
        except ReceiptFault as exc:
            await JSONResponse({'error': {'code': exc.code, 'message': 'Načtěte původní výsledek operace.'}, 'uncertain': exc.code == 'WEB_REQUEST_UNCERTAIN'}, status_code=exc.status, headers={'Cache-Control': 'no-store'})(scope, receive, send)
        except (AssertionDenied, UnicodeError):
            await JSONResponse({'error': 'cml_web_denied'}, status_code=401, headers={'Cache-Control': 'no-store'})(scope, receive, send)
