import type {DagmarRequest} from './ports.js';

type Call = {id: Promise<string> | null; closed: boolean; closing: Promise<void> | null};

/** One owner-authorized logical call spans all provider reconnects. */
export class LogicalCallClient {
  private current: Call | null = null;
  constructor(private request: DagmarRequest) {}
  start() {this.current = {id: null, closed: false, closing: null};}
  identity(signal: AbortSignal): Promise<string> {
    const call = this.current;
    if (!call || call.closed) return Promise.reject({category: 'session_ended'});
    if (!call.id) call.id = this.request<{logical_call_id: string}>('/calls', 'POST', undefined, signal).then(async value => {
      if (call.closed) {await this.close(call, value.logical_call_id); throw {category: 'session_ended'};}
      return value.logical_call_id;
    });
    return call.id;
  }
  private close(call: Call, id: string): Promise<void> {
    if (!call.closing) call.closing = this.request(`/calls/${encodeURIComponent(id)}/close`, 'POST').then(() => undefined);
    return call.closing;
  }
  async end(): Promise<void> {
    const call = this.current;
    this.current = null;
    if (!call || call.closed) return;
    call.closed = true;
    if (call.id) {
      try {await this.close(call, await call.id);} catch { /* Lease/session revocation also bounds a lost close response; never replay a write. */ }
    }
  }
}
