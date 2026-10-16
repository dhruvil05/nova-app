import type { SettingsRepo } from '@/db/settingsRepo';

import { resolveVoiceLanguage, type VoiceLanguage } from './speechText';

export type VoicePrefs = {
  language: VoiceLanguage;
  /** Speaking speed, 1 = normal */
  rate: number;
  /** Installed TTS voice chosen in Settings, or null for automatic */
  voiceId: string | null;
  handsFree: boolean;
};

export const SPEECH_RATES = [
  { value: 0.8, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Fast' },
  { value: 1.5, label: 'Faster' },
] as const;

export async function loadVoicePrefs(settings: SettingsRepo): Promise<VoicePrefs> {
  const [language, rate, voiceId, handsFree] = await Promise.all([
    settings.get('voice.language'),
    settings.get('voice.rate'),
    settings.get('voice.ttsVoice'),
    settings.get('voice.handsFree'),
  ]);
  const parsedRate = Number(rate);
  return {
    language: resolveVoiceLanguage(language),
    rate: SPEECH_RATES.some((r) => r.value === parsedRate) ? parsedRate : 1,
    voiceId: voiceId || null,
    handsFree: handsFree === '1',
  };
}
