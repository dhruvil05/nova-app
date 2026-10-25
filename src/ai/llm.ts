import Anthropic from '@anthropic-ai/sdk';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { ModelId } from './models';
import { SYSTEM_PROMPT } from './prompt';
import { TOOL_DEFINITIONS } from './tools/definitions';

/**
 * The one place that talks to the Claude API (spec 8.6). The rest of the app
 * sees only the `Llm` interface, so the agent loop can be tested with a fake.
 */

export type StreamHooks = {
  onText?(delta: string): void;
  /** A tool call started streaming (its input arrives later) */
  onToolStart?(toolUseId: string, name: string): void;
};

export interface Llm {
  send(
    messages: Anthropic.Beta.BetaMessageParam[],
    hooks: StreamHooks,
    signal?: AbortSignal,
  ): Promise<Anthropic.Beta.BetaMessage>;
}

const BETAS: Anthropic.Beta.AnthropicBeta[] = [
  // Server-side compaction summarises old turns when the conversation gets long,
  // instead of the client trimming history (which would break thinking blocks).
  'compact-2026-01-12',
  // Lets us choose what happens if the history ever stops matching (drop the stale
  // reasoning instead of failing the request).
  'thinking-binding-controls-2026-08-01',
  // On a safety-classifier refusal, the API retries on a recommended model.
  'server-side-fallback-2026-07-01',
];

/**
 * API client for the user's own key, called straight from the phone. expo/fetch
 * is used because React Native's built-in fetch can't stream responses.
 */
export function createLlm(apiKey: string, model: ModelId): Llm {
  const client = new Anthropic({
    apiKey,
    fetch: expoFetch as unknown as typeof globalThis.fetch,
    maxRetries: 2,
    // The web preview calls the API from the browser with your own key (the SDK
    // refuses by default to protect shared keys). The phone app is unaffected.
    dangerouslyAllowBrowser: Platform.OS === 'web',
    timeout: 5 * 60_000,
  });

  return {
    async send(messages, hooks, signal) {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 32_000,
          betas: BETAS,
          // Frozen for the conversation; cached together with the tools.
          system: [{ type: 'text', text: SYSTEM_PROMPT }],
          tools: TOOL_DEFINITIONS,
          messages,
          // Thinking is always on for these models; effort sets how much.
          thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
          output_config: { effort: 'medium' },
          context_management: { edits: [{ type: 'compact_20260112' }] },
          fallbacks: 'default',
          // Caches tools + system prompt + history up to the newest message.
          cache_control: { type: 'ephemeral' },
        },
        { signal },
      );

      stream.on('text', (delta) => hooks.onText?.(delta));
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          hooks.onToolStart?.(event.content_block.id, event.content_block.name);
        }
      });

      return stream.finalMessage();
    },
  };
}

/** Friendly message for an API failure, by error class (never by matching text). */
export function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key can’t use that model. Check your Anthropic account or pick another model in Settings.';
  if (error instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a moment and try again.';
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return 'Can’t reach the AI. Check your internet connection.';
  if (error instanceof Anthropic.InternalServerError) return 'The AI service had a problem. Try again in a moment.';
  if (error instanceof Anthropic.APIError) return `The AI service returned an error (${error.status ?? 'unknown'}).`;
  return 'Something went wrong talking to the AI.';
}

/**
 * Errors raised by the SDK itself while reading the stream (unparseable tool-input
 * JSON, a stream that ended early) rather than returned by the API. Safe to retry
 * once; API errors (auth, rate limit, bad request) are not.
 */
export function isRetryableStreamError(error: unknown): boolean {
  return (
    error instanceof Anthropic.AnthropicError &&
    !(error instanceof Anthropic.APIError) &&
    !(error instanceof Anthropic.APIUserAbortError)
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Anthropic.APIUserAbortError;
}
