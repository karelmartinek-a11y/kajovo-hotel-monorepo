import type { VoiceSessionState } from './contracts.js';
export const stateLabels: Record<VoiceSessionState, string> = {
  idle: 'Nepřipojeno', 'requesting-permission': 'Čekám na mikrofon', connecting: 'Připojování', listening: 'Poslouchám',
  'user-speaking': 'Mluvíte', 'assistant-processing': 'Přemýšlím', 'assistant-speaking': 'Asistent mluví',
  reconnecting: 'Obnovuji spojení', disconnecting: 'Ukončuji hovor', disconnected: 'Hovor ukončen', error: 'Chyba',
};
const errors: Record<string, string> = {
  missing_api_key: 'Nejprve uložte OpenAI API klíč.', invalid_api_key: 'OpenAI API klíč není platný.',
  invalid_key_format: 'Zadejte platný klíč bez mezer.', invalid_configuration: 'Nastavení není platné.',
  model_unavailable: 'Vybraný model není dostupný. V ručním režimu se jiný model nepoužije.',
  rate_limited: 'OpenAI nyní omezuje počet požadavků. Zkuste hovor později.',
  secret_store_unavailable: 'Server nemá dostupné bezpečné úložiště klíče. Kontaktujte správce.',
  configuration_conflict: 'Konfiguraci změnil jiný správce. Obnovte její aktuální hodnoty.',
  provider_unavailable: 'OpenAI je nyní nedostupné.', provider_timeout: 'OpenAI neodpovědělo včas.',
  microphone_denied: 'Povolte mikrofon v nastavení prohlížeče a zahajte hovor znovu.',
  microphone_unavailable: 'Mikrofon není dostupný. Zkontrolujte jej a zahajte hovor znovu.',
  microphone_interrupted: 'Mikrofon byl přerušen. Zkontrolujte oprávnění nebo audio připojení a zahajte hovor znovu.',
  playback_failed: 'Zvuk nelze přehrát. Zkontrolujte oprávnění pro zvuk a zahajte hovor znovu.',
  audio_interrupted: 'Zvuková relace byla přerušena. Zahajte hovor znovu.', network_lost: 'Spojení se nepodařilo obnovit. Zkontrolujte internet a zahajte hovor znovu.',
  connection_timeout: 'Hlasové spojení se nepodařilo navázat včas.', session_ended: 'Hlasová relace byla nečekaně ukončena.',
  unauthorized: 'Pro hlasový chat se přihlaste jako administrátor.',
};
export const errorMessage = (category: string) => errors[category] ?? 'Hovor se nezdařil. Zkuste jej znovu.';
