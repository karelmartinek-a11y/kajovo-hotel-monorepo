"""Fail-closed dependency routing for CI; scope is computed from Git, never a label.

UI suites keep their full scenarios and viewport coverage. API consumers include
Android contract checks without coupling its independent APK/emulator release.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen

EXCLUDED_EVIDENCE = {'docs/native-mcp-independent-review.json', 'docs/native-mcp-independent-review.md'}
FLAGS = ('full', 'python', 'api', 'web', 'admin', 'android', 'voice',
         'visual_web', 'visual_admin', 'review_required', 'deploy_required',
         'runtime_images', 'deployable', 'static')
RISK = re.compile(r'(?:^|[/_.-])(?:auth|authorization|csrf|session|login|logout|password|secret|token|rbac|roles?|permissions?|migrations?|database|models?|mcp|voice|deploy|release|cutover|security|policy|agents?)(?:$|[/_.-])', re.I)
SAFE_DOC_SUFFIXES = {'.md', '.rst', '.txt', '.png', '.jpg', '.jpeg', '.svg', '.webp'}
COSMETIC_DOC_PREFIXES = ('docs/archive/', 'docs/notes/')
# Executable TS/TSX/JS and JSON/config changes are unknown functional impact.
# Only presentation styles and image assets qualify without a full review.
UI_SUFFIXES = {'.css', '.scss', '.png', '.jpg', '.jpeg', '.webp'}


def _full(paths, reason):
    data = {flag: True for flag in FLAGS}
    data.update(schema='kajovo_ci_scope.v1', review_profile='full', review_scope='full',
                changed_paths=sorted(set(paths)), reasons=[reason])
    return data


def classify(paths):
    paths = sorted(set(paths))
    out = {flag: False for flag in FLAGS}
    out.update(schema='kajovo_ci_scope.v1', static=True, changed_paths=paths,
               review_profile='none', review_scope='none', reasons=[])
    for name in paths:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or not name:
            return _full(paths, 'invalid_path')
        if name in EXCLUDED_EVIDENCE:
            continue
        if path.name in {'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'} or path.name.startswith(('vite.config.', 'playwright.config.', 'tsconfig')):
            return _full(paths, 'toolchain_dependency')
        normalized = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name)
        if RISK.search(normalized):
            return _full(paths, 'security_protocol_or_release_dependency')
        if name.startswith(COSMETIC_DOC_PREFIXES) and path.suffix.lower() in SAFE_DOC_SUFFIXES:
            out['reasons'].append('cosmetic_documentation')
            continue
        ui = None
        if name.startswith('apps/kajovo-hotel-web/'):
            ui = 'web'
        elif name.startswith('apps/kajovo-hotel-admin/'):
            ui = 'admin'
        if ui:
            relative = name.split('/', 2)[2]
            if (relative.startswith(('src/', 'public/', 'tests/')) and path.suffix.lower() in UI_SUFFIXES
                    and not relative.startswith(('src/api/', 'src/lib/', 'src/services/', 'src/hooks/'))):
                out[ui] = out[f'visual_{ui}'] = True
                out['review_required'] = out['deploy_required'] = True
                out['review_profile'] = out['review_scope'] = 'targeted'
                out['reasons'].append(f'{ui}_ui_and_all_viewports')
                continue
            return _full(paths, 'unknown_frontend_or_toolchain_dependency')
        if name.startswith(('packages/ui/', 'brand/')) and path.suffix.lower() in UI_SUFFIXES:
            out['web'] = out['admin'] = out['visual_web'] = out['visual_admin'] = True
            out['review_required'] = out['deploy_required'] = True
            out['review_profile'] = out['review_scope'] = 'targeted'
            out['reasons'].append('shared_ui_consumers')
            continue
        if name.startswith('android/'):
            # APK and emulator checks remain in the separate Android workflow.
            out['android'] = True
            out['review_required'] = True
            out['review_profile'] = out['review_scope'] = 'targeted'
            out['reasons'].append('android_contract_consumer')
            continue
        # API/shared client, lockfiles, workflows, instructions, infra, scripts,
        # portable Voice and unknown files all propagate through every consumer.
        return _full(paths, 'unknown_or_shared_runtime_dependency')
    out['api'] = out['python']
    out['runtime_images'] = out['deployable'] = out['deploy_required']
    out['reasons'] = sorted(set(out['reasons'])) or ['no_runtime_changes']
    return out


def changed_paths(root: Path, base: str, head: str):
    if not base or set(base) == {'0'}:
        raise RuntimeError('missing_base')
    for ref in (base, head):
        subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--verify', f'{ref}^{{commit}}'], stderr=subprocess.DEVNULL)
    if subprocess.run(['git', '-C', str(root), 'merge-base', '--is-ancestor', base, head], check=False).returncode:
        raise RuntimeError('base_is_not_ancestor')
    # No rename detection: both old and new paths are dependencies.
    raw = subprocess.check_output(['git', '-C', str(root), 'diff', '--no-renames', '--name-only', '-z', base, head])
    return [name.decode('utf-8', errors='strict') for name in raw.split(b'\0') if name]


def _github_json(path, token):
    request = Request('https://api.github.com/repos/karelmartinek-a11y/kajovo-hotel-monorepo/' + path,
                      headers={'Authorization': f'Bearer {token}',
                               'Accept': 'application/vnd.github+json',
                               'X-GitHub-Api-Version': '2022-11-28'})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def base_ci_verified(base):
    """A scoped delta is safe only after CI *and actual deployment* of its base.

    An observer/preflight workflow success with a skipped production job proves
    no runtime acceptance. Otherwise a docs push can strand undeployed changes.
    """
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if not token or not re.fullmatch(r'[a-f0-9]{40}', base or ''):
        return False
    try:
        runs = _github_json(f'actions/workflows/ci-gates.yml/runs?head_sha={base}&per_page=100', token)['workflow_runs']
        matching = [run for run in runs if run.get('head_sha') == base
                    and run.get('head_branch') == 'main'
                    and run.get('event') in {'push', 'workflow_dispatch'}]
        latest = max(matching, key=lambda run: (run.get('created_at', ''), run.get('id', 0), run.get('run_attempt', 1)), default={})
        if latest.get('status') != 'completed' or latest.get('conclusion') != 'success':
            return False
        deployments = _github_json(f'actions/workflows/deploy-production.yml/runs?head_sha={base}&per_page=100', token)['workflow_runs']
        deployments = sorted((run for run in deployments if run.get('head_sha') == base
                              and run.get('head_branch') == 'main'),
                             key=lambda run: (run.get('created_at', ''), run.get('id', 0)), reverse=True)
        for run in deployments:
            jobs = _github_json(f'actions/runs/{run["id"]}/jobs?per_page=100', token)['jobs']
            deployed = [job for job in jobs if job.get('name') == 'deploy-production'
                        and job.get('conclusion') != 'skipped']
            if deployed:
                job = deployed[-1]
                return job.get('status') == 'completed' and job.get('conclusion') == 'success'
            # A running observer may still initiate a production job. The prior
            # deployment is insufficient to prove the current baseline state.
            if run.get('status') != 'completed':
                return False
        return False
    except (OSError, ValueError, KeyError, TypeError):
        return False


def scope(root: Path, base: str, head='HEAD', *, base_verified=False):
    try:
        if not base_verified:
            raise RuntimeError('base_ci_not_verified')
        data = classify(changed_paths(root, base, head))
        data.update(base=subprocess.check_output(['git', '-C', str(root), 'rev-parse', base], text=True).strip(),
                    head=subprocess.check_output(['git', '-C', str(root), 'rev-parse', head], text=True).strip())
        return data
    except (OSError, subprocess.CalledProcessError, RuntimeError, UnicodeError):
        data = _full([], 'unverified_or_missing_git_history')
        try:
            data['head'] = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--verify', f'{head}^{{commit}}'], stderr=subprocess.DEVNULL, text=True).strip()
        except (OSError, subprocess.CalledProcessError):
            data['head'] = None
        data['base'] = None
        return data


def write_outputs(data, path):
    with open(path, 'a', encoding='utf-8') as output:
        for flag in FLAGS:
            output.write(f'{flag}={str(data[flag]).lower()}\n')
        for key in ('review_profile', 'review_scope'):
            output.write(f'{key}={data[key]}\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--github-output')
    parser.add_argument('--json-output')
    args = parser.parse_args()
    result = scope(Path(__file__).resolve().parents[1], args.base, args.head,
                   base_verified=base_ci_verified(args.base))
    body = json.dumps(result, indent=2, sort_keys=True) + '\n'
    if args.json_output:
        Path(args.json_output).write_text(body, encoding='utf-8')
    if args.github_output:
        write_outputs(result, args.github_output)
    print(body, end='')
