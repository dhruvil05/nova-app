import * as SecureStore from 'expo-secure-store';

/**
 * The AI provider's API key lives only in the OS keystore (expo-secure-store),
 * never in SQLite, source code or .env files (spec section 11).
 */
const API_KEY = 'nova.apiKey';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY);
}

export async function setApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (key.length === 0) throw new Error('API key is empty');
  await SecureStore.setItemAsync(API_KEY, key);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY);
}

/** "••••4f2a": enough to recognise the key without revealing it. */
export function maskApiKey(key: string): string {
  return `••••${key.slice(-4)}`;
}
