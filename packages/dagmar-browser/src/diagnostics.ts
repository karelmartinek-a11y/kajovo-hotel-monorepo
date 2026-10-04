import type {VoiceTelemetrySink} from '@voice-core/browser';

export type DebugState = 'off' | 'starting' | 'recording' | 'degraded' | 'stopping' | 'failed';
export type DiagnosticSnapshot = {state: DebugState; error: string | null; droppedBytes: number; callId: string | null};
export type Segment = {segment_id: string; generation: number};
export type Transport = (path: string, method?: string, body?: unknown, signal?: AbortSignal, headers?: Record<string,string>) => Promise<any>;
const MAX_PART = 1024 * 1024, MAX_QUEUE = 8 * MAX_PART;
const now = () => performance.now();
const identifier = () => crypto.randomUUID().replaceAll('-', '');
export const debugLabels: Record<DebugState,string> = {off:'Debug je vypnutý.', starting:'Zapínám debug…', recording:'DEBUG — ukládám obsah a zvuk hovoru.', degraded:'DEBUG — záznam je neúplný.', stopping:'Debug je vypnutý, doukládám zachycené části…', failed:'Záznam debug selhal. Hlasové spojení má vlastní stav.'};

export class DiagnosticClient implements VoiceTelemetrySink {
  private snapshot: DiagnosticSnapshot = {state:'off', error:null, droppedBytes:0, callId:null};
  private subscribers = new Set<() => void>();
  private sequence = 0;
  private token = 0;
  private connectionId: string | null = null;
  private callPromise: Promise<string | null> | null = null;
  private segment: Segment | null = null;
  private wanted = false;
  private tracks = new Map<'microphone'|'remote',MediaStream>();
  private recorders: {recorder:MediaRecorder; stopped:Promise<void>}[] = [];
  private captureTasks = new Set<Promise<void>>();
  private queuedBytes = 0;
  private uploading = 0;
  private uploadWaiters: (()=>void)[] = [];
  private intent = 0;
  private starting: Promise<void> | null = null;
  private pending = new Set<Promise<void>>();
  private events: unknown[] = [];
  private eventFlush: Promise<void> | null = null;
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private recordingStart = 0;
  private offBoundary: number | null = null;
  private finish: Promise<void> | null = null;
  private ending: Promise<void> | null = null;
  private controller = new AbortController();
  constructor(private request: Transport, private recorderClass: typeof MediaRecorder | undefined = globalThis.MediaRecorder) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener:()=>void) => {this.subscribers.add(listener); return ()=>{this.subscribers.delete(listener);};};
  private set(patch:Partial<DiagnosticSnapshot>) {this.snapshot={...this.snapshot,...patch}; this.subscribers.forEach(fn=>fn());}
  private failure(error: unknown) {
    const code = typeof error === 'object' && error !== null && 'category' in error ? String(error.category) : 'collection_failed';
    this.set({state:this.wanted ? 'degraded' : 'failed',error:code});
    if (code === 'unauthorized' || code.startsWith('capacity_') || code === 'generation_invalid' || code === 'call_not_found') {
      this.wanted=false; this.offBoundary=now(); this.stopRecorders(); this.controller.abort();
    }
  }
  async startCall() {if(this.ending) await this.ending; await this.begin();}
  finishCall(): Promise<void> {
    if(!this.ending) this.ending=this.end().finally(()=>{this.ending=null;});
    return this.ending;
  }
  begin(): Promise<string|null> {
    if (this.callPromise) return this.callPromise;
    const token=++this.token;
    this.controller = new AbortController();
    this.sequence=0; this.wanted=false; this.segment=null; this.events=[]; this.connectionId=null;
    this.set({state:'off',error:null,droppedBytes:0,callId:null});
    this.callPromise=this.request('/diagnostics/calls','POST',undefined,AbortSignal.timeout(1500)).then(value=>{
      if(token!==this.token) return null;
      this.set({callId:value.logical_call_id}); return value.logical_call_id as string;
    }).catch(()=>null);
    return this.callPromise;
  }
  async bind(connectionId:string) {
    await this.begin(); this.connectionId=connectionId;
    this.emit('connection.bound', {connection_state:'connected'});
    if(this.wanted && !this.segment) await this.enable();
  }
  emit(event_type:string, attributes:Record<string,unknown>, correlation:Record<string,unknown>={}) {
    if(event_type==='call.start') {void this.begin(); return;}
    if(event_type==='call.end') {void this.end(); return;}
    if(event_type==='connection.close') {void this.reconnect(); return;}
    const event={schema_version:1,event_id:identifier(),source:'browser',sequence:++this.sequence,timestamp:new Date().toISOString(),monotonic_ms:now(),event_type,connection_id:this.connectionId,attributes,...correlation};
    if(this.events.length>=128) {this.set({droppedBytes:this.snapshot.droppedBytes+JSON.stringify(event).length}); return;}
    this.events.push(event);
    if(!this.eventTimer) this.eventTimer=setTimeout(()=>{this.eventTimer=null; void this.flushEvents();},500);
  }
  provider(event: Record<string,any>) {
    const attributes:Record<string,unknown>={status:event.response?.status,code:event.error?.code};
    this.emit('provider.'+event.type, attributes, {provider_event_id:event.event_id,response_id:event.response_id ?? event.response?.id,item_id:event.item_id ?? event.item?.id,function_id:event.call_id ?? event.item?.call_id});
    // Provider usage is accounted by backend only. The browser is a correlated observer.
  }
  media(source:'microphone'|'remote',stream:MediaStream) {
    if(this.tracks.get(source)===stream) return;
    this.tracks.set(source,stream);
    for(const track of stream.getAudioTracks()) {
      this.emit('audio.track', {source_id:source,track_id:track.id,settings:track.getSettings?.() ?? {},constraints:track.getConstraints?.() ?? {},enabled:track.enabled,muted:track.muted,ended:track.readyState==='ended'});
      track.addEventListener?.('mute',()=>this.emit('audio.track.mute',{source_id:source,track_id:track.id}));
      track.addEventListener?.('unmute',()=>this.emit('audio.track.unmute',{source_id:source,track_id:track.id}));
    }
    if(source==='remote' && this.snapshot.error==='remote_track_unavailable') this.set({state:'recording',error:null});
    if(this.segment && this.wanted && this.snapshot.state!=='stopping') this.record(source,stream,this.segment);
  }
  async flushEvents() {
    if(this.eventFlush) return this.eventFlush;
    this.eventFlush=(async()=>{
      const call=await this.begin(); if(!call) {this.events=[];return;}
      // The queue is bounded; drain in order, including events already captured before Stop.
      while(this.events.length) {
        const events=this.events.splice(0,32);
        try {await this.request(`/diagnostics/calls/${call}/events`,'POST',{events},AbortSignal.any([this.controller.signal,AbortSignal.timeout(2000)]));}
        catch(error) {this.failure(error); return;}
      }
    })().finally(()=>{this.eventFlush=null;});
    return this.eventFlush;
  }
  toggle() {this.intent++; this.wanted=!this.wanted; return this.wanted ? this.enable() : this.disable();}
  private enable(): Promise<void> {
    if(this.starting) return this.starting.then(()=>this.wanted && !this.segment ? this.enable() : undefined);
    this.starting=this.startRecording().finally(()=>{this.starting=null;});
    return this.starting;
  }
  private async startRecording() {
    const intent=this.intent;
    if(this.finish) await this.finish;
    if(!this.wanted || this.segment) return;
    const token=this.token;
    this.set({state:'starting',error:null});
    const call=await this.begin();
    if(!call) {this.wanted=false; this.set({state:'failed',error:'diagnostics_unavailable'}); return;}
    try {
      const segment:Segment=await this.request(`/diagnostics/calls/${call}/segments`,'POST',{capture_ms:now()},this.controller.signal);
      if(token!==this.token || intent!==this.intent || !this.wanted) {
        await this.request(`/diagnostics/calls/${call}/segments/${segment.segment_id}/stop`,'POST',{capture_ms:now(),complete:true}); return;
      }
      this.segment=segment; this.recordingStart=now(); this.offBoundary=null;
      this.set({state:'recording'});
      for(const [source,stream] of this.tracks) this.record(source,stream,segment);
      if(!this.tracks.has('remote')) this.set({state:'degraded',error:'remote_track_unavailable'});
    } catch(error) {this.wanted=false; this.failure(error);}
  }
  private record(source:'microphone'|'remote', stream:MediaStream, segment:Segment) {
    const Recorder=this.recorderClass;
    if(!Recorder) {this.set({state:'degraded',error:'recorder_unsupported'}); return;}
    // Existing tracks only. Never stop the shared capture/playback tracks.
    const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(value=>Recorder.isTypeSupported?.(value));
    if(!mime) {this.set({state:'degraded',error:'mime_unsupported'}); return;}
    try {
      const recorder=new Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
      let sequence=0,previous=now(); const call=this.snapshot.callId!, token=this.token;
      let resolve!:()=>void;
      const stopped=new Promise<void>(done=>{resolve=done;});
      recorder.onstop=()=>resolve();
      recorder.onerror=()=>{this.set({state:'degraded',error:'recorder_failed'});resolve();};
      recorder.ondataavailable=event=>{
        if(!event.data.size || token!==this.token) return;
        const end=this.offBoundary ?? now(), start=previous; previous=end;
        const task=(async()=>{
          for(let offset=0;offset<event.data.size;offset+=MAX_PART) {
            const body=event.data.slice(offset,offset+MAX_PART);
            const info={...segment,track_id:stream.getAudioTracks()[0]?.id ?? 'unknown',source_id:source,mime:recorder.mimeType,sequence:sequence++,capture_start_ms:start,capture_end_ms:end,final:recorder.state==='inactive',boundary_partial:this.offBoundary!==null};
            this.enqueue(call,identifier(),body,info);
          }
        })();
        this.captureTasks.add(task); void task.finally(()=>this.captureTasks.delete(task));
      };
      recorder.start(1000); this.recorders.push({recorder,stopped});
    } catch {this.set({state:'degraded',error:'recorder_failed'});}
  }
  private enqueue(call:string,id:string,body:Blob,info:Record<string,unknown>) {
    if(this.queuedBytes+body.size>MAX_QUEUE) {
      this.set({state:'degraded',error:'upload_backpressure',droppedBytes:this.snapshot.droppedBytes+body.size});
      this.emit('debug.upload.dropped',{dropped_bytes:body.size,reason:'backpressure'});return;
    }
    this.queuedBytes+=body.size;
    const signal=this.controller.signal;
    const task=(async()=>{
      let success=false;
      try {
        // Limit concurrent uploads without retaining an unbounded call in RAM.
        if(this.uploading>=2) await new Promise<void>(done=>this.uploadWaiters.push(done));
        this.uploading++;
        for(let attempt=0;attempt<3 && !signal.aborted;attempt++) {
          try {await this.request(`/diagnostics/calls/${call}/chunks/${id}`,'PUT',body,signal,{'x-dagmar-chunk':JSON.stringify(info)});success=true;break;}
          catch(error) {if(attempt===2) this.failure(error); else await new Promise(done=>setTimeout(done,250*(attempt+1)));}
        }
      } finally {
        this.uploading--; this.uploadWaiters.shift()?.();
        this.queuedBytes-=body.size;
        if(!success) this.set({droppedBytes:this.snapshot.droppedBytes+body.size});
      }
    })();
    this.pending.add(task); void task.finally(()=>this.pending.delete(task));
  }
  private stopRecorders() {
    const recorders=this.recorders.splice(0);
    for(const {recorder} of recorders) if(recorder.state!=='inactive') recorder.stop();
    return recorders.map(value=>value.stopped);
  }
  private disable():Promise<void> {
    if(this.finish) return this.finish;
    this.offBoundary=now();
    const segment=this.segment,call=this.snapshot.callId,boundary=this.offBoundary;
    this.segment=null;
    const stopped=this.stopRecorders();
    if(!segment || !call) {this.set({state:'off'});return Promise.resolve();}
    this.set({state:'stopping'});
    this.finish=(async()=>{
      try {
        await this.request(`/diagnostics/calls/${call}/segments/${segment.segment_id}/stop`,'POST',{capture_ms:boundary,complete:false},this.controller.signal);
        await Promise.race([Promise.all(stopped),new Promise((_,reject)=>setTimeout(()=>reject({category:'recorder_final_missing'}),3000))]);
        await Promise.all(this.captureTasks);
        await Promise.race([Promise.all(this.pending),new Promise((_,reject)=>setTimeout(()=>reject({category:'flush_incomplete'}),8000))]);
        if(this.snapshot.droppedBytes || this.snapshot.error) throw {category:this.snapshot.error ?? 'dropped_bytes'};
        await this.request(`/diagnostics/calls/${call}/segments/${segment.segment_id}/stop`,'POST',{capture_ms:boundary,complete:true},this.controller.signal);
        this.set({state:'off'});
      } catch(error) {this.failure(error);}
      finally {this.finish=null;}
    })();
    return this.finish;
  }
  private async reconnect() {
    const wanted=this.wanted,intent=this.intent; await this.disable(); if(intent===this.intent) this.wanted=wanted;
    this.tracks.delete('remote'); this.connectionId=null;
    this.emit('debug.connection.gap',{reason:'reconnect'});
  }
  async end() {
    this.wanted=false; this.intent++;
    if(this.starting) await this.starting;
    await this.disable(); await this.flushEvents();
    const call=this.snapshot.callId;
    if(call) {try {await this.request(`/diagnostics/calls/${call}/close`,'POST');}catch {this.set({state:'failed',error:'missing_final'});}}
    this.controller.abort();this.token++;this.callPromise=null;this.connectionId=null;this.tracks.clear();
    if(this.eventTimer) clearTimeout(this.eventTimer);this.eventTimer=null;this.events=[];
  }
}
