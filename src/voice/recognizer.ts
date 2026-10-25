import type * as SpeechRecognition from 'expo-speech-recognition';
import { PermissionsAndroid, Platform } from 'react-native';

import { HAS_SPEECH_RECOGNITION } from '@/services/nativeModules';

import type { VoiceLanguage } from './speechText';

// expo-speech-recognition loads its native module on import, and Expo Go doesn't
// include it; this file is the only place that touches it.
const sr: typeof SpeechRecognition | null = HAS_SPEECH_RECOGNITION
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-speech-recognition') as typeof SpeechRecognition)
  : null;

/** False in Expo Go: voice needs the Nova development build. */
export const speechRecognitionInstalled = sr !== null;

/** Subscribes to recogniser events (does nothing when speech recognition isn't installed). */
export const useSpeechRecognitionEvent: typeof SpeechRecognition.useSpeechRecognitionEvent = sr
  ? sr.useSpeechRecognitionEvent
  : () => {};

/**
 * Speech-to-text with Android's built-in recogniser (expo-speech-recognition).
 * One utterance per start(): the recogniser ends by itself after a pause and
 * delivers a final result, which is what we send to Nova.
 */

/** Hands-free sessions end after this much silence (spec 9.1). */
export const SILENCE_TIMEOUT_MS = 8000;

export function isRecognitionAvailable(): boolean {
  try {
    return sr?.ExpoSpeechRecognitionModule.isRecognitionAvailable() ?? false;
  } catch {
    return false;
  }
}

export async function ensureMicPermission(): Promise<boolean> {
  if (!sr) {
    // Web has no PermissionsAndroid (and no voice in Nova's web preview).
    if (Platform.OS !== 'android') return false;
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  const res = await sr.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return res.granted;
}

/**
 * On Xiaomi phones the default recogniser may be Xiaomi's own service; Google's
 * handles Hindi/Gujarati and works while a microphone service runs.
 */
export const GOOGLE_RECOGNIZER = 'com.google.android.googlequicksearchbox';

export function startListening(language: VoiceLanguage, opts?: { servicePackage?: string }): void {
  sr?.ExpoSpeechRecognitionModule.start({
    lang: language,
    androidRecognitionServicePackage: opts?.servicePackage,
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
    sr?.ExpoSpeechRecognitionModule.stop();
  } catch {
    // Not listening.
  }
}

/** Stop listening and throw away what was heard. */
export function cancelListening(): void {
  try {
    sr?.ExpoSpeechRecognitionModule.abort();
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
