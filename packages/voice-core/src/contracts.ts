export type VoiceSessionState = 'idle' | 'requesting-permission' | 'connecting' | 'listening' | 'user-speaking' | 'assistant-processing' | 'assistant-speaking' | 'reconnecting' | 'disconnecting' | 'disconnected' | 'error';
export type VoiceError = { category: string };
export type VoiceCoreConfig = {
  model_mode: 'automatic' | 'manual'; manual_model: string | null;
  response_length: 'short' | 'medium' | 'long'; language_mode: 'automatic' | 'manual';
  manual_language: string | null; voice: string;
};
export type VoiceCatalog = {models: string[]; voices: string[]; languages: {id: string; label: string}[]};
export type VoiceConfigSnapshot = VoiceCoreConfig & {revision: number; configured: boolean; catalog: VoiceCatalog};
export type RealtimeSessionAnswer = {sdp: string; model: string; session_id?: string | null; managed_functions?: string[]; connection_state?: string; technologies?: string};
export type RealtimeSessionStatus = {connection_state?: string; technologies: string; renew: boolean; closed: boolean};
export interface RealtimeSessionProvider {
  create(sdp: string, signal: AbortSignal): Promise<RealtimeSessionAnswer>;
  heartbeat?(sessionId: string, signal: AbortSignal): Promise<RealtimeSessionStatus>;
  close?(sessionId: string): Promise<void>;
  connectionTimeoutMs?: number;
  disclosure?: string;
  capabilityLabels?: Record<string, string>;
  speakerEchoProtection?: boolean;
}
export interface VoiceConfigStore {
  read(): Promise<VoiceConfigSnapshot>;
  save(config: VoiceCoreConfig, revision: number): Promise<VoiceConfigSnapshot>;
}
export interface VoiceSecretStore {
  save(key: string): Promise<VoiceConfigSnapshot>; delete(): Promise<VoiceConfigSnapshot>;
}
export interface VoiceAuthProvider { authorized(): Promise<boolean> }
export interface VoiceTelemetrySink { emit(event: string, attributes: Record<string, unknown>): void; media?(source: 'microphone' | 'remote', stream: MediaStream): void; provider?(event: Record<string, unknown>): void; startCall?(): Promise<void>; finishCall?(): Promise<void> }
export interface CapabilityContract {name: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>}
export interface CapabilityProvider {contracts(): readonly CapabilityContract[]}
export const capabilityRegistry: readonly CapabilityContract[] = Object.freeze([]);
export type VoiceSnapshot = {state: VoiceSessionState; muted: boolean; inputLevel: number; outputLevel: number; model: string | null; error: VoiceError | null; capabilityStatus?: string; speakerEchoProtection?: boolean; playbackBlocked?: boolean};
export const initialSnapshot: VoiceSnapshot = {state: 'idle', muted: false, inputLevel: 0, outputLevel: 0, model: null, error: null};
export const callActive = (state: VoiceSessionState) => !['idle', 'disconnected', 'error'].includes(state);
