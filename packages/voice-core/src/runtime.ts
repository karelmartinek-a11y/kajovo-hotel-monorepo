import { initialSnapshot, callActive, type VoiceSnapshot, type RealtimeSessionProvider } from './contracts.js';
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
  private remoteTrack: MediaStreamTrack | null = null;
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
  private managedMcpServers = new Set<string>();
  private mcpItems = new Map<string,string>();
  private mcpPending = new Set<string>();
  private mcpCompleted = new Set<string>();
  private mcpOutputs = new Set<string>();
  private connectionState = '';
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private playback = new Set<string>();

  constructor(private provider: RealtimeSessionProvider, private environment: VoiceRuntimeEnvironment = browserEnvironment) {

  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {this.subscribers.add(listener); return () => {this.subscribers.delete(listener);};};
  private set(patch: Partial<VoiceSnapshot>) {this.snapshot = {...this.snapshot, ...patch}; this.subscribers.forEach(listener => listener());}
  private fail(category: string) {

    this.epoch++; this.cleanup(); this.detachLifecycle();
    this.set({state: 'error', error: {category}, inputLevel: 0, outputLevel: 0, muted: false});
    void this.provider.endCall?.();
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
    this.provider.beginCall?.();

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
  private playbackNotified = new Set<string>();
  private async notifyPlaybackReady(peer: RTCPeerConnection) {
    const id = this.sessionId;
    if (peer !== this.peer || !id || this.channel?.readyState !== 'open' || !this.audio?.srcObject || this.audio.paused || this.context?.state !== 'running' || this.playbackNotified.has(id)) return;
    this.playbackNotified.add(id);
    if (this.playbackNotified.size > 16) this.playbackNotified.delete(this.playbackNotified.values().next().value!);
    try {await this.provider.playbackReady?.(id);} catch { /* The existing session remains usable; never replay an uncertain greeting. */ }
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
    audio.onplay = () => {if(peer!==this.peer)return;void this.notifyPlaybackReady(peer);};
    audio.onerror = () => {if (peer === this.peer) this.fail('playback_failed');};
    this.abort = new AbortController();
    this.set({state: this.retries ? 'reconnecting' : 'connecting'});
    this.timeout = setTimeout(() => {if (peer === this.peer) this.fail('connection_timeout');}, this.provider.connectionTimeoutMs ?? CONNECT_TIMEOUT);
    this.stream.getTracks().forEach(track => peer.addTrack(track, this.stream!));
    const channel = peer.createDataChannel('oai-events'); this.channel = channel;
    channel.onopen = () => {void this.notifyPlaybackReady(peer);};
    channel.onmessage = event => {if (epoch === this.epoch && peer === this.peer) this.handle(event.data);};
    channel.onerror = () => {if (peer === this.peer) this.reconnect();};
    channel.onclose = () => {if (peer === this.peer) this.reconnect();};
    peer.onconnectionstatechange = () => {
      if (peer !== this.peer) return;
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {this.reconnect(); return;}
      if (peer.connectionState === 'closed') this.fail('session_ended');
    };
    peer.ontrack = event => {
      if (peer !== this.peer) return;
      // Duplicate notifications must not restart rendering.
      if (event.track === this.remoteTrack) return;
      this.remoteTrack = event.track;
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
    this.managedMcpServers = new Set(answer.managed_mcp_servers ?? []);
    this.set({managedMcpStatus: answer.managed_mcp_status});
    this.connectionState = answer.connection_state ?? answer.technologies ?? '';
    this.set({model: answer.model, capabilityStatus: answer.technologies});
    if ((answer.connection_state ?? answer.technologies) === 'connecting' && this.provider.heartbeat) this.stream?.getAudioTracks().forEach(track => {track.enabled = false;});
    await peer.setRemoteDescription({type: 'answer', sdp: answer.sdp});
    if (this.sessionId && this.provider.heartbeat) void this.heartbeat(epoch, peer);
    void this.notifyPlaybackReady(peer);
  }
  private async heartbeat(epoch: number, peer: RTCPeerConnection) {
    if (!this.sessionId || !this.provider.heartbeat || !this.abort || epoch !== this.epoch || peer !== this.peer) return;
    let nextDelay = 15000;
    try {
      const status = await this.provider.heartbeat(this.sessionId, this.abort.signal);
      if (epoch !== this.epoch || peer !== this.peer) return;
      this.connectionState = status.connection_state ?? status.technologies;
      this.set({capabilityStatus: status.technologies});
      if (status.managed_mcp_status) this.set({managedMcpStatus: status.managed_mcp_status});
      nextDelay = ['connecting', 'waiting'].includes(status.connection_state ?? status.technologies) ? 1000 : 15000;
      if (status.renew) {this.reconnect(); return;}
      if (status.closed) {this.fail('session_ended'); return;}
      if ((status.connection_state ?? status.technologies) === 'waiting') this.stream?.getAudioTracks().forEach(track => {track.enabled = false;});
      if (!['connecting', 'waiting'].includes(status.connection_state ?? status.technologies)) {
        this.syncMicrophone();
        if (this.snapshot.state === 'connecting' || this.snapshot.state === 'reconnecting') this.set({state: 'listening'});
        this.syncMicrophone();
        if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
      }
    } catch (error) {
      if (epoch !== this.epoch || peer !== this.peer) return;
      const category = this.category(error, 'request_failed');
      if (category === 'unauthorized') {this.fail(category); return;}
      this.reconnect(); return;
    }
    this.heartbeatTimer = setTimeout(() => {this.heartbeatTimer = null; void this.heartbeat(epoch, peer);}, nextDelay);
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
      this.connectionState = 'waiting';
      this.stream?.getAudioTracks().forEach(track => {track.enabled = false;}); this.set({capabilityStatus: 'waiting', state: 'assistant-processing'}); return;
    }
    const responseFailure=event.type==='response.done' && event.response?.status==='failed';
    if(event.type==='error' || responseFailure) {
      const recoverable=['conversation_already_has_active_response','response_cancel_not_active','input_audio_buffer_commit_empty'].includes(failure ?? '');
      if(recoverable) return; // No retry, replay or blanket cancel of the native turn.
      this.fail('realtime_error'); return;
    }
    if (event.item?.type?.startsWith('mcp_')) {
      const label = event.item.server_label ?? (event.item.approval_request_id ? this.mcpItems.get(event.item.approval_request_id) : undefined);
      if (!label || !this.managedMcpServers.has(label)) {this.fail('unsupported_capability'); return;}
      if (event.item.id) this.mcpItems.set(event.item.id,label);
      if (event.item.id && event.item.type === 'mcp_call' && event.type.endsWith('.added')) this.mcpPending.add(event.item.id);
      if (event.item.id && event.item.type === 'mcp_call' && event.type.endsWith('.done')) {
        this.mcpOutputs.add(event.item.id);
        if (this.mcpCompleted.has(event.item.id)) this.mcpPending.delete(event.item.id);
      }
      this.set({managedMcpStatus: {...this.snapshot.managedMcpStatus,[label]:event.item.type === 'mcp_approval_request' ? 'awaiting_approval' : event.item.type === 'mcp_call' ? (this.mcpPending.size ? 'working' : 'ready') : event.item.type === 'mcp_approval_response' ? 'working' : event.type.endsWith('.done') ? 'ready' : 'loading'}});
    }
    if (event.type.startsWith('response.mcp_call.') && event.item_id) {
      const label = this.mcpItems.get(event.item_id);
      if (label && this.managedMcpServers.has(label)) {
        if (event.type.endsWith('.in_progress')) this.mcpPending.add(event.item_id);
        if (event.type.endsWith('.completed') || event.type.endsWith('.failed')) {
          this.mcpCompleted.add(event.item_id);
          if (this.mcpOutputs.has(event.item_id)) this.mcpPending.delete(event.item_id);
        }
        this.set({managedMcpStatus: {...this.snapshot.managedMcpStatus,[label]:this.mcpPending.size ? 'working' : 'ready'}});
      }
    }
    if (event.item?.type === 'function_call' && !this.managedFunctions.has(event.item.name ?? '')) {this.fail('unsupported_capability'); return;}
    if (event.type === 'session.created') {
      if (this.connectionState === 'connecting' && this.provider.heartbeat) return;
      if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
    }
    this.set({state: transition(this.snapshot.state, event)});
    this.syncMicrophone();
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
  private syncMicrophone() {
    this.stream?.getAudioTracks().forEach(track => {const enabled = !this.snapshot.muted && !['connecting', 'waiting'].includes(this.connectionState) && !['reconnecting', 'disconnecting', 'error'].includes(this.snapshot.state); track.enabled=enabled;});
  }
  setMuted(muted: boolean) {if (!this.stream) return; this.set({muted}); this.syncMicrophone();}
  async stop() {
    if (!callActive(this.snapshot.state) || this.snapshot.state === 'disconnecting') return;
    ++this.epoch; this.set({state: 'disconnecting'});this.cleanup();this.detachLifecycle();
    void this.provider.endCall?.();
    this.set({state: 'disconnected', muted: false, error: null, inputLevel: 0, outputLevel: 0});


  }
  private cleanupConnection() {
    this.playback.clear();
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer); this.heartbeatTimer = null;
    const sessionId = this.sessionId; this.sessionId = null; this.managedFunctions.clear();
    this.managedMcpServers.clear(); this.mcpItems.clear(); this.mcpPending.clear();
    this.mcpCompleted.clear(); this.mcpOutputs.clear();
    if (sessionId) void this.provider.close?.(sessionId).catch(() => {});
    this.abort?.abort(); this.abort = null;
    if (this.timeout) clearTimeout(this.timeout); this.timeout = null;
    if (this.frame !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.frame); this.frame = null;
    const channel = this.channel; this.channel = null;
    if (channel) {channel.onmessage = null; channel.onerror = null; channel.onclose = null; channel.close();}
    const peer = this.peer; this.peer = null;
    this.remoteTrack = null;
    if (peer) {peer.ontrack = null; peer.onconnectionstatechange = null; peer.close();}
    if (this.audio) {this.audio.onplay=null;this.audio.onpause=null;this.audio.onended=null;this.audio.onerror = null; this.audio.pause(); this.audio.srcObject = null; this.audio.removeAttribute('src'); this.audio.load(); this.audio = null;}
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
