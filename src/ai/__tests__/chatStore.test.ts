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

import { replyTextOf, useChatStore } from '../chatStore';

type MessageParam = Anthropic.Beta.BetaMessageParam;

const mockRequests: MessageParam[][] = [];
const mockReplies: string[] = [];

jest.mock('@/services/secrets', () => ({ getApiKey: async () => 'sk-ant-test' }));
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
