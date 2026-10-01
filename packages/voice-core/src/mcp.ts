import type {McpStatus, McpApproval} from './contracts.js';
import type {RealtimeEvent} from './state.js';

type Turn = {items: Set<string>; done: boolean; followed: boolean; cancelled: boolean};
// Each response owns its calls. Completion can precede or follow response.done.
export class McpLifecycle {
  private turns = new Map<string, Turn>();
  private complete = new Set<string>();
  private approvalQueue: McpApproval[] = [];
  private approvals = new Set<string>();
  reset() {this.turns.clear(); this.complete.clear(); this.approvalQueue = []; this.approvals.clear();}
  handle(event: RealtimeEvent): {status?: McpStatus; tools?: string[]; approval?: McpApproval; followup?: boolean} {
    const result: {status?: McpStatus; tools?: string[]; approval?: McpApproval; followup?: boolean} = {};
    if (event.type === 'mcp_list_tools.in_progress') result.status = 'loading';
    if (event.type === 'mcp_list_tools.failed') result.status = 'unavailable';
    if (event.item?.type === 'mcp_list_tools' && event.type === 'conversation.item.done') {
      result.tools = (event.item.tools ?? []).map(tool => tool.name);
      result.status = event.item.error || result.tools.length === 0 ? 'unavailable' : 'ready';
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      for (const turn of this.turns.values()) if (!turn.followed) turn.cancelled = true;
    }
    const responseId = event.response_id ?? event.response?.id;
    const itemId = event.item_id ?? event.item?.id;
    if (responseId && (event.item?.type === 'mcp_call' || event.type.startsWith('response.mcp_call'))) {
      const turn = this.turn(responseId);
      if (itemId) {turn.items.add(itemId); }
    }
    if (itemId && ((event.type === 'response.output_item.done' && event.item?.type === 'mcp_call') || event.type === 'response.mcp_call.failed')) this.complete.add(itemId);
    if (event.item?.type === 'mcp_approval_request' && event.item.id && !this.approvals.has(event.item.id)) {
      this.approvals.add(event.item.id);
      const approval = {id: event.item.id, name: event.item.name ?? 'action'};
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
