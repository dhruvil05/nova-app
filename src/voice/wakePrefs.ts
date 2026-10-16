import type { SettingsRepo } from '@/db/settingsRepo';

/** Wake-word sensitivity: higher wakes more easily but also by mistake more often. */
export const WAKE_SENSITIVITIES = [
  { value: 0.25, label: 'Low' },
  { value: 0.5, label: 'Medium' },
  { value: 0.75, label: 'High' },
] as const;

export async function loadWakeSensitivity(settings: SettingsRepo): Promise<number> {
  const stored = Number(await settings.get('wake.sensitivity'));
  return WAKE_SENSITIVITIES.some((s) => s.value === stored) ? stored : 0.5;
}
