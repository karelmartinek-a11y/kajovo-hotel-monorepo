import { initialSnapshot, callActive, type VoiceSnapshot, type RealtimeSessionProvider, type VoiceTelemetrySink, type VoiceToolExecutor } from './contracts.js';
import { transition, type RealtimeEvent, type RealtimeToolItem } from './state.js';

export interface VoiceRuntimeEnvironment {
  getUserMedia(): Promise<MediaStream>; createPeer(): RTCPeerConnection;
  createAudio(): HTMLAudioElement; createContext(): AudioContext;
}
const browserEnvironment: VoiceRuntimeEnvironment = {
  getUserMedia: () => navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: false}),
  createPeer: () => new RTCPeerConnection(), createAudio: () => new Audio(),
  createContext: () => new AudioContext(),
};
const RECONNECT_DELAYS = [1000, 3000];
const CONNECT_TIMEOUT = 30000;

export class VoiceRealtimeClient {
  private snapshot: VoiceSnapshot = {...initialSnapshot};
  private subscribers = new Set<() => void>();
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];
  private input: AnalyserNode | null = null;
  private output: AnalyserNode | null = null;
  private abort: AbortController | null = null;
  private epoch = 0;
  private frame: number | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private seen = new Set<string>();
  private lifecycleCleanup: (() => void) | null = null;
  private toolCalls = new Set<string>();
  private toolQueue: Promise<void> = Promise.resolve();

  constructor(private provider: RealtimeSessionProvider, private telemetry: VoiceTelemetrySink,
              private environment: VoiceRuntimeEnvironment = browserEnvironment,
              private toolExecutor?: VoiceToolExecutor) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {this.subscribers.add(listener); return () => {this.subscribers.delete(listener);};};
  private set(patch: Partial<VoiceSnapshot>) {this.snapshot = {...this.snapshot, ...patch}; this.subscribers.forEach(listener => listener());}
  private fail(category: string) {
    this.epoch++; this.cleanup(); this.detachLifecycle();
    this.set({state: 'error', error: {category}, inputLevel: 0, outputLevel: 0, muted: false});
    this.telemetry.emit('session.error', {category});
  }
  private attachLifecycle() {
    if (typeof window === 'undefined') return;
    const offline = () => this.reconnect();
    const pagehide = () => {void this.stop();};
    const visible = () => {if (document.visibilityState === 'visible' && this.context?.state === 'suspended') this.fail('audio_interrupted');};
    window.addEventListener('offline', offline); window.addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', visible);
    this.lifecycleCleanup = () => {window.removeEventListener('offline', offline); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', visible);};
  }
  private detachLifecycle() {this.lifecycleCleanup?.(); this.lifecycleCleanup = null;}

  async start() {
    if (callActive(this.snapshot.state)) return;
    const epoch = ++this.epoch; this.retries = 0;
    this.set({...initialSnapshot, state: 'requesting-permission'});
    this.attachLifecycle();
    try {
      // Resume from the click gesture before awaiting permissions or networking.
      this.context = this.environment.createContext();
      await this.context.resume();
      if (epoch !== this.epoch) return;
      const stream = await this.environment.getUserMedia();
      if (epoch !== this.epoch) {stream.getTracks().forEach(track => track.stop()); return;}
      this.stream = stream;
      stream.getAudioTracks().forEach(track => {track.onended = () => this.fail('microphone_interrupted');});
      await this.connect(epoch);
    } catch (error) {
      if (epoch !== this.epoch) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(name === 'NotAllowedError' ? 'microphone_denied' : name === 'NotFoundError' || name === 'NotReadableError' ? 'microphone_unavailable' : this.category(error, 'connection_failed'));
    }
  }
  private category(error: unknown, fallback: string) {
    return typeof error === 'object' && error !== null && 'category' in error && typeof error.category === 'string' ? error.category : fallback;
  }
  private async connect(epoch: number) {
    if (!this.stream || epoch !== this.epoch) return;
    this.cleanupConnection(); this.seen.clear(); this.toolCalls.clear(); this.toolQueue = Promise.resolve();
    const peer = this.environment.createPeer(); this.peer = peer;
    const audio = this.environment.createAudio(); this.audio = audio; audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.onerror = () => {if (peer === this.peer) this.fail('playback_failed');};
    this.abort = new AbortController();
    this.set({state: this.retries ? 'reconnecting' : 'connecting'});
    this.timeout = setTimeout(() => {if (peer === this.peer) this.fail('connection_timeout');}, CONNECT_TIMEOUT);
    this.stream.getTracks().forEach(track => peer.addTrack(track, this.stream!));
    const channel = peer.createDataChannel('oai-events'); this.channel = channel;
    channel.onmessage = event => {if (epoch === this.epoch && peer === this.peer) this.handle(event.data);};
    channel.onerror = () => {if (peer === this.peer) this.reconnect();};
    channel.onclose = () => {if (peer === this.peer) this.reconnect();};
    peer.onconnectionstatechange = () => {
      if (peer !== this.peer) return;
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') this.reconnect();
      if (peer.connectionState === 'closed') this.fail('session_ended');
    };
    peer.ontrack = event => {
      if (peer !== this.peer) return;
      const output = event.streams[0] ?? new MediaStream([event.track]); audio.srcObject = output;
      this.meters(output);
      void audio.play().catch(() => {if (peer === this.peer) this.fail('playback_failed');});
    };
    const offer = await peer.createOffer();
    if (epoch !== this.epoch || peer !== this.peer) return;
    await peer.setLocalDescription(offer);
    const answer = await this.provider.create(offer.sdp!, this.abort.signal);
    if (epoch !== this.epoch || peer !== this.peer) return;
    this.set({model: answer.model});
    await peer.setRemoteDescription({type: 'answer', sdp: answer.sdp});
  }
  private handle(raw: string) {
    let event: RealtimeEvent;
    try {event = JSON.parse(raw);} catch {return;}
    if (!event || typeof event.type !== 'string') return;
    if (event.event_id) {
      if (this.seen.has(event.event_id)) return;
      this.seen.add(event.event_id); if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    }
    if (event.type === 'error' || (event.type === 'response.done' && event.response?.status === 'failed')) {this.fail('realtime_error'); return;}
    if (event.item?.type === 'mcp_call' || (event.item?.type === 'function_call' &&
        (!this.toolExecutor || !event.item.name || !this.toolExecutor.names.includes(event.item.name)))) {this.fail('unsupported_capability'); return;}
    // Only a completed response can dispatch an action; cancelled generation cannot.
    if (event.type === 'response.done' && event.response?.status === 'completed') {
      for (const item of event.response.output ?? []) if (item.type === 'function_call') this.dispatchTool(item);
    }
    if (event.type === 'session.created') {
      if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
      this.telemetry.emit('session.connected', {model: this.snapshot.model ?? ''});
    }
    this.set({state: transition(this.snapshot.state, event)});
  }
  private dispatchTool(item: RealtimeToolItem) {
    const executor = this.toolExecutor;
    if (!executor || !item.name || !executor.names.includes(item.name)) {this.fail('unsupported_capability'); return;}
    if (!item.call_id || typeof item.arguments !== 'string' || item.arguments.length > 16384) {this.fail('invalid_tool_call'); return;}
    if (this.toolCalls.has(item.call_id)) return;
    if (this.toolCalls.size >= 256) {this.fail('tool_call_limit'); return;}
    this.toolCalls.add(item.call_id);
    const epoch = this.epoch, channel = this.channel, signal = this.abort?.signal;
    const name = item.name, callId = item.call_id, argumentsText = item.arguments;
    this.toolQueue = this.toolQueue.then(async () => {
      if (epoch !== this.epoch || channel !== this.channel || !signal || signal.aborted) return;
      let result: unknown;
      try {result = await executor.execute(name, callId, JSON.parse(argumentsText), signal);}
      catch {result = {status: 'unknown', code: 'tool_call_unverified'};}
      if (epoch !== this.epoch || channel !== this.channel || signal.aborted || channel?.readyState !== 'open') return;
      channel.send(JSON.stringify({type: 'conversation.item.create', item: {type: 'function_call_output', call_id: callId, output: JSON.stringify(result)}}));
      if (this.snapshot.state !== 'user-speaking') channel.send(JSON.stringify({type: 'response.create'}));
    }).catch(() => {if (epoch === this.epoch && channel === this.channel) this.fail('tool_delivery_failed');});
  }
  private meters(remote: MediaStream) {
    if (!this.context || !this.stream) return;
    try {
      this.sources.forEach(source => source.disconnect()); this.sources = [];
      this.input?.disconnect(); this.output?.disconnect();
      this.input = this.context.createAnalyser(); this.output = this.context.createAnalyser();
      for (const [stream, meter] of [[this.stream, this.input], [remote, this.output]] as const) {
        meter.fftSize = 256; const source = this.context.createMediaStreamSource(stream); source.connect(meter); this.sources.push(source);
      }
      const level = (meter: AnalyserNode | null) => {
        if (!meter) return 0; const data = new Uint8Array(meter.fftSize); meter.getByteTimeDomainData(data);
        return Math.min(1, Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length) * 4);
      };
      const tick = () => {if (!this.context || !callActive(this.snapshot.state)) return;
        this.set({inputLevel: this.snapshot.muted ? 0 : level(this.input), outputLevel: level(this.output)});
        this.frame = requestAnimationFrame(tick);
      };
      if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(tick);
    } catch { /* Metering is optional; transport and playback remain authoritative. */ }
  }
  private reconnect() {
    if (!callActive(this.snapshot.state) || this.snapshot.state === 'disconnecting' || this.reconnectTimer) return;
    if (!this.stream?.getAudioTracks().some(track => track.readyState === 'live')) {this.fail('microphone_interrupted'); return;}
    if (this.retries >= RECONNECT_DELAYS.length) {this.fail('network_lost'); return;}
    this.cleanupConnection(); const epoch = ++this.epoch;
    this.set({state: 'reconnecting', inputLevel: 0, outputLevel: 0});
    const delay = RECONNECT_DELAYS[this.retries++];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (epoch !== this.epoch) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {this.reconnect(); return;}
      void this.connect(epoch).catch(error => {
        if (epoch !== this.epoch) return;
        const category = this.category(error, 'connection_failed');
        if (category === 'connection_failed' || category === 'provider_unavailable') this.reconnect(); else this.fail(category);
      });
    }, delay);
  }
  setMuted(muted: boolean) {if (!this.stream) return; this.stream.getAudioTracks().forEach(track => {track.enabled = !muted;}); this.set({muted});}
  async stop() {
    if (!callActive(this.snapshot.state) || this.snapshot.state === 'disconnecting') return;
    ++this.epoch; this.set({state: 'disconnecting'}); this.cleanup(); this.detachLifecycle();
    this.set({state: 'disconnected', muted: false, error: null, inputLevel: 0, outputLevel: 0});
    this.telemetry.emit('session.ended', {});
  }
  private cleanupConnection() {
    this.abort?.abort(); this.abort = null;
    if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
    if (this.frame !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.frame); this.frame = null;
    const channel = this.channel; this.channel = null;
    if (channel) {channel.onmessage = null; channel.onerror = null; channel.onclose = null; channel.close();}
    const peer = this.peer; this.peer = null;
    if (peer) {peer.ontrack = null; peer.onconnectionstatechange = null; peer.close();}
    if (this.audio) {this.audio.onerror = null; this.audio.pause(); this.audio.srcObject = null; this.audio.removeAttribute('src'); this.audio.load(); this.audio = null;}
    this.sources.forEach(source => source.disconnect()); this.sources = []; this.input?.disconnect(); this.output?.disconnect(); this.input = this.output = null;
  }
  private cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    this.cleanupConnection(); this.seen.clear();
    this.stream?.getTracks().forEach(track => {track.onended = null; track.stop();}); this.stream = null;
    if (this.context) {void this.context.close().catch(() => {}); this.context = null;}
  }
  dispose() {void this.stop(); this.subscribers.clear();}
}
