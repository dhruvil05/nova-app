/**
 * @jest-environment node
 *
 * Runs the real Anthropic SDK against a simulated streaming response, to check
 * the request Nova builds and that streamed tool calls come back intact.
 */
import Anthropic from '@anthropic-ai/sdk';

import { createLlm, describeApiError, isRetryableStreamError } from '../llm';
import { SYSTEM_PROMPT } from '../prompt';
import { TOOL_DEFINITIONS } from '../tools/definitions';

// jest hoists jest.mock above the imports, so llm.ts sees the fake fetch.
const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));

function sse(events: Record<string, unknown>[]): Response {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const toolStream = [
  {
    type: 'message_start',
    message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig==' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Saving that.' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_note', input: {} } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"title": "Bill", ' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"body": "Due on the 15th"}' } },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 30 } },
  { type: 'message_stop' },
];

describe('createLlm', () => {
  beforeEach(() => mockFetch.mockReset());

  it('sends a streaming request with Nova’s tools, betas and settings', async () => {
    mockFetch.mockResolvedValue(sse(toolStream));
    const llm = createLlm('sk-ant-test', 'claude-opus-5-5');
    const texts: string[] = [];
    const tools: string[] = [];

    const message = await llm.send([{ role: 'user', content: 'Note the bill' }], {
      onText: (d) => texts.push(d),
      onToolStart: (_id, name) => tools.push(name),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/v1/messages');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-beta')?.split(',')).toEqual(
      expect.arrayContaining(['compact-2026-01-12', 'thinking-binding-controls-2026-08-01', 'server-side-fallback-2026-07-01']),
    );

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      system: [{ type: 'text', text: SYSTEM_PROMPT }],
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
    });
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(TOOL_DEFINITIONS.map((t) => t.name));
    expect(body).not.toHaveProperty('tool_choice');

    expect(texts.join('')).toBe('Saving that.');
    expect(tools).toEqual(['create_note']);
    expect(message.stop_reason).toBe('tool_use');
    expect(message.content.map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use']);
    const call = message.content[2] as Anthropic.Beta.BetaToolUseBlock;
    expect(call.input).toEqual({ title: 'Bill', body: 'Due on the 15th' });
  });

  it('surfaces API errors as typed errors with friendly messages', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const llm = createLlm('bad', 'claude-opus-5-5');
    const err = await llm.send([{ role: 'user', content: 'hi' }], {}).catch((e) => e);
    expect(err).toBeInstanceOf(Anthropic.AuthenticationError);
    expect(isRetryableStreamError(err)).toBe(false);
    expect(describeApiError(err)).toMatch(/API key was rejected/);
  });
});
