export type VoiceSessionState = 'idle' | 'requesting-permission' | 'connecting' | 'listening' | 'user-speaking' | 'assistant-processing' | 'assistant-speaking' | 'reconnecting' | 'disconnecting' | 'disconnected' | 'error';
export type VoiceError = { category: string };
export type VoiceCoreConfig = {
  model_mode: 'automatic' | 'manual'; manual_model: string | null;
  response_length: 'short' | 'medium' | 'long'; language_mode: 'automatic' | 'manual';
  manual_language: string | null; voice: string;
};
export type VoiceCatalog = {models: string[]; voices: string[]; languages: {id: string; label: string}[]};
export type VoiceConfigSnapshot = VoiceCoreConfig & {revision: number; configured: boolean; catalog: VoiceCatalog};
export interface RealtimeSessionProvider { create(sdp: string, signal: AbortSignal): Promise<{sdp: string; model: string}> }
export interface VoiceConfigStore {
  read(): Promise<VoiceConfigSnapshot>;
  save(config: VoiceCoreConfig, revision: number): Promise<VoiceConfigSnapshot>;
}
export interface VoiceSecretStore {
  save(key: string): Promise<VoiceConfigSnapshot>; delete(): Promise<VoiceConfigSnapshot>;
}
export interface VoiceAuthProvider { authorized(): Promise<boolean> }
export interface VoiceTelemetrySink { emit(event: string, attributes: Record<string, string | number>): void }
export interface CapabilityContract {name: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>}
export interface CapabilityProvider {contracts(): readonly CapabilityContract[]}
export interface VoiceToolExecutor {
  names: readonly string[];
  execute(name: string, callId: string, argumentsValue: unknown, signal: AbortSignal): Promise<unknown>;
}
export const capabilityRegistry: readonly CapabilityContract[] = Object.freeze([]);
export type VoiceSnapshot = {state: VoiceSessionState; muted: boolean; inputLevel: number; outputLevel: number; model: string | null; error: VoiceError | null};
export const initialSnapshot: VoiceSnapshot = {state: 'idle', muted: false, inputLevel: 0, outputLevel: 0, model: null, error: null};
export const callActive = (state: VoiceSessionState) => !['idle', 'disconnected', 'error'].includes(state);
