// Correlate generated speech, completed response and RTP playback for one turn.
export class SpokenCompletion {
  constructor() {this.turns = new Map(); this.playing = null; this.searchCompleted = false;}
  turn(id) {
    if (!this.turns.has(id)) this.turns.set(id, {transcript: '', grounded: false, completed: false, stopped: false, blocked: false, peak: 0});
    return this.turns.get(id);
  }
  handle(event) {
    const id = event.response_id || event.response?.id;
    if (event.type === 'response.output_item.done' && event.item?.type === 'mcp_call' && event.item.name === 'search_devices' && !event.item.error) this.searchCompleted = true;
    if (!id) return;
    const turn = this.turn(id);
    if (event.type === 'response.output_audio_transcript.done') {
      turn.transcript += event.transcript || '';
      turn.grounded = this.searchCompleted;
    }
    if (event.type === 'response.done') {
      turn.completed = event.response?.status === 'completed';
      turn.blocked ||= !turn.completed;
    }
    if (event.type === 'output_audio_buffer.started') this.playing = id;
    if (event.type === 'output_audio_buffer.stopped') {
      turn.stopped = true;
      if (this.playing === id) this.playing = null;
    }
    if (event.type === 'output_audio_buffer.cleared') {
      turn.blocked = true;
      if (this.playing === id) this.playing = null;
    }
  }
  sample(peak) {
    if (this.playing) {const turn = this.turn(this.playing); turn.peak = Math.max(turn.peak, peak);}
  }
  ready(devices) {
    const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
    return devices.length > 0 && [...this.turns.values()].some(turn => turn.grounded && turn.completed && turn.stopped && !turn.blocked && turn.peak > 1 && devices.every(device => normalize(turn.transcript).includes(normalize(device.name))));
  }
}
