import type Anthropic from '@anthropic-ai/sdk';

import type { Llm } from './llm';
import { contextMessage } from './prompt';
import { executeTool, type ToolContext } from './tools/handlers';

/**
 * The tool-calling loop (spec 8.1): send the conversation, run any tools Claude
 * asks for, send the results back, until Claude answers without tools.
 *
 * Rules that keep the stored history valid for the next request:
 * - History is append-only: nothing already sent is ever edited or removed
 *   (Claude's thinking blocks are bound to the exact history they came from).
 * - Assistant messages are stored with ALL their content blocks (thinking,
 *   compaction), not just the text.
 * - Every tool_use gets a tool_result, even when the turn is cut short.
 * - A turn that ends without any reply still gets a short assistant message,
 *   so system messages are always followed by an assistant turn.
 */

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;
type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;

/** Tool rounds per user message (spec: cap of 5 to avoid loops). */
export const MAX_TOOL_ROUNDS = 5;
/** Consecutive retries when a streamed tool input isn't parseable JSON. */
const MAX_PARSE_RETRIES = 2;

/** Placeholder replies; the chat UI shows these as a quiet note, not a bubble. */
export const NO_REPLY_STOPPED = '[Nova stopped before replying.]';
export const NO_REPLY_ERROR = '[Nova could not reply.]';

export type AgentEvent =
  | { type: 'message'; message: MessageParam }
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; toolUseId: string; name: string }
  | {
      type: 'tool_done';
      toolUseId: string;
      name: string;
      input: unknown;
      result: Record<string, unknown>;
      isError: boolean;
    }
  | { type: 'request_start' };

export type TurnOutcome =
  | { status: 'done' }
  | { status: 'refusal' }
  | { status: 'truncated' }
  | { status: 'step_limit' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown };

export type RunTurnOptions = {
  llm: Llm;
  /** The conversation so far, exactly as previously sent/received */
  history: MessageParam[];
  userText: string;
  tools: ToolContext;
  /** Saves one message; called in order, awaited, for every appended message */
  persist(message: MessageParam): Promise<void>;
  onEvent?(event: AgentEvent): void;
  signal?: AbortSignal;
  now?: Date;
  voice?: boolean;
  /** Errors from llm.send that mean "the tool input JSON was unparseable" (retryable) */
  isParseError?(error: unknown): boolean;
};

/** tool_use blocks in the last assistant message that have no tool_result after them. */
export function unansweredToolUses(history: MessageParam[]): Anthropic.Beta.BetaToolUseBlock[] {
  const lastAssistant = history.map((m) => m.role).lastIndexOf('assistant');
  if (lastAssistant < 0) return [];
  const message = history[lastAssistant];
  if (!Array.isArray(message.content)) return [];
  const uses = (message.content as { type: string }[]).filter(
    (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
  );
  const answered = new Set<string>();
  for (const later of history.slice(lastAssistant + 1)) {
    if (!Array.isArray(later.content)) continue;
    for (const b of later.content as { type: string; tool_use_id?: string }[]) {
      if (b.type === 'tool_result' && b.tool_use_id) answered.add(b.tool_use_id);
    }
  }
  return uses.filter((u) => !answered.has(u.id));
}

export async function runTurn(opts: RunTurnOptions): Promise<TurnOutcome> {
  const messages: MessageParam[] = [...opts.history];
  const emit = (e: AgentEvent) => opts.onEvent?.(e);
  let repliedThisTurn = false;

  async function append(message: MessageParam) {
    messages.push(message);
    await opts.persist(message);
    emit({ type: 'message', message });
  }

  async function answerAll(toolUses: Anthropic.Beta.BetaToolUseBlock[], error: string) {
    const results: ToolResultBlock[] = toolUses.map((t) => ({
      type: 'tool_result',
      tool_use_id: t.id,
      is_error: true,
      content: JSON.stringify({ error }),
    }));
    await append({ role: 'user', content: results });
  }

  async function finishWithoutReply(text: string) {
    if (!repliedThisTurn) await append({ role: 'assistant', content: [{ type: 'text', text }] });
  }

  // A previous turn that was cut off (app closed, save failed) may have left a
  // tool call without its result at the end of the history; answer it first,
  // or the API rejects every later request in this conversation.
  const dangling = unansweredToolUses(messages);
  if (dangling.length > 0) await answerAll(dangling, 'Not run: the previous turn was interrupted.');

  await append({ role: 'user', content: opts.userText });
  await append({ role: 'system', content: contextMessage(opts.now ?? new Date(), { voice: opts.voice }) });

  let parseRetries = 0;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; ) {
    if (opts.signal?.aborted) {
      await finishWithoutReply(NO_REPLY_STOPPED);
      return { status: 'aborted' };
    }

    emit({ type: 'request_start' });
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await opts.llm.send(
        messages,
        {
          onText: (delta) => emit({ type: 'text', delta }),
          onToolStart: (toolUseId, name) => emit({ type: 'tool_start', toolUseId, name }),
        },
        opts.signal,
      );
      parseRetries = 0;
    } catch (error) {
      if (opts.signal?.aborted) {
        await finishWithoutReply(NO_REPLY_STOPPED);
        return { status: 'aborted' };
      }
      if (opts.isParseError?.(error) && parseRetries < MAX_PARSE_RETRIES) {
        parseRetries++;
        continue; // re-issue the same request; nothing was appended
      }
      await finishWithoutReply(NO_REPLY_ERROR);
      return { status: 'error', error };
    }

    // Store the whole message: thinking and compaction blocks must be sent back.
    await append({ role: 'assistant', content: response.content as ContentBlock[] as MessageParam['content'] });
    repliedThisTurn = true;

    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    if (toolUses.length === 0) {
      if (response.stop_reason === 'refusal') return { status: 'refusal' };
      if (response.stop_reason === 'max_tokens') return { status: 'truncated' };
      return { status: 'done' };
    }

    // A refusal or the token limit can cut a tool call off mid-input: never run it.
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      await answerAll(toolUses, 'Not run: the response was cut off before this call was complete.');
      return { status: response.stop_reason === 'refusal' ? 'refusal' : 'truncated' };
    }

    if (round === MAX_TOOL_ROUNDS) {
      await answerAll(toolUses, `Not run: step limit of ${MAX_TOOL_ROUNDS} tool rounds reached for this message.`);
      return { status: 'step_limit' };
    }

    const results: ToolResultBlock[] = [];
    for (const call of toolUses) {
      if (opts.signal?.aborted) {
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: JSON.stringify({ error: 'Cancelled by the user.' }) });
        continue;
      }
      const outcome = await executeTool(call.name, call.input, opts.tools);
      emit({ type: 'tool_done', toolUseId: call.id, name: call.name, input: call.input, ...outcome });
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        is_error: outcome.isError || undefined,
        content: JSON.stringify(outcome.result),
      });
    }
    await append({ role: 'user', content: results });
    round++;
  }

  return { status: 'step_limit' };
}
