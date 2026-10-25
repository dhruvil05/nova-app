/**
 * Web build: none of Nova's native modules exist in the browser (and React
 * Native's TurboModuleRegistry isn't available), so these features are off.
 */
export const HAS_TRACK_PLAYER = false;
export const HAS_METADATA_RETRIEVER = false;
export const HAS_SPEECH_RECOGNITION = false;

export const IS_LIMITED_BUILD = true;

export const LIMITED_BUILD_MESSAGE =
  'You’re previewing Nova on the web. Music playback, PDF reading, voice, “Hey Nova”, fingerprint unlock and importing files need the Android app.';
