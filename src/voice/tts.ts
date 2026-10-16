import * as Speech from 'expo-speech';

import type { VoiceLanguage } from './speechText';

/**
 * Text-to-speech with Android's built-in voices (expo-speech). Android only
 * honours a language reliably when given a specific installed voice, so we pick
 * one: the user's choice from Settings, else the best installed voice for the
 * language, else the engine default.
 */

let voicesCache: Speech.Voice[] | null = null;

export async function installedVoices(): Promise<Speech.Voice[]> {
  if (!voicesCache) {
    try {
      voicesCache = await Speech.getAvailableVoicesAsync();
    } catch {
      voicesCache = [];
    }
  }
  return voicesCache;
}

/** Installed voices for a language, best first (exact locale, then enhanced quality). */
export async function voicesFor(language: VoiceLanguage): Promise<Speech.Voice[]> {
  const base = language.slice(0, 2);
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  const matches = (await installedVoices()).filter((v) => norm(v.language).startsWith(base));
  const score = (v: Speech.Voice) =>
    (norm(v.language) === language.toLowerCase() ? 2 : 0) + (v.quality === Speech.VoiceQuality.Enhanced ? 1 : 0);
  return matches.sort((a, b) => score(b) - score(a));
}

async function pickVoice(language: VoiceLanguage, preferredId?: string | null): Promise<string | undefined> {
  const candidates = await voicesFor(language);
  if (preferredId && candidates.some((v) => v.identifier === preferredId)) return preferredId;
  return candidates[0]?.identifier;
}

export type SpeakOptions = {
  language: VoiceLanguage;
  /** 1 = normal speed */
  rate?: number;
  /** Voice chosen in Settings, used when it matches the language */
  voiceId?: string | null;
};

/** Speaks the text; resolves when finished, stopped, or failed. */
export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  const voice = await pickVoice(opts.language, opts.voiceId);
  const chunk = text.slice(0, Math.max(100, Speech.maxSpeechInputLength - 1));
  await new Promise<void>((resolve) => {
    Speech.speak(chunk, {
      language: opts.language,
      voice,
      rate: opts.rate ?? 1,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // Nothing was speaking.
  }
}
