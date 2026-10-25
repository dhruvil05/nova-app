import type { AuthResult } from './auth';

/** Web preview: there is no fingerprint or phone PIN, so private notes stay locked. */
export async function authenticate(_promptMessage: string): Promise<AuthResult> {
  return {
    ok: false,
    reason: 'unavailable',
    message: 'Private notes open with your fingerprint or PIN in the Android app. They stay locked in the web preview.',
  };
}
