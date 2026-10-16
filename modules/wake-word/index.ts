import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * "Hey Nova" wake word (spec 9.2): a native foreground service listens on-device
 * with Vosk (offline, grammar limited to the wake phrase) and tells JS when it
 * hears it. Nothing is sent anywhere until the phrase is heard.
 */

export type WakeServiceState = 'stopped' | 'starting' | 'listening' | 'paused' | 'error';

export type WakeStatusEvent = { state: WakeServiceState; message?: string };
export type WakeEvent = { at: number; locked: boolean };
export type ModelProgressEvent = { stage: 'downloading' | 'unpacking' | 'ready' | 'error'; progress: number; message?: string };

type WakeWordEvents = {
  onWake: (e: WakeEvent) => void;
  onStatus: (e: WakeStatusEvent) => void;
  onModelProgress: (e: ModelProgressEvent) => void;
};

declare class WakeWordNativeModule extends NativeModule<WakeWordEvents> {
  /** Downloads/unpacks the speech model if needed; resolves when ready. */
  prepareModelAsync(): Promise<void>;
  isModelReady(): boolean;
  /** Starts the foreground service. Must be called while the app is visible. sensitivity: 0-1. */
  startAsync(sensitivity: number): Promise<void>;
  stopAsync(): Promise<void>;
  getState(): WakeServiceState;
  getStatusMessage(): string | null;
  /** The phrase actually used ("hey nova", or a fallback the model knows). */
  getWakePhrase(): string;
  /** After handling a wake-up: free the mic for speech recognition, then resume. */
  pauseListening(): void;
  resumeListening(): void;
  /** Whether the user wants the service on (survives restarts). */
  isEnabled(): boolean;

  isDeviceLocked(): boolean;
  /** Lets the voice screen appear over the lock screen (turned off again afterwards). */
  setShowWhenLocked(show: boolean): void;
  /** Sends the app back behind the lock screen after a locked conversation. */
  moveToBack(): void;

  isIgnoringBatteryOptimizations(): boolean;
  openBatteryOptimizationRequest(): void;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  canUseFullScreenIntent(): boolean;
  /** Xiaomi only: returns false when the screen isn't available on this phone. */
  openXiaomiAutostart(): boolean;
  openXiaomiPermissions(): boolean;
  openAppDetails(): void;
  getManufacturer(): string;
}

const WakeWord = requireOptionalNativeModule<WakeWordNativeModule>('WakeWord');

export const isWakeWordAvailable = WakeWord != null;

export default WakeWord;
