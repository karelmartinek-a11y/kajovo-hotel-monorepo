"""Reject removed *active* contracts while retaining historical/negative evidence.

Documentation, comments, Python docstrings, and dedicated test/fixture trees cannot
activate a production contract. Production identifiers, exact wire/config literals
and route prefixes remain forbidden. Output contains paths/tokens, never payloads.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMOVED = ('smart_technologies', 'SMART_TECHNOLOGIES', 'VoiceToolExecutor',
           'function_call_output', '/voice-core/tools', 'connector_id', 'ha_device_catalog.v3')
IDENTIFIERS = set(REMOVED) - {'/voice-core/tools', 'ha_device_catalog.v3'}
SKIP_PARTS = {'node_modules', 'dist', '.venv', '__pycache__', 'test-results',
              'playwright-report', 'tests', '__tests__', 'fixtures', '__fixtures__'}
SUFFIXES = {'.py', '.ts', '.tsx', '.js', '.jsx', '.yml', '.yaml', '.json', '.toml', '.conf', '.mjs'}


def retired_literal(value):
    if not isinstance(value, str):
        return None
    return next((token for token in REMOVED if value == token
                 or token == '/voice-core/tools' and value.startswith(token + '/')), None)


def python_contracts(body):
    tree = ast.parse(body)
    docstrings = {id(node.value) for owner in ast.walk(tree)
                  if isinstance(owner, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                  for node in owner.body[:1] if isinstance(node, ast.Expr)
                  and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)}
    hits = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and id(node) not in docstrings:
            token = retired_literal(node.value)
            if token:
                hits.add(token)
        if isinstance(node, (ast.Name, ast.Attribute, ast.arg, ast.keyword, ast.alias)):
            if isinstance(node, ast.Name):
                names = [node.id]
            elif isinstance(node, ast.Attribute):
                names = [node.attr]
            elif isinstance(node, ast.alias):
                names = node.name.split('.') + [node.asname]
            else:
                names = [node.arg]
            hits.update(name for name in names if name in IDENTIFIERS)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name in IDENTIFIERS:
            hits.add(node.name)
        # Constant concatenation must not conceal an outgoing retired field.
        if isinstance(node, (ast.BinOp, ast.JoinedStr)):
            def concat(part):
                if isinstance(part, ast.Constant) and isinstance(part.value, str):
                    return part.value
                if isinstance(part, ast.JoinedStr):
                    values = [concat(value) for value in part.values]
                    return ''.join(values) if all(value is not None for value in values) else None
                if isinstance(part, ast.FormattedValue) and part.format_spec is None and part.conversion == -1:
                    return concat(part.value)
                if isinstance(part, ast.BinOp) and isinstance(part.op, ast.Add):
                    left, right = concat(part.left), concat(part.right)
                    if left is not None and right is not None:
                        return left + right
                return None
            token = retired_literal(concat(node))
            if token:
                hits.add(token)
    return hits


def decode_js_string(value):
    def escaped(match):
        part = match.group()[1:]
        if part.startswith('u{'):
            return chr(int(part[2:-1], 16))
        if part.startswith(('u', 'x')):
            return chr(int(part[1:], 16))
        return {'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f'}.get(part, part)
    return re.sub(r'\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])', escaped, value)


def _regex_start(body, position):
    return re.search(r'(?:[=(,:!\[?{]|\breturn)\s*$', body[:position]) is not None


def _regex_end(body, position):
    cursor, char_class = position + 1, False
    while cursor < len(body):
        char = body[cursor]
        if char == '\\':
            cursor += 2
            continue
        if char == '[':
            char_class = True
        elif char == ']':
            char_class = False
        elif char == '/' and not char_class:
            return cursor + 1
        elif char in '\r\n':
            return position + 1  # Division/JSX, not a regex literal.
        cursor += 1
    return position + 1


def _brace_end(body, position):
    cursor, depth = position, 1
    while cursor < len(body):
        if body.startswith('//', cursor):
            end = body.find('\n', cursor)
            cursor = len(body) if end < 0 else end + 1
            continue
        if body.startswith('/*', cursor):
            end = body.find('*/', cursor + 2)
            if end < 0:
                raise ValueError('ambiguous_template_expression')
            cursor = end + 2
            continue
        if body[cursor] in '"\'`':
            cursor = _string_end(body, cursor)
            continue
        if body[cursor] == '/' and _regex_start(body, cursor):
            cursor = _regex_end(body, cursor)
            continue
        if body[cursor] == '{':
            depth += 1
        elif body[cursor] == '}':
            depth -= 1
            if not depth:
                return cursor + 1
        cursor += 1
    raise ValueError('ambiguous_template_expression')


def _string_end(body, position):
    quote, cursor = body[position], position + 1
    while cursor < len(body):
        if body[cursor] == '\\':
            cursor += 2
            continue
        if body[cursor] == quote:
            return cursor + 1
        if quote == '`' and body.startswith('${', cursor):
            cursor = _brace_end(body, cursor + 2)
            continue
        cursor += 1
    raise ValueError('ambiguous_template_expression')


def js_tokens(body):
    """Lex strings/comments/templates with balanced executable interpolation."""
    cursor, code_start = 0, 0
    while cursor < len(body):
        end, kind = cursor, None
        if body.startswith('//', cursor):
            end = body.find('\n', cursor)
            end = len(body) if end < 0 else end + 1
            kind = 'comment'
        elif body.startswith('/*', cursor):
            end = body.find('*/', cursor + 2)
            if end < 0:
                raise ValueError('ambiguous_js_comment')
            end += 2
            kind = 'comment'
        elif body[cursor] in '"\'`':
            end = _string_end(body, cursor)
            kind = 'template' if body[cursor] == '`' else 'literal'
        elif body[cursor] == '/' and _regex_start(body, cursor):
            end = _regex_end(body, cursor)
            if end > cursor + 1:
                kind = 'regex'
        if kind:
            if code_start < cursor:
                yield 'code', body[code_start:cursor]
            yield kind, body[cursor:end]
            cursor = code_start = end
        else:
            cursor += 1
    if code_start < len(body):
        yield 'code', body[code_start:]


def _constant_expression(body):
    values = []
    for kind, value in js_tokens(body):
        if kind in {'comment', 'regex'}:
            continue
        if kind == 'literal':
            values.append(decode_js_string(value[1:-1]))
        elif kind == 'code' and re.fullmatch(r'[\s+()]*', value):
            continue
        else:
            return None
    return ''.join(values) if values else None


def template_parts(body):
    parts, position = [], 0
    while position < len(body):
        start = body.find('${', position)
        while start >= 0:
            backslashes, before = 0, start - 1
            while before >= 0 and body[before] == '\\':
                backslashes += 1
                before -= 1
            if backslashes % 2 == 0:
                break
            start = body.find('${', start + 2)
        if start < 0:
            parts.append(('literal', decode_js_string(body[position:])))
            break
        parts.append(('literal', decode_js_string(body[position:start])))
        end = _brace_end(body, start + 2)
        parts.append(('expression', body[start + 2:end - 1]))
        position = end
    return parts


def javascript_contracts(body):
    hits, code, constants = set(), [], []
    try:
        tokens = list(js_tokens(body))
        for kind, value in tokens:
            if kind == 'code':
                code.append(value)
                if not re.fullmatch(r'[\s+()]*', value):
                    if constants:
                        found = retired_literal(''.join(constants))
                        if found:
                            hits.add(found)
                    constants = []
            elif kind == 'literal':
                decoded = decode_js_string(value[1:-1])
                constants.append(decoded)
                found = retired_literal(decoded)
                if found:
                    hits.add(found)
                code.append(' ')
            elif kind == 'template':
                values, constant = [], True
                for part_kind, part in template_parts(value[1:-1]):
                    if part_kind == 'literal':
                        values.append(part)
                    else:
                        hits.update(javascript_contracts(part))
                        folded = _constant_expression(part)
                        if folded is None:
                            constant = False
                        else:
                            values.append(folded)
                if constant:
                    found = retired_literal(''.join(values))
                    if found:
                        hits.add(found)
                constants = []
                code.append(' ')
            else:
                code.append(' ')
        if constants:
            found = retired_literal(''.join(constants))
            if found:
                hits.add(found)
    except (ValueError, OverflowError):
        hits.add('ambiguous_template_expression')
    executable = decode_js_string(''.join(code))
    for name in IDENTIFIERS:
        if re.search(r'(?<![\w])' + re.escape(name) + r'(?![\w])', executable):
            hits.add(name)
    return hits


def text_contracts(body, suffix):
    hits = set()
    if suffix in {'.ts', '.tsx', '.js', '.jsx', '.mjs'}:
        return javascript_contracts(body)
    else:
        # Config comments are not directives. Exact quoted or unquoted retired
        # fields/values still fail; narrative strings containing a name do not.
        lines = []
        for line in body.splitlines():
            quote, escaped, end = None, False, len(line)
            for position, char in enumerate(line):
                if escaped:
                    escaped = False
                elif char == '\\' and quote:
                    escaped = True
                elif quote and char == quote:
                    quote = None
                elif not quote and char in '"\'':
                    quote = char
                elif not quote and char == '#':
                    end = position
                    break
            lines.append(line[:end])
        executable = '\n'.join(lines)
        quoted = re.compile(r'"([^"\n]*)"|\'([^\'\n]*)\'')
        def config_literal(match):
            found = retired_literal(decode_js_string(match.group(1) or match.group(2) or ''))
            if found:
                hits.add(found)
            return ' '
        executable = quoted.sub(config_literal, executable)
    for name in IDENTIFIERS:
        if re.search(r'(?<![\w])' + re.escape(name) + r'(?![\w])', executable):
            hits.add(name)
    if suffix == '.conf' and '/voice-core/tools' in executable:
        hits.add('/voice-core/tools')
    return hits


def violations(root=ROOT):
    result = []
    for area in ('apps', 'packages', 'infra', '.github'):
        for path in sorted((root / area).rglob('*')):
            if not path.is_file() or any(part in SKIP_PARTS for part in path.relative_to(root).parts):
                continue
            if path.suffix not in SUFFIXES or re.search(r'\.(?:test|spec)\.', path.name):
                continue
            body = path.read_text(encoding='utf-8')
            try:
                hits = python_contracts(body) if path.suffix == '.py' else text_contracts(body, path.suffix)
            except SyntaxError:
                result.append((str(path.relative_to(root)), 'invalid_python_source'))
                continue
            result.extend((str(path.relative_to(root)), token) for token in sorted(hits))
    return result


def main():
    failures = violations()
    if failures:
        for path, token in failures:
            print(f'Removed active integration contract: {path} ({token})')
        return 1
    print('Native MCP active source/config contracts PASS; historical evidence retained')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
