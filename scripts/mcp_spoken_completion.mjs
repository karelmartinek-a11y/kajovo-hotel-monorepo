// Bind live search results to their parent or a newly created follow-up response.
export class SpokenCompletion {
  constructor() {this.turns = new Map(); this.playing = null; this.search = null;}
  turn(id) {
    if (!this.turns.has(id)) this.turns.set(id, {transcript: '', search: null, completed: false, stopped: false, blocked: false, peak: 0});
    return this.turns.get(id);
  }
  handle(event) {
    const id = event.response_id || event.response?.id;
    if (!id) return;
    const existed = this.turns.has(id);
    const turn = this.turn(id);
    if (event.type === 'response.output_item.done' && event.item?.type === 'mcp_call' && event.item.name === 'search_devices') {
      this.search = null;
      if (event.item.error || turn.blocked) return;
      try {
        const args = JSON.parse(event.item.arguments);
        let output = JSON.parse(event.item.output);
        if (Array.isArray(output)) output = JSON.parse(output.find(value => value.type === 'text').text);
        if (output?.content) output = JSON.parse(output.content.find(value => value.type === 'text').text);
        if (output?.structuredContent) output = output.structuredContent;
        if (args.name !== 'recepce' || args.query || args.location || output?.status !== 'ok' || !Array.isArray(output.devices) || !output.devices.length || !output.devices.every(device => typeof device.name === 'string' && device.name.trim())) return;
        this.search = {parent: id, names: output.devices.map(device => device.name)};
        turn.search = this.search;
        // Only samples after the result can prove grounded output playback.
        turn.peak = 0;
        turn.transcript = '';
      } catch {return;}
    }
    if (event.type === 'response.created' && !existed && this.search && id !== this.search.parent && !turn.blocked) {
      turn.search = this.search;
    }
    if (event.type === 'response.output_audio_transcript.done') turn.transcript += event.transcript || '';
    if (event.type === 'response.done') {
      turn.completed = event.response?.status === 'completed';
      turn.blocked ||= !turn.completed;
      if (turn.blocked && this.search?.parent === id) this.search = null;
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
    if (this.playing) {const turn = this.turn(this.playing); if (turn.search) turn.peak = Math.max(turn.peak, peak);}
  }
  ready(devices) {
    const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
    return devices.length > 0 && [...this.turns.values()].some(turn => turn.search && turn.search === this.search && turn.completed && turn.stopped && !turn.blocked && turn.peak > 1 && devices.length === turn.search.names.length && devices.every(device => turn.search.names.includes(device.name)) && turn.search.names.every(name => normalize(turn.transcript).includes(normalize(name))));
  }
}
