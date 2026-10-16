/**
 * Text helpers for voice mode: what to read aloud, in which language, and
 * whether the user just said "stop".
 */

export type VoiceLanguage = 'en-IN' | 'hi-IN' | 'gu-IN';

export const VOICE_LANGUAGES: { id: VoiceLanguage; label: string; short: string }[] = [
  { id: 'en-IN', label: 'English (India)', short: 'EN' },
  { id: 'hi-IN', label: 'हिन्दी (Hindi)', short: 'हि' },
  { id: 'gu-IN', label: 'ગુજરાતી (Gujarati)', short: 'ગુ' },
];

export function resolveVoiceLanguage(stored: string | null | undefined): VoiceLanguage {
  return VOICE_LANGUAGES.some((l) => l.id === stored) ? (stored as VoiceLanguage) : 'en-IN';
}

/** Spoken replies longer than this are cut at a sentence boundary; the rest stays on screen. */
export const MAX_SPOKEN_CHARS = 700;

/**
 * Turns a chat reply into something pleasant to hear: drops Markdown symbols,
 * links and emoji, and keeps long replies short.
 */
export function toSpeakable(text: string, maxChars = MAX_SPOKEN_CHARS): string {
  let t = text
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // quotes
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '') // list markers
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2') // emphasis
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '') // emoji
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.(\s*\.)+/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('। '));
    t = `${end > maxChars / 3 ? cut.slice(0, end + 1) : cut.trimEnd() + '…'} The rest is on screen.`;
  }
  return t;
}

/**
 * Which voice to read a reply with, from its script: Devanagari → Hindi,
 * Gujarati script → Gujarati, otherwise the user's chosen language.
 */
export function speechLanguageFor(text: string, preferred: VoiceLanguage): VoiceLanguage {
  let devanagari = 0;
  let gujarati = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0900 && c <= 0x097f) devanagari++;
    else if (c >= 0x0a80 && c <= 0x0aff) gujarati++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  if (gujarati > latin && gujarati >= devanagari) return 'gu-IN';
  if (devanagari > latin) return 'hi-IN';
  if (latin > 0 && preferred !== 'en-IN' && devanagari === 0 && gujarati === 0) return 'en-IN';
  return preferred;
}

const STOP_WORDS = new Set([
  'stop',
  'stop listening',
  'stop it',
  'cancel',
  'that is all',
  "that's all",
  'thats all',
  'bye',
  'goodbye',
  'बस',
  'रुको',
  'बंद करो',
  'स्टॉप',
  'બસ',
  'બંધ કરો',
  'સ્ટોપ',
]);

/** True when a whole utterance is just "stop" (or a close equivalent). */
export function isStopCommand(transcript: string): boolean {
  const normalized = transcript
    .toLowerCase()
    .replace(/[.!?,।]/g, '')
    .replace(/\b(nova|please|ok|okay|hey)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return STOP_WORDS.has(normalized);
}
