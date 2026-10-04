import type {VoiceTelemetrySink} from '@voice-core/browser';

export type DebugState = 'off' | 'starting' | 'recording' | 'degraded' | 'stopping' | 'failed';
export type DiagnosticSnapshot = {state: DebugState; error: string | null; droppedBytes: number; callId: string | null; missingEvents:number; pending:number; lagMs:number};
export type Segment = {segment_id: string; generation: number};
export type Transport = (path: string, method?: string, body?: unknown, signal?: AbortSignal, headers?: Record<string,string>) => Promise<any>;
const MAX_PART = 1024 * 1024, MAX_QUEUE = 8 * MAX_PART;
const now = () => performance.now();
const audioSettings=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([key])=>['echoCancellation','noiseSuppression','autoGainControl','sampleRate','sampleSize','channelCount','latency','volume','restrictOwnAudio','suppressLocalAudioPlayback'].includes(key)));
const identifier = () => crypto.randomUUID().replaceAll('-', '');
export const debugLabels: Record<DebugState,string> = {off:'Debug je vypnutý.', starting:'Zapínám debug…', recording:'DEBUG — ukládám obsah a zvuk hovoru.', degraded:'DEBUG — záznam je neúplný.', stopping:'Debug je vypnutý, doukládám zachycené části…', failed:'Záznam debug selhal. Hlasové spojení má vlastní stav.'};

export class DiagnosticClient implements VoiceTelemetrySink {
  private snapshot: DiagnosticSnapshot = {state:'off', error:null, droppedBytes:0, callId:null,missingEvents:0,pending:0,lagMs:0};
  private subscribers = new Set<() => void>();
  private routingCleanup:(()=>void)|null=null;
  private sequence = 0;
  private active = false;
  private closing = false;
  private connectionEpoch = 0;
  private delta: any = null;
  private missingEvents = 0;
  private lateEvents = 0;
  private segmentController: AbortController | null = null;
  private token = 0;
  private connectionId: string | null = null;
  private callPromise: Promise<string | null> | null = null;
  private segment: Segment | null = null;
  private wanted = false;
  private tracks = new Map<'microphone'|'remote',MediaStream>();
  private recorders: {recorder:MediaRecorder; stopped:Promise<void>; boundary:number|null; source:string}[] = [];
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
  private request:Transport;
  constructor(request:Transport, private recorderClass:typeof MediaRecorder|undefined=globalThis.MediaRecorder) {
    // Independent deadlines also bound injected transports that ignore AbortSignal.
    this.request=(path,method,body,signal,headers)=>new Promise((resolve,reject)=>{
      let timer:ReturnType<typeof setTimeout>;
      const failed=()=>{clearTimeout(timer);reject({category:'collection_timeout'});};
      if(signal?.aborted){failed();return;}
      signal?.addEventListener('abort',failed,{once:true});
      timer=setTimeout(failed,path.includes('/chunks/')?3000:2000);
      Promise.resolve(request(path,method,body,signal,headers)).then(resolve,reject).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',failed);});
    });
  }
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
  async startCall() {if(this.ending) await this.ending; if(this.active)return; this.active=true;this.closing=false;this.missingEvents=0;this.lateEvents=0; await this.begin();
    if(typeof navigator!=='undefined' && navigator.mediaDevices?.addEventListener) {
      const changed=()=>{if(this.active&&!this.closing)for(const [source,stream] of this.tracks)for(const track of stream.getAudioTracks())this.emit('audio.routing.changed',{source_id:source,track_id:track.id,settings:audioSettings(track.getSettings?.() as Record<string,unknown> ?? {}),reason:'devicechange_route_not_inferred'});};
      navigator.mediaDevices.addEventListener('devicechange',changed);this.routingCleanup=()=>navigator.mediaDevices.removeEventListener('devicechange',changed);
    }
  }
  prepareStop() {this.closing=true;this.wanted=false;this.intent++;void this.disable();}
  observeStatus(value:any) {
    if(!value)return;
    this.set({pending:value.pending ?? 0,lagMs:value.lag_ms ?? 0,missingEvents:Math.max(this.missingEvents,value.missing_events ?? 0)});
    if(!value.complete || value.missing_events || value.code) this.set({error:value.code ?? 'server_metadata_incomplete',droppedBytes:Math.max(this.snapshot.droppedBytes,value.dropped_bytes ?? 0)});
  }
  finishCall(): Promise<void> {
    this.prepareStop();
    if(this.snapshot.callId) void this.request(`/calls/${this.snapshot.callId}/close`,'POST').catch(()=>{});
    if(!this.ending) this.ending=this.end().finally(()=>{this.ending=null;});
    return this.ending;
  }
  begin(): Promise<string|null> {
    if (this.callPromise) return this.callPromise;
    if(!this.active)return Promise.resolve(null);
    const token=++this.token;
    this.controller = new AbortController();
    this.sequence=0; this.delta=null; this.wanted=false; this.segment=null; this.events=[]; this.connectionId=null;
    this.set({state:'off',error:null,droppedBytes:0,callId:null,missingEvents:0,pending:0,lagMs:0});
    this.callPromise=this.request('/calls','POST',undefined,AbortSignal.timeout(1500)).then(value=>{
      if(token!==this.token) return null;
      this.set({callId:value.logical_call_id}); return value.logical_call_id as string;
    }).catch(()=>{this.failure({category:'collection_unavailable'}); return null;});
    return this.callPromise;
  }
  async bind(connectionId:string) {
    if(!this.active || this.closing)return;
    const epoch=++this.connectionEpoch;
    await this.begin(); if(epoch!==this.connectionEpoch || this.closing)return;this.connectionId=connectionId;
    this.emit('connection.bound', {connection_state:'connected'});
    if(this.wanted && !this.segment) await this.enable();
  }
  private flushDelta() {if(this.delta){this.queueEvent(this.delta);this.delta=null;}}
  private queueEvent(event:any) {
    if(this.events.length>=128) {this.missingEvents+=event.attributes.count ?? 1;this.set({error:'metadata_backpressure',missingEvents:this.missingEvents,droppedBytes:this.snapshot.droppedBytes+JSON.stringify(event).length});return;}
    this.events.push(event);
    if(!this.eventTimer)this.eventTimer=setTimeout(()=>{this.eventTimer=null;this.flushDelta();void this.flushEvents();},250);
  }
  emit(event_type:string, attributes:Record<string,unknown>, correlation:Record<string,unknown>={}) {
    if(!this.active){this.lateEvents++;return;}
    if(event_type==='call.start') return;
    if(event_type==='call.end') {void this.finishCall();return;}
    if(event_type==='connection.close') {if(!this.closing)void this.reconnect();return;}
    const event={schema_version:1,event_id:identifier(),source:'browser',sequence:++this.sequence,timestamp:new Date().toISOString(),monotonic_ms:now(),event_type,connection_id:this.connectionId,attributes:{...attributes},...correlation};
    if(event_type.endsWith('.delta')) {
      if(this.delta && (this.delta.event_type!==event_type || this.delta.response_id!==correlation.response_id || event.monotonic_ms-this.delta.monotonic_ms>250 || this.delta.attributes.count>=64))this.flushDelta();
      if(this.delta){this.delta.attributes.count++;this.delta.attributes.sequence_end=this.sequence;this.delta.attributes.last_monotonic_ms=event.monotonic_ms;if(correlation.provider_event_id)this.delta.attributes.provider_event_ids.push(correlation.provider_event_id);}
      else {this.delta={...event,attributes:{...attributes,count:1,sequence_end:this.sequence,last_monotonic_ms:event.monotonic_ms,provider_event_ids:correlation.provider_event_id?[correlation.provider_event_id]:[]}};}
      if(!this.eventTimer)this.eventTimer=setTimeout(()=>{this.eventTimer=null;this.flushDelta();void this.flushEvents();},250);
      return;
    }
    this.flushDelta();this.queueEvent(event);
  }
  provider(event: Record<string,any>) {
    const attributes:Record<string,unknown>={status:event.response?.status,code:event.error?.code,...(event.type==='response.done'?{usage:event.response?.usage}:{} )};
    this.emit('provider.'+event.type, attributes, {provider_event_id:event.event_id,response_id:event.response_id ?? event.response?.id,item_id:event.item_id ?? event.item?.id,function_id:event.call_id ?? event.item?.call_id});
    // Backend deduplicates browser observations and authoritative sideband usage by response ID.
  }
  media(source:'microphone'|'remote',stream:MediaStream) {
    if(!this.active || this.closing || this.tracks.get(source)===stream) return;
    const lifetime=this.token,epoch=this.connectionEpoch;
    for(const entry of this.recorders.filter(e=>e.source===source)){entry.boundary=now();if(entry.recorder.state!=='inactive')entry.recorder.stop();}
    this.tracks.set(source,stream);
    for(const track of stream.getAudioTracks()) {
      this.emit('audio.track', {source_id:source,track_id:track.id,settings:audioSettings(track.getSettings?.() as Record<string,unknown> ?? {}),constraints:audioSettings(track.getConstraints?.() as Record<string,unknown> ?? {}),enabled:track.enabled,muted:track.muted,ended:track.readyState==='ended'});
      track.addEventListener?.('ended',()=>{if(lifetime===this.token && (source==='microphone'||epoch===this.connectionEpoch))this.emit('audio.track.ended',{source_id:source,track_id:track.id,ended:true});});
      track.addEventListener?.('mute',()=>{if(lifetime===this.token && (source==='microphone'||epoch===this.connectionEpoch))this.emit('audio.track.mute',{source_id:source,track_id:track.id});});
      track.addEventListener?.('unmute',()=>{if(lifetime===this.token && (source==='microphone'||epoch===this.connectionEpoch))this.emit('audio.track.unmute',{source_id:source,track_id:track.id});});
    }
    if(source==='remote' && this.snapshot.error==='remote_track_unavailable') this.set({state:'recording',error:null});
    if(this.segment && this.wanted && this.snapshot.state!=='stopping') this.record(source,stream,this.segment);
  }
  async flushEvents() {
    if(this.eventFlush) return this.eventFlush;
    this.eventFlush=(async()=>{
      const call=await this.callPromise; if(!call) {this.events=[];return;}
      // The queue is bounded; drain in order, including events already captured before Stop.
      while(this.events.length) {
        const events=this.events.splice(0,32);
        try {await this.request(`/diagnostics/calls/${call}/events`,'POST',{events},AbortSignal.any([this.controller.signal,AbortSignal.timeout(2000)]));}
        catch(error) {this.missingEvents+=events.reduce((sum:number,e:any)=>sum+(e.attributes.count ?? 1),0);this.failure(error); return;}
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
      this.segment=segment; this.segmentController=new AbortController();this.recordingStart=now(); this.offBoundary=null;
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
      const entry={recorder,stopped,boundary:null as number|null,source};
      const recordingId=identifier(),signal=this.segmentController!.signal;
      recorder.onstop=()=>resolve();
      recorder.onerror=()=>{this.set({state:'degraded',error:'recorder_failed'});resolve();};
      recorder.ondataavailable=event=>{
        if(!event.data.size || token!==this.token || signal.aborted) return;
        const end=entry.boundary ?? now(), start=previous; previous=end;
        const task=(async()=>{
          for(let offset=0;offset<event.data.size;offset+=MAX_PART) {
            const body=event.data.slice(offset,offset+MAX_PART);
            const info={...segment,recording_id:recordingId,track_id:stream.getAudioTracks()[0]?.id ?? 'unknown',source_id:source,mime:recorder.mimeType,sequence:sequence++,capture_start_ms:start,capture_end_ms:end,final:recorder.state==='inactive' && offset+MAX_PART>=event.data.size,boundary_partial:entry.boundary!==null};
            this.enqueue(call,identifier(),body,info,signal,token);
          }
        })();
        this.captureTasks.add(task); void task.finally(()=>this.captureTasks.delete(task));
      };
      recorder.start(1000); this.recorders.push(entry);
    } catch {this.set({state:'degraded',error:'recorder_failed'});}
  }
  private enqueue(call:string,id:string,body:Blob,info:Record<string,unknown>,signal:AbortSignal,token:number) {
    if(this.queuedBytes+body.size>MAX_QUEUE) {
      this.set({state:'degraded',error:'upload_backpressure',droppedBytes:this.snapshot.droppedBytes+body.size});
      this.emit('debug.upload.dropped',{dropped_bytes:body.size,reason:'backpressure'});return;
    }
    this.queuedBytes+=body.size;

    const task=(async()=>{
      let success=false,acquired=false;
      try {
        // Limit concurrent uploads without retaining an unbounded call in RAM.
        if(this.uploading>=2) await new Promise<void>(done=>{
          const resume=()=>{signal.removeEventListener('abort',resume);const index=this.uploadWaiters.indexOf(resume);if(index>=0)this.uploadWaiters.splice(index,1);done();};
          this.uploadWaiters.push(resume);signal.addEventListener('abort',resume,{once:true});if(signal.aborted)resume();
        });
        if(signal.aborted)return;
        this.uploading++;acquired=true;
        for(let attempt=0;attempt<3 && !signal.aborted;attempt++) {
          try {await this.request(`/diagnostics/calls/${call}/chunks/${id}`,'PUT',body,AbortSignal.any([signal,AbortSignal.timeout(3000)]),{'x-dagmar-chunk':JSON.stringify(info)});success=true;break;}
          catch(error) {if(attempt===2 && token===this.token) this.failure(error); else await new Promise(done=>setTimeout(done,250*(attempt+1)));}
        }
      } finally {
        if(acquired)this.uploading--; this.uploadWaiters.shift()?.();
        this.queuedBytes-=body.size;
        if(!success && token===this.token) this.set({droppedBytes:this.snapshot.droppedBytes+body.size});
      }
    })();
    this.pending.add(task); void task.finally(()=>this.pending.delete(task));
  }
  private stopRecorders() {
    const recorders=this.recorders.splice(0);
    for(const entry of recorders) {entry.boundary=this.offBoundary ?? now();if(entry.recorder.state!=='inactive'){entry.recorder.requestData?.();entry.recorder.stop();}}
    return recorders.map(value=>value.stopped);
  }
  private disable():Promise<void> {
    if(this.finish) return this.finish;
    this.offBoundary=now();
    const segment=this.segment,call=this.snapshot.callId,boundary=this.offBoundary,captureController=this.segmentController;
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
      } catch(error) {captureController?.abort();this.failure(error);}
      finally {captureController?.abort();this.finish=null;}
    })();
    return this.finish;
  }
  private async reconnect() {
    const epoch=++this.connectionEpoch,wanted=this.wanted,intent=this.intent;
    // Cleanup only the old epoch, BEFORE awaiting recorder/network drain.
    this.tracks.delete('remote');this.connectionId=null;
    await this.disable();if(epoch!==this.connectionEpoch)return;
    if(intent===this.intent)this.wanted=wanted;
    this.emit('debug.connection.gap',{reason:'reconnect'});
  }
  async end() {
    this.wanted=false; this.intent++; this.active=false;this.flushDelta();
    if(this.starting) await this.starting;
    await this.disable();
    let deadline:ReturnType<typeof setTimeout>|undefined;
    const timeout=new Promise<void>(resolve=>{deadline=setTimeout(()=>{if(this.eventFlush || this.events.length){this.missingEvents+=this.events.reduce((sum:number,e:any)=>sum+(e.attributes.count ?? 1),0);this.controller.abort();this.set({error:'metadata_flush_incomplete',missingEvents:this.missingEvents});}resolve();},2500);});
    try {await Promise.race([this.flushEvents(),timeout]);} finally {clearTimeout(deadline);}
    const call=this.snapshot.callId;
    if(call) {try {
      await this.request(`/calls/${call}/close`,'POST',undefined,AbortSignal.timeout(2000));
      await this.request(`/diagnostics/calls/${call}/final`,'POST',{source:'browser',sequence:this.sequence,count:this.sequence,dropped_bytes:this.snapshot.droppedBytes,missing_events:this.missingEvents,complete:!this.snapshot.error&&!this.snapshot.droppedBytes&&!this.missingEvents&&!this.pending.size,code:this.snapshot.error,pending:this.pending.size},AbortSignal.timeout(2000));
      await this.request(`/diagnostics/calls/${call}/close`,'POST');}catch {this.set({state:'failed',error:'missing_final'});}}
    this.routingCleanup?.();this.routingCleanup=null;
    this.controller.abort();this.token++;this.callPromise=null;this.connectionId=null;this.tracks.clear();
    if(this.eventTimer) clearTimeout(this.eventTimer);this.eventTimer=null;this.events=[];
  }
}
