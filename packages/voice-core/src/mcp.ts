import type {McpStatus, McpApproval} from './contracts.js';
import type {RealtimeEvent} from './state.js';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const sensitive = (name: string) => /token|secret|password|passphrase|authorization|authentication|credential|apikey|accesskey|privatekey|signingkey|cookie|sessionid|catalogversion|^auth$|^bearer$/i.test(name.replace(/[^a-z0-9]/gi, ''));

// Approval uses the imported tool contract, never a guessed host action contract.
// Unsupported schema constraints fail closed rather than silently weakening validation.
function matchesSchema(value: unknown, schema: unknown, depth = 0): boolean {
  if (!record(schema) || depth > 8) return false;
  const supported = ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'minLength', 'maxLength', 'minimum', 'maximum'];
  if (Object.keys(schema).some(key => !supported.includes(key))) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) return false;
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  switch (schema.type) {
    case 'object': {
      const properties = schema.properties;
      if (!record(value) || !record(properties) || !Array.isArray(schema.required) || !schema.required.every(key => typeof key === 'string' && Object.prototype.hasOwnProperty.call(properties, key) && Object.prototype.hasOwnProperty.call(value, key))) return false;
      return Object.entries(value).every(([key, entry]) => Object.prototype.hasOwnProperty.call(properties, key)
        ? matchesSchema(entry, properties[key], depth + 1)
        : schema.additionalProperties === true);
    }
    case 'array': return Array.isArray(value) && value.length <= 64 && value.every(entry => matchesSchema(entry, schema.items, depth + 1));
    case 'string': return typeof value === 'string' && value.trim().length > 0 && (typeof schema.minLength !== 'number' || value.length >= schema.minLength) && (typeof schema.maxLength !== 'number' || value.length <= schema.maxLength);
    case 'integer': if (typeof value !== 'number' || !Number.isInteger(value)) return false; break;
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value)) return false; break;
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
  return (typeof schema.minimum !== 'number' || (value as number) >= schema.minimum) && (typeof schema.maximum !== 'number' || (value as number) <= schema.maximum);
}
function approvalContext(id: string, name: unknown, raw: unknown, schema: unknown): McpApproval {
  const approval: McpApproval = {id, name: record(schema) && typeof name === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(name) ? name : 'action', details: [], canApprove: false};
  if (approval.name !== name || typeof raw !== 'string' || raw.length > 16384) return approval;
  let args: unknown;
  try {args = JSON.parse(raw);} catch {return approval;}
  if (!record(args) || !matchesSchema(args, schema)) return approval;
  let complete = true;
  const hiddenValues: string[] = [];
  const collectHidden = (value: unknown, hidden = false) => {
    if (record(value)) for (const [key, entry] of Object.entries(value)) collectHidden(entry, hidden || sensitive(key));
    else if (Array.isArray(value)) value.forEach(entry => collectHidden(entry, hidden));
    else if (hidden && typeof value === 'string' && value) hiddenValues.push(value);
  };
  collectHidden(args);
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 8 || approval.details.length >= 64) {complete = false; return;}
    if (record(value)) {
      for (const [key, entry] of Object.entries(value)) {
        if (sensitive(key)) continue;
        if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(key)) {complete = false; continue;}
        visit(entry, path ? `${path}.${key}` : key, depth + 1);
      }
    } else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`, depth + 1));
    else {
      const display = String(value);
      if (display.length > 512 || /[\u0000-\u001f\u007f]/.test(display) || hiddenValues.some(secret => display.includes(secret))) {complete = false; return;}
      approval.details.push({label: path, value: display});
    }
  };
  visit(args, '', 0);
  approval.canApprove = complete && approval.details.length > 0;
  if (!approval.canApprove) approval.details = [];
  return approval;
}

type Turn = {items: Set<string>; done: boolean; followed: boolean; cancelled: boolean};
// Each response owns its calls. Completion can precede or follow response.done.
export class McpLifecycle {
  private turns = new Map<string, Turn>();
  private complete = new Set<string>();
  private approvalQueue: McpApproval[] = [];
  private approvals = new Set<string>();
  private schemas = new Map<string, unknown>();
  reset() {this.turns.clear(); this.complete.clear(); this.approvalQueue = []; this.approvals.clear(); this.schemas.clear();}
  handle(event: RealtimeEvent): {status?: McpStatus; tools?: string[]; approval?: McpApproval; followup?: boolean} {
    const result: {status?: McpStatus; tools?: string[]; approval?: McpApproval; followup?: boolean} = {};
    if (event.type === 'mcp_list_tools.in_progress') result.status = 'loading';
    if (event.type === 'mcp_list_tools.failed') result.status = 'unavailable';
    if (event.item?.type === 'mcp_list_tools' && event.type === 'conversation.item.done') {
      result.tools = (event.item.tools ?? []).map(tool => tool.name);
      this.schemas.clear();
      if (!event.item.error) for (const tool of event.item.tools ?? []) this.schemas.set(tool.name, tool.input_schema);
      result.status = event.item.error || result.tools.length === 0 ? 'unavailable' : 'ready';
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      for (const turn of this.turns.values()) if (!turn.followed) turn.cancelled = true;
    }
    const responseId = event.response_id ?? event.response?.id;
    const itemId = event.item_id ?? event.item?.id;
    // Register response creation before any delayed tool events so interruption
    // permanently cancels that response even if its first call arrives later.
    if (event.type === 'response.created' && responseId) this.turn(responseId);
    if (responseId && (event.item?.type === 'mcp_call' || event.type.startsWith('response.mcp_call'))) {
      const turn = this.turn(responseId);
      if (itemId) {turn.items.add(itemId); }
    }
    if (itemId && ((event.type === 'response.output_item.done' && event.item?.type === 'mcp_call') || event.type === 'response.mcp_call.failed')) this.complete.add(itemId);
    if (event.item?.type === 'mcp_approval_request' && event.item.id && !this.approvals.has(event.item.id)) {
      this.approvals.add(event.item.id);
      const approval = approvalContext(event.item.id, event.item.name, event.item.arguments, this.schemas.get(event.item.name ?? ''));
      this.approvalQueue.push(approval);
      if (this.approvalQueue.length === 1) result.approval = approval;
    }
    if (event.type === 'response.done' && responseId) {
      const turn = this.turn(responseId); turn.done = true;
      if (event.response?.status !== 'completed') turn.cancelled = true;
      for (const item of event.response?.output ?? []) if (item.type === 'mcp_call' && item.id) {
        turn.items.add(item.id);
      }
    }
    for (const turn of this.turns.values()) {
      if (turn.done && turn.items.size > 0 && !turn.followed && !turn.cancelled && [...turn.items].every(id => this.complete.has(id))) {
        turn.followed = true; result.followup = true;
      }
    }
    return result;
  }
  resolveApproval(id: string): McpApproval | null {
    this.approvalQueue = this.approvalQueue.filter(request => request.id !== id);
    return this.approvalQueue[0] ?? null;
  }
  private turn(id: string) {
    let turn = this.turns.get(id);
    if (!turn) {turn = {items: new Set(), done: false, followed: false, cancelled: false}; this.turns.set(id, turn);}
    return turn;
  }
}
