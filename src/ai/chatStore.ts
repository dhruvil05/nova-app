import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';

import type { ConversationsRepo } from '@/db/conversationsRepo';
import type { FilesRepo } from '@/db/filesRepo';
import type { NotesRepo } from '@/db/notesRepo';
import type { SettingsRepo } from '@/db/settingsRepo';
import type { TracksRepo } from '@/db/tracksRepo';
import { saveTextFile } from '@/services/fileStore';
import { getApiKey } from '@/services/secrets';
import { useNotesVersion } from '@/store/notesVersion';

import { NO_REPLY_ERROR, NO_REPLY_STOPPED, runTurn, type AgentEvent, type TurnOutcome } from './agent';
import { createAppToolContext } from './appToolContext';
import { createLlm, describeApiError, isRetryableStreamError } from './llm';
import { resolveModel } from './models';

/**
 * The one chat engine in the app. The AI tab and the voice screen both talk to
 * this store, so they always share one conversation history - two copies would
 * drift apart, and Claude needs every request to extend the previous one exactly.
 */

type MessageParam = Anthropic.Beta.BetaMessageParam;

export type ChatDeps = {
  conversations: ConversationsRepo;
  notes: NotesRepo;
  files: FilesRepo;
  tracks: TracksRepo;
  settings: SettingsRepo;
};

export type ConfirmRequest = { title: string; message: string; confirmLabel: string };
export type Notice = { tone: 'info' | 'error'; text: string; action?: 'settings' };
export type SendResult = { status: TurnOutcome['status'] | 'no_key' | 'busy'; replyText: string };

type ChatState = {
  deps: ChatDeps | null;
  conversationId: number | null;
  title: string | null;
  messages: MessageParam[];
  streamingText: string;
  liveTools: { id: string; name: string }[];
  busy: boolean;
  notice: Notice | null;
  confirm: ConfirmRequest | null;

  bind(deps: ChatDeps): void;
  open(conversationId: number | null): Promise<void>;
  send(text: string, opts?: { voice?: boolean }): Promise<SendResult>;
  stop(): void;
  answerConfirm(ok: boolean): void;
  dismissNotice(): void;
  saveAsNote(text: string): Promise<void>;
  saveAsFile(text: string): Promise<void>;
};

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

/** The visible text of an assistant message (placeholders excluded). */
export function replyTextOf(message: MessageParam): string {
  if (message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  return (message.content as { type: string; text?: string }[])
    .filter((b) => b.type === 'text' && b.text && b.text !== NO_REPLY_STOPPED && b.text !== NO_REPLY_ERROR)
    .map((b) => b.text!.trim())
    .join('\n')
    .trim();
}

// Not React state: the abort handle and the pending confirmation's resolver.
let abortController: AbortController | null = null;
let confirmResolver: ((ok: boolean) => void) | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  deps: null,
  conversationId: null,
  title: null,
  messages: [],
  streamingText: '',
  liveTools: [],
  busy: false,
  notice: null,
  confirm: null,

  bind(deps) {
    if (get().deps?.conversations !== deps.conversations) set({ deps });
  },

  async open(conversationId) {
    const { deps, busy } = get();
    if (busy || !deps) return;
    if (conversationId === null) {
      set({ conversationId: null, title: null, messages: [], notice: null });
      return;
    }
    const [stored, convo] = await Promise.all([
      deps.conversations.messages(conversationId),
      deps.conversations.get(conversationId),
    ]);
    set({
      conversationId,
      title: convo?.title ?? null,
      messages: stored.map((m) => ({ role: m.role, content: m.content }) as MessageParam),
      notice: null,
    });
  },

  async send(rawText, opts) {
    const text = rawText.trim();
    const { deps, busy } = get();
    if (!text || !deps) return { status: 'error', replyText: '' };
    if (busy) return { status: 'busy', replyText: '' };
    set({ notice: null });

    const apiKey = await getApiKey();
    if (!apiKey) {
      set({ notice: { tone: 'error', text: 'Add your Claude API key in Settings to start chatting.', action: 'settings' } });
      return { status: 'no_key', replyText: '' };
    }
    const model = resolveModel(await deps.settings.get('ai.model'));

    let convId = get().conversationId;
    if (convId === null) {
      const convo = await deps.conversations.create(titleFrom(text));
      convId = convo.id;
      set({ conversationId: convId, title: convo.title });
    }
    const targetConv = convId;

    abortController = new AbortController();
    set({ busy: true, streamingText: '', liveTools: [] });
    let lastReply = '';

    const onEvent = (e: AgentEvent) => {
      if (e.type === 'message') {
        set((s) => ({ messages: [...s.messages, e.message] }));
        if (e.message.role === 'assistant') {
          const reply = replyTextOf(e.message);
          if (reply) lastReply = reply;
          set({ streamingText: '', liveTools: [] });
        }
      } else if (e.type === 'request_start') {
        set({ streamingText: '' });
      } else if (e.type === 'text') {
        set((s) => ({ streamingText: s.streamingText + e.delta }));
      } else if (e.type === 'tool_start') {
        set((s) => ({ liveTools: [...s.liveTools, { id: e.toolUseId, name: e.name }] }));
      }
    };

    const tools = createAppToolContext({
      notes: deps.notes,
      files: deps.files,
      tracks: deps.tracks,
      confirm: (req) =>
        new Promise<boolean>((resolve) => {
          confirmResolver = resolve;
          set({ confirm: req });
        }),
    });

    let outcome: TurnOutcome;
    try {
      outcome = await runTurn({
        llm: createLlm(apiKey, model),
        history: get().messages,
        userText: text,
        tools,
        persist: async (m) => {
          await deps.conversations.append(targetConv, m.role, m.content);
        },
        onEvent,
        signal: abortController.signal,
        isParseError: isRetryableStreamError,
        voice: opts?.voice,
      });
    } catch (error) {
      outcome = { status: 'error', error };
    }

    let notice: Notice | null = null;
    if (outcome.status === 'error') notice = { tone: 'error', text: describeApiError(outcome.error) };
    else if (outcome.status === 'refusal') notice = { tone: 'info', text: 'Nova can’t help with that request.' };
    else if (outcome.status === 'truncated') notice = { tone: 'info', text: 'The reply was too long and got cut off. Try asking for less at once.' };
    else if (outcome.status === 'step_limit') notice = { tone: 'info', text: 'Nova stopped after 5 steps. Ask again to continue.' };

    abortController = null;
    set({ busy: false, streamingText: '', liveTools: [], notice });
    return { status: outcome.status, replyText: lastReply };
  },

  stop() {
    abortController?.abort();
    get().answerConfirm(false);
  },

  answerConfirm(ok) {
    confirmResolver?.(ok);
    confirmResolver = null;
    set({ confirm: null });
  },

  dismissNotice() {
    set({ notice: null });
  },

  async saveAsNote(text) {
    const { deps } = get();
    if (!deps) return;
    await deps.notes.create({ title: titleFrom(text), body: text, createdBy: 'ai' });
    useNotesVersion.getState().bump();
    set({ notice: { tone: 'info', text: 'Saved to Notes.' } });
  },

  async saveAsFile(text) {
    const { deps } = get();
    if (!deps) return;
    const record = await saveTextFile(deps.files, titleFrom(text), text, 'ai');
    set({ notice: { tone: 'info', text: `Saved to Files as ${record.name}.` } });
  },
}));
