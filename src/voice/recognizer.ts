import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import type { VoiceLanguage } from './speechText';

/**
 * Speech-to-text with Android's built-in recogniser (expo-speech-recognition).
 * One utterance per start(): the recogniser ends by itself after a pause and
 * delivers a final result, which is what we send to Nova.
 */

/** Hands-free sessions end after this much silence (spec 9.1). */
export const SILENCE_TIMEOUT_MS = 8000;

export function isRecognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function ensureMicPermission(): Promise<boolean> {
  const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return res.granted;
}

export function startListening(language: VoiceLanguage): void {
  ExpoSpeechRecognitionModule.start({
    lang: language,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
    addsPunctuation: true,
    // Online recognition: on-device models are often missing for gu-IN.
    requiresOnDeviceRecognition: false,
    androidIntentOptions: {
      // A hint (recognisers may ignore it): how long a pause ends the utterance.
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
      EXTRA_LANGUAGE_MODEL: 'free_form',
    },
  });
}

/** Stop listening and deliver what was heard so far as a final result. */
export function finishListening(): void {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // Not listening.
  }
}

/** Stop listening and throw away what was heard. */
export function cancelListening(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Not listening.
  }
}

/** Plain-language message for a recogniser error code. */
export function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission is off. Allow it in phone settings.';
    case 'network':
      return 'Speech recognition needs the internet. Check your connection.';
    case 'language-not-supported':
      return 'Your phone can’t recognise this language. Try another in Settings.';
    case 'audio-capture':
    case 'busy':
      return 'The microphone is busy. Try again.';
    default:
      return 'Couldn’t hear you. Try again.';
  }
}
