/**
 * @jest-environment node
 */
import type Anthropic from '@anthropic-ai/sdk';

import { migrate } from '@/db/migrate';
import { createFilesRepo } from '@/db/filesRepo';
import { createNotesRepo } from '@/db/notesRepo';
import { createNodeDb } from '@/db/testing/nodeDb';
import { createTracksRepo } from '@/db/tracksRepo';

import { MAX_TOOL_ROUNDS, NO_REPLY_ERROR, NO_REPLY_STOPPED, runTurn, type AgentEvent } from '../agent';
import type { Llm } from '../llm';
import type { ToolContext } from '../tools/handlers';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type Block = Record<string, unknown>;

function reply(content: Block[], stop_reason: string): Anthropic.Beta.BetaMessage {
  return { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason } as unknown as Anthropic.Beta.BetaMessage;
}
const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
const text = (t: string) => reply([thinking, { type: 'text', text: t }], 'end_turn');
const toolCall = (id: string, name: string, input: unknown) =>
  reply([thinking, { type: 'tool_use', id, name, input }], 'tool_use');

/** An LLM that plays back scripted replies and records every request it got. */
function fakeLlm(script: (Anthropic.Beta.BetaMessage | Error)[]) {
  const requests: MessageParam[][] = [];
  const llm: Llm = {
    async send(messages, hooks) {
      requests.push(structuredClone(messages));
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      for (const b of next.content) if (b.type === 'text') hooks.onText?.(b.text);
      return next;
    },
  };
  return { llm, requests };
}

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  const notes = createNotesRepo(db);
  const files = createFilesRepo(db);
  const tracks = createTracksRepo(db);
  const tools: ToolContext = {
    notes,
    files,
    tracks,
    music: { search: async () => [], play: () => {}, control: () => {}, nowPlaying: () => ({ trackId: null, playing: false }) },
    saveTextFile: async () => {
      throw new Error('unused');
    },
    confirm: async () => true,
  };
  const stored: MessageParam[] = [];
  const persist = async (m: MessageParam) => {
    stored.push(m);
  };
  return { notes, tools, stored, persist };
}

/** Checks the history is one the API would accept on the next request. */
function expectValidHistory(messages: MessageParam[]) {
  const answered = new Set<string>();
  const asked: string[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'system') {
      const next = messages[i + 1];
      expect(next === undefined || next.role === 'assistant').toBe(true);
      expect(messages[i - 1]?.role).toBe('user');
    }
    if (Array.isArray(m.content)) {
      for (const b of m.content as unknown as Block[]) {
        if (b.type === 'tool_use') asked.push(b.id as string);
        if (b.type === 'tool_result') answered.add(b.tool_use_id as string);
      }
    }
  });
  for (const id of asked) expect(answered.has(id)).toBe(true);
}

describe('runTurn', () => {
  it('runs the right tool and returns its result to Claude', async () => {
    const { tools, stored, persist, notes } = await setup();
    const { llm, requests } = fakeLlm([
      toolCall('t1', 'create_note', { title: 'Meeting with Raj', body: 'Moved to 5 pm' }),
      text('Noted.'),
    ]);
    const events: AgentEvent[] = [];
    const outcome = await runTurn({ llm, history: [], userText: 'Note that the meeting moved to 5 pm', tools, persist, onEvent: (e) => events.push(e), now: new Date(2026, 9, 15, 15, 4) });

    expect(outcome).toEqual({ status: 'done' });
    expect((await notes.list()).map((n) => n.title)).toEqual(['Meeting with Raj']);
    expect(stored.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect(String(stored[1].content)).toContain('Thursday, 15 October 2026, 3:04 pm');
    // Thinking blocks are kept in the stored assistant message.
    expect((stored[2].content as unknown as Block[])[0]).toEqual(thinking);
    // The second request carries the tool result.
    const sent = requests[1].at(-1)!.content as unknown as Block[];
    expect(sent[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(JSON.parse(sent[0].content as string)).toMatchObject({ created: true });
    expect(events.some((e) => e.type === 'tool_done' && e.name === 'create_note' && !e.isError)).toBe(true);
    expectValidHistory(stored);
  });

  it('only ever appends: each request extends the previous one unchanged', async () => {
    const { tools, persist } = await setup();
    const { llm, requests } = fakeLlm([toolCall('t1', 'search_notes', { query: 'car' }), text('Nothing found.')]);
    await runTurn({ llm, history: [], userText: 'car service?', tools, persist });
    expect(requests[1].slice(0, requests[0].length)).toEqual(requests[0]);
  });

  it('caps tool rounds and still answers every tool call', async () => {
    const { tools, stored, persist } = await setup();
    const script = Array.from({ length: MAX_TOOL_ROUNDS + 3 }, (_, i) => toolCall(`t${i}`, 'search_notes', { query: 'x' }));
    const { llm, requests } = fakeLlm(script);
    const outcome = await runTurn({ llm, history: [], userText: 'loop', tools, persist });

    expect(outcome).toEqual({ status: 'step_limit' });
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    const last = stored.at(-1)!.content as unknown as Block[];
    expect(JSON.parse(last[0].content as string).error).toMatch(/step limit/);
    expectValidHistory(stored);
  });

  it('turns tool failures into {error} results instead of crashing', async () => {
    const { tools, stored, persist } = await setup();
    const { llm } = fakeLlm([toolCall('t1', 'get_note', { id: 999 }), toolCall('t2', 'no_such_tool', {}), text('Sorry.')]);
    expect(await runTurn({ llm, history: [], userText: 'x', tools, persist })).toEqual({ status: 'done' });
    const results = stored.filter((m) => m.role === 'user' && Array.isArray(m.content)).map((m) => (m.content as unknown as Block[])[0]);
    expect(results.map((r) => r.is_error)).toEqual([true, true]);
    expect(JSON.parse(results[1].content as string)).toEqual({ error: 'Unknown tool: no_such_tool' });
  });

  it('does not run tool calls cut off by max_tokens or a refusal', async () => {
    for (const stop of ['max_tokens', 'refusal']) {
      const { tools, stored, persist, notes } = await setup();
      const { llm } = fakeLlm([reply([{ type: 'tool_use', id: 't1', name: 'create_note', input: { title: 'Half' } }], stop)]);
      const outcome = await runTurn({ llm, history: [], userText: 'x', tools, persist });
      expect(outcome.status).toBe(stop === 'refusal' ? 'refusal' : 'truncated');
      expect(await notes.list()).toEqual([]);
      expectValidHistory(stored);
    }
  });

  it('retries a stream parse error, but not an API error', async () => {
    const { tools, persist, stored } = await setup();
    const parseErr = new Error('Unable to parse tool parameter JSON');
    const { llm } = fakeLlm([parseErr, text('Done.')]);
    const ok = await runTurn({ llm, history: [], userText: 'x', tools, persist, isParseError: (e) => e === parseErr });
    expect(ok).toEqual({ status: 'done' });

    const apiErr = new Error('401');
    const second = fakeLlm([apiErr]);
    const failed = await runTurn({ llm: second.llm, history: stored.slice(), userText: 'y', tools, persist, isParseError: (e) => e === parseErr });
    expect(failed).toEqual({ status: 'error', error: apiErr });
    // The failed turn still ends with an assistant message so the history stays valid.
    expect(stored.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: NO_REPLY_ERROR }] });
    expectValidHistory(stored);
  });

  it('stops cleanly when aborted', async () => {
    const { tools, stored, persist } = await setup();
    const controller = new AbortController();
    controller.abort();
    const { llm, requests } = fakeLlm([text('never')]);
    expect(await runTurn({ llm, history: [], userText: 'x', tools, persist, signal: controller.signal })).toEqual({ status: 'aborted' });
    expect(requests).toHaveLength(0);
    expect(stored.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: NO_REPLY_STOPPED }] });
    expectValidHistory(stored);
  });

  it('continues after pause_turn without running anything', async () => {
    const { tools, persist } = await setup();
    const { llm, requests } = fakeLlm([reply([thinking], 'pause_turn'), text('Finished.')]);
    expect(await runTurn({ llm, history: [], userText: 'x', tools, persist })).toEqual({ status: 'done' });
    expect(requests).toHaveLength(2);
  });
});
