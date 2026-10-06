"""Host intent contract. Remote identities and consent are deliberately absent."""
INTENTS = (
    'MAIL_COUNT', 'MAIL_LATEST', 'MAIL_SEARCH', 'MAIL_READ', 'MAIL_READ_CURRENT',
    'MAIL_READ_RESULT_BY_ORDINAL', 'MAIL_NEXT', 'MAIL_PREVIOUS', 'MAIL_LIST',
    'MAIL_MARK_READ', 'MAIL_MARK_UNREAD', 'MAIL_MOVE', 'MAIL_TRASH',
    'MAIL_BATCH_MARK_READ', 'MAIL_BATCH_MARK_UNREAD', 'MAIL_BATCH_MOVE', 'MAIL_BATCH_TRASH',
    'MAIL_DRAFT_CREATE', 'MAIL_DRAFT_EDIT', 'MAIL_REPLY', 'MAIL_REPLY_ALL',
    'MAIL_SEND_PREPARE', 'MAIL_SEND_CONFIRM', 'MAIL_SEND_WITHOUT_CONFIRMATION',
    'MAIL_DRAFT_LIST', 'MAIL_DRAFT_SELECT', 'MAIL_ATTACHMENTS',
    'MAIL_SELECT_ACCOUNT', 'MAIL_SELECT_FOLDER', 'MAIL_ACCOUNT_STATUS',
)
ROLES = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive', 'other']
FILTERS = {
    'type': 'object', 'properties': {
        **{k: {'type': 'string', 'maxLength': 512} for k in ('from', 'to', 'cc', 'subject', 'text_query')},
        **{k: {'type': 'string', 'format': 'date-time'} for k in ('date_from', 'date_to')},
        'is_read': {'type': 'boolean'}, 'has_attachments': {'type': 'boolean'},
    }, 'additionalProperties': False,
}
FIELDS = {
    'type': 'object', 'properties': {
        **{k: {'type': 'array', 'maxItems': 100, 'items': {'type': 'string', 'maxLength': 512}} for k in ('to', 'cc', 'bcc', 'reply_to')},
        'subject': {'type': 'string', 'maxLength': 998},
        'text_body': {'type': 'string', 'maxLength': 250000},
    }, 'additionalProperties': False,
}
MAIL_INTENT_TOOL = {'type': 'function', 'name': 'mail_conversation',
    'description': 'Classify the current genuine human mail request. The backend owns mailbox, folder, references, order and drafts. Never pass identities or consent. Ordinals and scopes are resolved from the original audio transcript by the host.',
    'parameters': {'type': 'object', 'properties': {
        'intent': {'type': 'string', 'enum': list(INTENTS)},
        'account_hint': {'type': 'string', 'enum': ['reception', 'operations', 'all']},
        'folder_path_hint': {'type': 'string', 'maxLength': 512},
        'folder_role_hint': {'type': 'string', 'enum': ROLES},
        'filters': FILTERS, 'fields': FIELDS,
        'destination_role': {'type': 'string', 'enum': ROLES},
        'destination_path': {'type': 'string', 'maxLength': 512},
        'read_results': {'type': 'boolean'},
        'list_limit': {'type': 'integer', 'minimum': 1, 'maximum': 10000},
    }, 'required': ['intent'], 'additionalProperties': False}}
