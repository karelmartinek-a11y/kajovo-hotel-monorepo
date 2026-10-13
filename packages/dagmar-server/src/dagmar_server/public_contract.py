"""Validated public MCP metadata and deterministic, host-owned model translation.

Only authenticated HTTP/SDK metadata enters here. Metadata never establishes identity,
consent or network origins; those remain RuntimePorts responsibilities.
"""
from copy import deepcopy
from datetime import date, datetime, time
import re
import hashlib
import json
from collections import OrderedDict
from concurrent.futures import Future
from threading import Lock, BoundedSemaphore
from referencing import Registry
from jsonschema import Draft202012Validator, FormatChecker

TRANSLATOR_VERSION = 'dagmar-public-contract/1'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def compatible_schema(expected, actual):
    """Accept tested optional fields/annotations, not new restrictions or variants."""
    annotations = {'description', 'title', '$comment', 'default', 'examples',
                   'deprecated', 'readOnly', 'writeOnly'}
    schema_maps = {'properties', '$defs', 'definitions', 'patternProperties', 'dependentSchemas'}
    schema_lists = {'allOf', 'anyOf', 'oneOf', 'prefixItems'}
    schema_values = {'additionalProperties', 'unevaluatedProperties', 'propertyNames',
                     'items', 'contains', 'additionalItems', 'unevaluatedItems',
                     'not', 'if', 'then', 'else', 'contentSchema'}

    def object_fields(schema, seen=None):
        if not isinstance(schema, dict):
            return set()
        seen = set() if seen is None else seen
        fields = set(schema.get('properties', {})) | set(schema.get('required', []))
        reference = schema.get('$ref')
        if isinstance(reference, str) and reference.startswith('#') and reference not in seen:
            seen.add(reference)
            target = expected
            try:
                for part in reference[2:].split('/') if reference != '#' else []:
                    target = target[part.replace('~1', '/').replace('~0', '~')]
                fields |= object_fields(target, seen)
            except (KeyError, TypeError):
                pass
        for key in ('allOf', 'anyOf', 'oneOf'):
            for variant in schema.get(key, []):
                fields |= object_fields(variant, seen)
        for key in ('not', 'if', 'then', 'else'):
            fields |= object_fields(schema.get(key), seen)
        for variant in schema.get('dependentSchemas', {}).values():
            fields |= object_fields(variant, seen)
        for name, dependencies in schema.get('dependentRequired', {}).items():
            fields |= {name, *dependencies}
        return fields

    def compare(left, right):
        if not isinstance(left, dict):
            return canonical(left) == canonical(right)
        if not isinstance(right, dict):
            return False
        extra = set(right) - set(left) - annotations
        # Definitions alone are inert; a new root properties map can constrain
        # fields already defined in oneOf/$ref variants and is not additive.
        if extra - {'$defs', 'definitions'}:
            return False
        for key in extra:
            if not isinstance(right[key], dict):
                return False
        for key, value in left.items():
            if key in annotations:
                continue
            if key not in right:
                return False
            if key in schema_maps:
                if not isinstance(value, dict) or not isinstance(right[key], dict):
                    return False
                added = set(right[key]) - set(value)
                if key not in {'properties', '$defs', 'definitions'} and added:
                    return False
                if key == 'properties' and added and (
                        added & object_fields(left) or left.get('patternProperties')):
                    return False
                if any(name not in right[key] or not compare(schema, right[key][name])
                       for name, schema in value.items()):
                    return False
            elif key in schema_lists:
                if not isinstance(value, list) or not isinstance(right[key], list) or len(value) != len(right[key]) or any(
                        not compare(a, b) for a, b in zip(value, right[key])):
                    return False
            elif key in schema_values:
                if not compare(value, right[key]):
                    return False
            # const/enum/required and extension dictionaries are JSON data,
            # never schema nodes with ignorable description/default keys.
            elif canonical(value) != canonical(right[key]):
                return False
        return True
    return compare(expected, actual)


PUBLIC_FORMATS = FormatChecker()


@PUBLIC_FORMATS.checks('date', raises=(ValueError, TypeError))
def _date(value):
    if not isinstance(value, str):
        return True
    return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)) and bool(date.fromisoformat(value))


@PUBLIC_FORMATS.checks('date-time', raises=(ValueError, TypeError))
def _instant(value):
    if not isinstance(value, str):
        return True
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)', value):
        return False
    return datetime.fromisoformat(value.upper().replace('Z', '+00:00')).tzinfo is not None


@PUBLIC_FORMATS.checks('time', raises=(ValueError, TypeError))
def _offset_time(value):
    if not isinstance(value, str):
        return True
    if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)', value):
        return False
    return time.fromisoformat(value.upper().replace('Z', '+00:00')).tzinfo is not None


@PUBLIC_FORMATS.checks('local-date-time', raises=(ValueError, TypeError))
def _local_datetime(value):
    if not isinstance(value, str):
        return True
    return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?', value)) and datetime.fromisoformat(value).tzinfo is None


@PUBLIC_FORMATS.checks('local-time', raises=(ValueError, TypeError))
def _local_time(value):
    if not isinstance(value, str):
        return True
    return bool(re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?', value)) and time.fromisoformat(value).tzinfo is None


# Public schema data only. No credentials, identities, grants, readings or consent.
# At most four revisions / 8 MiB canonical tool bytes; two independent builds.
_COMPILED = OrderedDict()
_COMPILED_BYTES = 0
_FLIGHTS = {}
_CACHE_LOCK = Lock()
_BUILD_SLOTS = BoundedSemaphore(2)


def _compile_tools(encoded):
    global _COMPILED_BYTES
    key = hashlib.sha256(encoded).digest()
    with _CACHE_LOCK:
        cached = _COMPILED.get(key)
        if cached:
            _COMPILED.move_to_end(key)
            return cached[1]
        flight = _FLIGHTS.get(key)
        owner = flight is None
        if owner:
            flight = Future()
            _FLIGHTS[key] = flight
    if not owner:
        return flight.result()
    try:
        with _BUILD_SLOTS:
            values = json.loads(encoded)
            tools, validators, outputs = {}, {}, {}
            for tool in values:
                if not isinstance(tool,dict) or not isinstance(tool.get('name'),str) or tool['name'] in tools or tool.get('inputSchema',{}).get('type') != 'object':
                    raise ValueError('invalid_contract_tools')
                def local_refs(value):
                    if isinstance(value,dict):
                        if '$ref' in value and not value['$ref'].startswith('#'):
                            raise ValueError('external_contract_schema_reference')
                        for child in value.values():
                            local_refs(child)
                    elif isinstance(value,list):
                        for child in value:
                            local_refs(child)
                for schema in (tool['inputSchema'],tool.get('outputSchema')):
                    if schema:
                        local_refs(schema)
                        Draft202012Validator.check_schema(schema)
                name = tool['name']
                tools[name] = tool
                validators[name] = Draft202012Validator(tool['inputSchema'],format_checker=PUBLIC_FORMATS,registry=Registry())
                if tool.get('outputSchema'):
                    outputs[name] = Draft202012Validator(tool['outputSchema'],format_checker=PUBLIC_FORMATS,registry=Registry())
            compiled = tools, validators, outputs
        with _CACHE_LOCK:
            if len(encoded) <= 8*1024*1024:
                _COMPILED[key] = (len(encoded),compiled)
                _COMPILED_BYTES += len(encoded)
                while len(_COMPILED)>4 or _COMPILED_BYTES>8*1024*1024:
                    _, (size,_) = _COMPILED.popitem(last=False)
                    _COMPILED_BYTES -= size
            _FLIGHTS.pop(key,None)
            flight.set_result(compiled)
        return compiled
    except BaseException as exc:
        with _CACHE_LOCK:
            _FLIGHTS.pop(key,None)
            flight.set_exception(exc)
        raise


def _known_legacy_schemas(tools, policy):
    """Private translation after pinned known-wire match; raw metadata is retained."""
    values = deepcopy(tools)
    for tool in values:
        for key in ('inputSchema', 'outputSchema'):
            schema = tool.get(key)
            if not isinstance(schema, dict):
                continue
            if key == 'inputSchema' and schema.get('type') is None and schema.get('oneOf'):
                schema['type'] = 'object'
            if policy != 'smartplan-known-calendar/1':
                continue
            definitions = schema.get('$defs', {})
            calendar = definitions.get('Calendar', {}).get('properties', {}).get('times', {}).get('items', {})
            if calendar.get('format') == 'time':
                calendar['format'] = 'local-time'
            for field in definitions.get('Window', {}).get('properties', {}).values():
                if field.get('format') == 'time':
                    field['format'] = 'local-time'
            interval = definitions.get('Interval', {})
            anchor = interval.get('properties', {}).get('anchor', {})
            if anchor.get('format') == 'date-time':
                anchor.pop('format')
                interval.setdefault('allOf', []).extend([
                    {'if':{'properties':{'basis':{'const':'calendar'}},'required':['basis']},
                     'then':{'properties':{'anchor':{'format':'local-date-time'}}}},
                    {'if':{'properties':{'basis':{'const':'elapsed'}},'required':['basis']},
                     'then':{'properties':{'anchor':{'format':'date-time'}}}},
                ])
    return values


class PublicContract:
    def __init__(self, value, *, profiles, expected_tools=None, expected_outputs=None, schema_policy='canonical-strict/1'):
        if not isinstance(value, dict) or value.get('compatibility_profile') not in profiles:
            raise ValueError('unsupported_contract_profile')
        expected_version = profiles[value['compatibility_profile']]
        if value.get('contract_version') != expected_version:
            raise ValueError('unsupported_contract_version')
        unsigned = {k:v for k,v in value.items() if k not in {'sha256', 'metadata_digest'}}
        self.metadata_digest = digest(unsigned)
        if not any(key in value for key in ('sha256', 'metadata_digest')) or any(value[key] != self.metadata_digest for key in ('sha256', 'metadata_digest') if key in value) or value.get('digest_algorithm') != 'sha256-canonical-json-v1':
            raise ValueError('contract_integrity_error')
        if not isinstance(value.get('instructions'), str) or not value['instructions'] or not isinstance(value.get('guidance_version'), str):
            raise ValueError('invalid_contract_guidance')
        tools = value.get('tools')
        if not isinstance(tools, list) or not tools:
            raise ValueError('invalid_contract_tools')
        if schema_policy not in {'canonical-strict/1', 'known-2025-object-root/1', 'smartplan-known-calendar/1'}:
            raise ValueError('unsupported_schema_translation_policy')
        self.schema_policy = schema_policy
        self.wire_tools = {tool['name']:deepcopy(tool) for tool in tools}
        translated = tools if schema_policy == 'canonical-strict/1' else _known_legacy_schemas(tools, schema_policy)
        self.tools, self.validators, self.outputs = _compile_tools(canonical(translated))
        if expected_tools and (not set(expected_tools).issubset(self.tools) or any(
                not compatible_schema(schema, self.wire_tools[name]['inputSchema']) for name,schema in expected_tools.items())):
            raise ValueError('breaking_contract_schema')
        if expected_outputs and (not set(expected_outputs).issubset(self.outputs) or any(
                not compatible_schema(schema, self.wire_tools[name]['outputSchema']) for name,schema in expected_outputs.items())):
            raise ValueError('breaking_contract_output_schema')
        self.value = deepcopy(value)

    def verify_wire(self, tools):
        actual = {tool.name: tool.model_dump(by_alias=True, exclude_none=True) for tool in tools}
        if len(actual) != len(tools) or not set(self.tools).issubset(actual):
            raise ValueError('wire_contract_mismatch')
        for name, tool in self.wire_tools.items():
            for key in ('description', 'inputSchema', 'outputSchema', 'annotations', '_meta'):
                if key in tool and actual[name].get(key) != tool[key]:
                    raise ValueError('wire_contract_mismatch')

    def project(self, *, recommended=None, host_rules=''):
        selected = recommended or list(self.tools)
        functions = [{'type':'function', 'name':name, 'description':self.tools[name].get('description',''),
                      'parameters':deepcopy(self.tools[name]['inputSchema'])} for name in selected]
        for function in functions:
            if function['name'] == 'smartplan_prepare_change':
                def hide_identity(value):
                    if isinstance(value, dict):
                        value.get('properties', {}).pop('request_key', None)
                        if 'request_key' in value.get('required', []):
                            value['required'].remove('request_key')
                        for child in value.values():
                            hide_identity(child)
                    elif isinstance(value, list):
                        for child in value:
                            hide_identity(child)
                hide_identity(function['parameters'])
            if function['name'] == 'smart_technologie':
                schema = function['parameters']
                hidden = {'api_version','session_id','confirmed','confirmation_id','intent_id','verification_mode'}
                def host_fields(value):
                    if isinstance(value, dict):
                        for key in hidden:
                            value.get('properties', {}).pop(key, None)
                        if 'required' in value:
                            value['required'] = [key for key in value['required'] if key not in hidden]
                            if not value['required']:
                                value.pop('required')
                        if 'propertyNames' in value and 'enum' in value['propertyNames']:
                            value['propertyNames']['enum'] = [key for key in value['propertyNames']['enum'] if key not in hidden]
                        for child in value.values():
                            host_fields(child)
                    elif isinstance(value, list):
                        for child in value:
                            host_fields(child)
                host_fields(schema)
                # api_version is a trusted fixed 2, so its conditional constraints now apply
                # directly to their remaining model-visible target/operation predicates.
                if 'prepare_control' in schema.get('properties', {}).get('operation', {}).get('enum', []):
                    schema['properties']['operation']['enum'].remove('prepare_control')
                if 'oneOf' in schema:
                    schema['oneOf'] = [variant for variant in schema['oneOf']
                        if variant.get('properties', {}).get('operation', {}).get('const') != 'prepare_control']
                schema.setdefault('allOf', []).append({'if':{'properties':{'operation':{'enum':['control','registry_apply']}},'required':['operation']},
                    'then':{'not':{'required':['request_id']}}})
                actions = schema.get('properties', {}).get('action', {}).get('enum', [])
                if 'prepnout' in actions:
                    actions.remove('prepnout')
                schema.get('properties', {}).get('request_id', {}).update(description='Original backend-issued operation ID for operation_status only; the host supplies write identity.')
        projection = {'translator_version':TRANSLATOR_VERSION, 'schema_policy':self.schema_policy, 'instructions':self.value['instructions'] + '\n' + host_rules,
                      'tools':functions}
        return {**projection, 'metadata_digest':self.metadata_digest, 'projection_digest':digest(projection),
                'compatibility_profile':self.value['compatibility_profile'], 'contract_version':self.value['contract_version'],
                'guidance_version':self.value['guidance_version']}

    def validate_input(self, name, value):
        try:
            invalid = name not in self.validators or not isinstance(value,dict) or any(self.validators[name].iter_errors(value))
        except Exception:
            raise ValueError('invalid_contract_arguments') from None
        if invalid:
            raise ValueError('invalid_contract_arguments')

    def validate_output(self, name, value):
        try:
            invalid = not isinstance(value,dict) or (name in self.outputs and any(self.outputs[name].iter_errors(value)))
        except Exception:
            raise ValueError('invalid_contract_output') from None
        if invalid:
            raise ValueError('invalid_contract_output')


def legacy_contract(instructions, tools, fixtures, *, profile, version, guidance='legacy'):
    """Known unsupported-export 2025 servers; never called after auth/integrity failure."""
    actual = {tool.name:tool.model_dump(by_alias=True, exclude_none=True) for tool in tools}
    for fixture in fixtures:
        expected = {tool['name']:tool for tool in fixture['tools']}
        if set(expected).issubset(actual) and all(
                compatible_schema(tool['inputSchema'], actual[name]['inputSchema']) and
                ('outputSchema' not in tool or compatible_schema(tool['outputSchema'], actual[name].get('outputSchema')))
                for name,tool in expected.items()):
            if instructions and fixture.get('instructions') and instructions != fixture['instructions']:
                continue
            value = {'contract_version':version, 'guidance_version':fixture.get('guidance_version', guidance),
                     'compatibility_profile':profile, 'digest_algorithm':'sha256-canonical-json-v1',
                     'instructions': instructions or fixture.get('instructions', ''), 'tools':list(actual.values()),
                     'policy':fixture.get('policy', {})}
            value['sha256'] = digest(value)
            policy = 'smartplan-known-calendar/1' if profile == 'smartplan-known-2025' else 'known-2025-object-root/1'
            return PublicContract(value, profiles={profile:version}, schema_policy=policy)
    raise ValueError('unsupported_legacy_contract')


def contract_from_fixtures(value, fixtures):
    """A profile may have several explicitly tested public schema revisions."""
    profile = value.get('compatibility_profile') if isinstance(value, dict) else None
    for fixture in fixtures:
        if fixture['compatibility_profile'] != profile:
            continue
        try:
            return PublicContract(value, profiles={profile:fixture['contract_version']},
                expected_tools={t['name']:t['inputSchema'] for t in fixture['tools']},
                expected_outputs={t['name']:t['outputSchema'] for t in fixture['tools'] if t.get('outputSchema')})
        except (ValueError, KeyError, TypeError):
            pass
    raise ValueError('unsupported_contract_revision')
