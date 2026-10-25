import { requireOptionalNativeModule } from 'expo';
import { TurboModuleRegistry } from 'react-native';

/**
 * Which of Nova's own native modules are in the app that's running. In Expo Go
 * none of them are (Expo Go only contains Expo's built-in modules), so Nova
 * turns those features off instead of crashing. In the Nova development build
 * they are all present.
 */
export const HAS_TRACK_PLAYER = TurboModuleRegistry.get('TrackPlayer') != null;
export const HAS_METADATA_RETRIEVER = TurboModuleRegistry.get('MetadataRetriever') != null;
export const HAS_SPEECH_RECOGNITION = requireOptionalNativeModule('ExpoSpeechRecognition') != null;

/** True when running without Nova's native code, e.g. in Expo Go. */
export const IS_LIMITED_BUILD = !HAS_TRACK_PLAYER || !HAS_SPEECH_RECOGNITION;

export const LIMITED_BUILD_MESSAGE =
  'You’re running Nova in Expo Go. Music playback, PDF reading, voice and “Hey Nova” need the Nova development build.';
