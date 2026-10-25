/**
 * Web preview only. Browsers have no OS keystore, so the API key is kept in this
 * browser's localStorage, which is fine for testing on your own computer but not
 * private storage. The Android app keeps it in the encrypted keystore
 * (secrets.ts), as spec section 11 requires.
 */
const API_KEY = 'nova.apiKey';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function getApiKey(): Promise<string | null> {
  return storage()?.getItem(API_KEY) ?? null;
}

export async function setApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (key.length === 0) throw new Error('API key is empty');
  const store = storage();
  if (!store) throw new Error('This browser blocks local storage');
  store.setItem(API_KEY, key);
}

export async function clearApiKey(): Promise<void> {
  storage()?.removeItem(API_KEY);
}

/** "••••4f2a": enough to recognise the key without revealing it. */
export function maskApiKey(key: string): string {
  return `••••${key.slice(-4)}`;
}
