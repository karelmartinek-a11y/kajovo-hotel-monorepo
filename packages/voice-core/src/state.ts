import type { VoiceSessionState } from './contracts.js';
export type RealtimeEvent = {type: string; event_id?: string; response_id?: string; error?: {code?: string; event_id?: string}; response?: {id?: string; status?: string; status_details?: {error?: {code?: string}}}; item?: {type?: string; name?: string}};

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
