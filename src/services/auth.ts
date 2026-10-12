import * as LocalAuthentication from 'expo-local-authentication';

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; message: string };

const CANCELLED = new Set(['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback']);
const UNAVAILABLE = new Set(['not_enrolled', 'not_available', 'passcode_not_set']);

/**
 * Fingerprint / face unlock, falling back to the phone's PIN or pattern.
 * Used before showing private notes or changing a note's privacy.
 */
export async function authenticate(promptMessage: string): Promise<AuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      promptSubtitle: 'Private notes stay on this phone and are never shared with Nova',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    if (CANCELLED.has(result.error)) {
      return { ok: false, reason: 'cancelled', message: 'Unlock cancelled' };
    }
    if (UNAVAILABLE.has(result.error)) {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'Set up a screen lock (fingerprint, PIN or pattern) in your phone settings to use private notes.',
      };
    }
    if (result.error === 'lockout') {
      return { ok: false, reason: 'failed', message: 'Too many attempts. Try again in a moment.' };
    }
    return { ok: false, reason: 'failed', message: 'Could not unlock. Please try again.' };
  } catch {
    return { ok: false, reason: 'failed', message: 'Could not unlock. Please try again.' };
  }
}
