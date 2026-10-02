import { initialSnapshot, callActive, type VoiceSnapshot, type RealtimeSessionProvider, type VoiceTelemetrySink } from './contracts.js';
import { transition, type RealtimeEvent } from './state.js';

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
  private sessionId: string | null = null;
  private managedFunctions = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private provider: RealtimeSessionProvider, private telemetry: VoiceTelemetrySink,
              private environment: VoiceRuntimeEnvironment = browserEnvironment) {}
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
    this.cleanupConnection(); this.seen.clear();
    const peer = this.environment.createPeer(); this.peer = peer;
    const audio = this.environment.createAudio(); this.audio = audio; audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.onerror = () => {if (peer === this.peer) this.fail('playback_failed');};
    this.abort = new AbortController();
    this.set({state: this.retries ? 'reconnecting' : 'connecting'});
    this.timeout = setTimeout(() => {if (peer === this.peer) this.fail('connection_timeout');}, this.provider.connectionTimeoutMs ?? CONNECT_TIMEOUT);
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
    if (epoch !== this.epoch || peer !== this.peer) {if (answer.session_id) void this.provider.close?.(answer.session_id).catch(() => {}); return;}
    this.sessionId = answer.session_id ?? null;
    this.managedFunctions = new Set(answer.managed_functions ?? []);
    this.set({model: answer.model, capabilityStatus: answer.technologies});
    if (answer.technologies === 'connecting' && this.provider.heartbeat) this.stream?.getAudioTracks().forEach(track => {track.enabled = false;});
    await peer.setRemoteDescription({type: 'answer', sdp: answer.sdp});
    if (this.sessionId && this.provider.heartbeat) void this.heartbeat(epoch, peer);
  }
  private async heartbeat(epoch: number, peer: RTCPeerConnection) {
    if (!this.sessionId || !this.provider.heartbeat || !this.abort || epoch !== this.epoch || peer !== this.peer) return;
    try {
      const status = await this.provider.heartbeat(this.sessionId, this.abort.signal);
      if (epoch !== this.epoch || peer !== this.peer) return;
      this.set({capabilityStatus: status.technologies});
      if (status.renew) {this.reconnect(); return;}
      if (status.closed) {this.fail('session_ended'); return;}
      if (status.technologies === 'waiting') this.stream?.getAudioTracks().forEach(track => {track.enabled = false;});
      if (!['connecting', 'waiting'].includes(status.technologies)) {
        this.stream?.getAudioTracks().forEach(track => {track.enabled = !this.snapshot.muted;});
        if (this.snapshot.state === 'connecting' || this.snapshot.state === 'reconnecting') this.set({state: 'listening'});
        if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
      }
    } catch (error) {
      if (epoch !== this.epoch || peer !== this.peer) return;
      const category = this.category(error, 'request_failed');
      if (category === 'unauthorized') {this.fail(category); return;}
      this.reconnect(); return;
    }
    this.heartbeatTimer = setTimeout(() => {this.heartbeatTimer = null; void this.heartbeat(epoch, peer);}, ['connecting', 'waiting'].includes(this.snapshot.capabilityStatus ?? '') ? 1000 : 15000);
  }
  private handle(raw: string) {
    let event: RealtimeEvent;
    try {event = JSON.parse(raw);} catch {return;}
    if (!event || typeof event.type !== 'string') return;
    if (event.event_id) {
      if (this.seen.has(event.event_id)) return;
      this.seen.add(event.event_id); if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    }
    const failure = event.error?.code ?? event.response?.status_details?.error?.code;
    if (this.managedFunctions.size && ['context_length_exceeded', 'input_too_large'].includes(failure ?? '')) {this.reconnect(); return;}
    if (event.type === 'response.done' && event.response?.status === 'failed' && this.managedFunctions.size && failure === 'rate_limit_exceeded') {
      this.stream?.getAudioTracks().forEach(track => {track.enabled = false;}); this.set({capabilityStatus: 'waiting', state: 'assistant-processing'}); return;
    }
    if (event.type === 'error' || (event.type === 'response.done' && event.response?.status === 'failed')) {this.fail('realtime_error'); return;}
    if (event.item?.type === 'mcp_call' || (event.item?.type === 'function_call' && !this.managedFunctions.has(event.item.name ?? ''))) {this.fail('unsupported_capability'); return;}
    if (event.type === 'session.created') {
      if (this.snapshot.capabilityStatus === 'connecting' && this.provider.heartbeat) return;
      if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
      this.telemetry.emit('session.connected', {model: this.snapshot.model ?? ''});
    }
    this.set({state: transition(this.snapshot.state, event)});
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
  setMuted(muted: boolean) {if (!this.stream) return; this.stream.getAudioTracks().forEach(track => {track.enabled = !muted && !['connecting', 'waiting'].includes(this.snapshot.capabilityStatus ?? '');}); this.set({muted});}
  async stop() {
    if (!callActive(this.snapshot.state) || this.snapshot.state === 'disconnecting') return;
    ++this.epoch; this.set({state: 'disconnecting'}); this.cleanup(); this.detachLifecycle();
    this.set({state: 'disconnected', muted: false, error: null, inputLevel: 0, outputLevel: 0});
    this.telemetry.emit('session.ended', {});
  }
  private cleanupConnection() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer); this.heartbeatTimer = null;
    const sessionId = this.sessionId; this.sessionId = null; this.managedFunctions.clear();
    if (sessionId) void this.provider.close?.(sessionId).catch(() => {});
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
