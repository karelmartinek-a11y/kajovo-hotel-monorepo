import type { VoiceSessionState } from './contracts.js';
export type RealtimeToolItem = {id?: string; type?: string; name?: string; tools?: {name: string}[]; error?: unknown; call_id?: string; arguments?: string};
export type RealtimeEvent = {type: string; session?: {tools?: {type: string; allowed_tools?: string[]}[]}; event_id?: string; item_id?: string; response_id?: string; name?: string; call_id?: string; arguments?: string; response?: {id?: string; status?: string; output?: RealtimeToolItem[]}; item?: RealtimeToolItem};

// Audio buffer events, rather than generation completion, determine audible playback.
export function transition(state: VoiceSessionState, event: RealtimeEvent): VoiceSessionState {
  if (['idle', 'disconnected', 'disconnecting', 'error'].includes(state)) return state;
  switch (event.type) {
    case 'session.created': return state === 'connecting' || state === 'reconnecting' ? 'listening' : state;
    case 'input_audio_buffer.speech_started': return 'user-speaking';
    case 'input_audio_buffer.speech_stopped': return state === 'user-speaking' ? 'assistant-processing' : state;
    case 'response.created': return state === 'user-speaking' ? state : 'assistant-processing';
    case 'output_audio_buffer.started': return state === 'user-speaking' ? state : 'assistant-speaking';
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared': return state === 'user-speaking' ? state : 'listening';
    case 'response.done': return state === 'assistant-processing' && event.response?.status === 'cancelled' ? 'listening' : state;
    default: return state;
  }
}
