/** Claude models Nova can use. All support the features the agent relies on. */
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', description: 'Best answers and tool use (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', description: 'Faster, lower cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', description: 'Fastest, lowest cost' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';

export function resolveModel(stored: string | null | undefined): ModelId {
  return MODELS.some((m) => m.id === stored) ? (stored as ModelId) : DEFAULT_MODEL;
}
