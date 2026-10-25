/**
 * @jest-environment node
 *
 * The chat tab and the voice screen share this one engine; each turn must extend
 * the stored conversation exactly, whichever screen sent it.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { createConversationsRepo } from '@/db/conversationsRepo';
import { createFilesRepo } from '@/db/filesRepo';
import { migrate } from '@/db/migrate';
import { createNotesRepo } from '@/db/notesRepo';
import { createSettingsRepo } from '@/db/settingsRepo';
import { createNodeDb } from '@/db/testing/nodeDb';
import { createTracksRepo } from '@/db/tracksRepo';

import { conversationMentionsNote, replyTextOf, useChatStore } from '../chatStore';

type MessageParam = Anthropic.Beta.BetaMessageParam;

const mockRequests: MessageParam[][] = [];
const mockReplies: string[] = [];

let mockApiKey: string | null = 'sk-ant-test';
jest.mock('@/services/secrets', () => ({ getApiKey: async () => mockApiKey }));
jest.mock('@/services/player', () => ({}));
jest.mock('@/services/fileStore', () => ({ saveTextFile: jest.fn() }));
jest.mock('../llm', () => ({
  createLlm: () => ({
    send: async (messages: MessageParam[]) => {
      mockRequests.push(structuredClone(messages));
      return {
        id: 'm',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'text', text: mockReplies.shift() ?? 'ok' },
        ],
      };
    },
  }),
  describeApiError: () => 'error',
  isRetryableStreamError: () => false,
}));

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  const conversations = createConversationsRepo(db);
  useChatStore.getState().bind({
    conversations,
    notes: createNotesRepo(db),
    files: createFilesRepo(db),
    tracks: createTracksRepo(db),
    settings: createSettingsRepo(db),
  });
  await useChatStore.getState().open(null);
  return { conversations };
}

describe('chatStore', () => {
  beforeEach(() => {
    mockRequests.length = 0;
    mockApiKey = 'sk-ant-test';
  });

  it('refuses a second send while one is running (no interleaved history)', async () => {
    await setup();
    const first = useChatStore.getState().send('one');
    const second = await useChatStore.getState().send('two');
    expect(second).toEqual({ status: 'busy', replyText: '' });
    expect(await first).toMatchObject({ status: 'done' });
    expect(mockRequests).toHaveLength(1);
    expect(useChatStore.getState().busy).toBe(false);
  });

  it('without an API key: asks for one and creates no empty chat', async () => {
    const { conversations } = await setup();
    mockApiKey = null;
    const res = await useChatStore.getState().send('hello');
    expect(res.status).toBe('no_key');
    expect(useChatStore.getState().notice).toMatchObject({ tone: 'error', action: 'settings' });
    expect(useChatStore.getState().busy).toBe(false);
    expect(await conversations.list()).toEqual([]);
  });

  it('typed and spoken turns build one append-only conversation', async () => {
    const { conversations } = await setup();
    mockReplies.push('Noted.', 'Next service at 10,000 km.');

    const first = await useChatStore.getState().send('Note that the car service is due');
    expect(first).toEqual({ status: 'done', replyText: 'Noted.' });

    const second = await useChatStore.getState().send('When is the car service?', { voice: true });
    expect(second).toEqual({ status: 'done', replyText: 'Next service at 10,000 km.' });

    // The second request starts with everything the first one sent and received.
    expect(mockRequests[1].slice(0, 3)).toEqual([...mockRequests[0], expect.objectContaining({ role: 'assistant' })]);
    // The voice turn tells Claude to keep it short.
    expect(String(mockRequests[1].at(-1)!.content)).toMatch(/speaking by voice/);

    // What the store holds is exactly what the database holds.
    const id = useChatStore.getState().conversationId!;
    const stored = (await conversations.messages(id)).map((m) => ({ role: m.role, content: m.content }));
    expect(stored).toEqual(useChatStore.getState().messages);
    expect(stored).toHaveLength(6);
  });

  it('reopening a conversation restores it exactly', async () => {
    await setup();
    await useChatStore.getState().send('hello');
    const id = useChatStore.getState().conversationId!;
    const before = useChatStore.getState().messages;
    await useChatStore.getState().open(null);
    expect(useChatStore.getState().messages).toEqual([]);
    await useChatStore.getState().open(id);
    expect(useChatStore.getState().messages).toEqual(before);
  });

  it('knows whether Nova read a given note in this chat', () => {
    const history = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'search_notes', input: { query: 'car' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"count":1,"notes":[{"id":7,"title":"Car"}]}' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'read_file', input: { id: 9 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: '{"id":9,"text":"..."}' }] },
    ] as MessageParam[];
    expect(conversationMentionsNote(history, 7)).toBe(true);
    // id 9 is a file, not a note
    expect(conversationMentionsNote(history, 9)).toBe(false);
  });

  it('extracts reply text without placeholders or thinking', () => {
    expect(
      replyTextOf({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'text', text: ' Done. ' },
        ],
      } as MessageParam),
    ).toBe('Done.');
    expect(replyTextOf({ role: 'assistant', content: [{ type: 'text', text: '[Nova stopped before replying.]' }] })).toBe('');
    expect(replyTextOf({ role: 'user', content: 'hi' })).toBe('');
  });
});
