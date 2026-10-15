import type Anthropic from '@anthropic-ai/sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConversationsRepo, useFilesRepo, useNotesRepo, useSettingsRepo, useTracksRepo } from '@/db/hooks';
import { saveTextFile } from '@/services/fileStore';
import { getApiKey } from '@/services/secrets';
import { useChatSession } from '@/store/chatSession';
import { useNotesVersion } from '@/store/notesVersion';

import { runTurn, type AgentEvent } from './agent';
import { createAppToolContext } from './appToolContext';
import { createLlm, describeApiError, isRetryableStreamError } from './llm';
import { resolveModel } from './models';
import { buildTranscript, type ChatItem } from './transcript';

type MessageParam = Anthropic.Beta.BetaMessageParam;

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
};

export type Notice = { tone: 'info' | 'error'; text: string; action?: 'settings' };

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

/** State and actions for the AI chat screen. */
export function useChat() {
  const conversations = useConversationsRepo();
  const notes = useNotesRepo();
  const files = useFilesRepo();
  const tracks = useTracksRepo();
  const settings = useSettingsRepo();
  const conversationId = useChatSession((s) => s.conversationId);
  const setConversation = useChatSession((s) => s.setConversation);

  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [liveTools, setLiveTools] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const messagesRef = useRef<MessageParam[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const confirmRef = useRef<ConfirmRequest | null>(null);
  // The conversation this hook created itself; don't reload it from the database.
  const ownConversation = useRef<number | null>(null);

  // Load the selected conversation (or clear for a new chat).
  useEffect(() => {
    if (busy) return;
    if (conversationId !== null && conversationId === ownConversation.current) return;
    let cancelled = false;
    (async () => {
      const [stored, convo] =
        conversationId === null
          ? [[], null]
          : await Promise.all([conversations.messages(conversationId), conversations.get(conversationId)]);
      if (cancelled) return;
      const loaded = stored.map((m) => ({ role: m.role, content: m.content }) as MessageParam);
      messagesRef.current = loaded;
      ownConversation.current = conversationId;
      setMessages(loaded);
      setTitle(convo?.title ?? null);
      setNotice(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversations, busy]);

  const answerConfirm = useCallback((ok: boolean) => {
    confirmRef.current?.resolve(ok);
    confirmRef.current = null;
    setConfirm(null);
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;
      setNotice(null);

      const apiKey = await getApiKey();
      if (!apiKey) {
        setNotice({ tone: 'error', text: 'Add your Claude API key in Settings to start chatting.', action: 'settings' });
        return;
      }
      const model = resolveModel(await settings.get('ai.model'));

      let convId = conversationId;
      if (convId === null) {
        const convo = await conversations.create(titleFrom(text));
        convId = convo.id;
        ownConversation.current = convId;
        setTitle(convo.title);
        setConversation(convId);
      }
      const targetConv = convId;

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setStreamingText('');
      setLiveTools([]);

      const onEvent = (e: AgentEvent) => {
        if (e.type === 'message') {
          messagesRef.current = [...messagesRef.current, e.message];
          setMessages(messagesRef.current);
          if (e.message.role === 'assistant') {
            setStreamingText('');
            setLiveTools([]);
          }
        } else if (e.type === 'request_start') {
          setStreamingText('');
        } else if (e.type === 'text') {
          setStreamingText((s) => s + e.delta);
        } else if (e.type === 'tool_start') {
          setLiveTools((t) => [...t, { id: e.toolUseId, name: e.name }]);
        }
      };

      const tools = createAppToolContext({
        notes,
        files,
        tracks,
        confirm: (req) =>
          new Promise<boolean>((resolve) => {
            const request = { ...req, resolve };
            confirmRef.current = request;
            setConfirm(request);
          }),
      });

      try {
        const outcome = await runTurn({
          llm: createLlm(apiKey, model),
          history: messagesRef.current,
          userText: text,
          tools,
          persist: async (m) => {
            await conversations.append(targetConv, m.role, m.content);
          },
          onEvent,
          signal: controller.signal,
          isParseError: isRetryableStreamError,
        });
        if (outcome.status === 'error') {
          setNotice({ tone: 'error', text: describeApiError(outcome.error) });
        } else if (outcome.status === 'refusal') {
          setNotice({ tone: 'info', text: 'Nova can’t help with that request.' });
        } else if (outcome.status === 'truncated') {
          setNotice({ tone: 'info', text: 'The reply was too long and got cut off. Try asking for less at once.' });
        } else if (outcome.status === 'step_limit') {
          setNotice({ tone: 'info', text: 'Nova stopped after 5 steps. Ask again to continue.' });
        }
      } catch (error) {
        setNotice({ tone: 'error', text: describeApiError(error) });
      } finally {
        abortRef.current = null;
        setBusy(false);
        setStreamingText('');
        setLiveTools([]);
      }
    },
    [busy, conversationId, conversations, files, notes, setConversation, settings, tracks],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    answerConfirm(false);
  }, [answerConfirm]);

  const newChat = useCallback(() => {
    if (busy) return;
    ownConversation.current = null;
    setConversation(null);
  }, [busy, setConversation]);

  // Never leave a confirmation hanging if the screen goes away.
  useEffect(() => () => confirmRef.current?.resolve(false), []);

  const saveAsNote = useCallback(
    async (text: string) => {
      await notes.create({ title: titleFrom(text), body: text, createdBy: 'ai' });
      useNotesVersion.getState().bump();
      setNotice({ tone: 'info', text: 'Saved to Notes.' });
    },
    [notes],
  );

  const saveAsFile = useCallback(
    async (text: string) => {
      const record = await saveTextFile(files, titleFrom(text), text, 'ai');
      setNotice({ tone: 'info', text: `Saved to Files as ${record.name}.` });
    },
    [files],
  );

  const items: ChatItem[] = useMemo(() => buildTranscript(messages), [messages]);

  return {
    items,
    title,
    streamingText,
    liveTools,
    busy,
    notice,
    dismissNotice: () => setNotice(null),
    confirm,
    answerConfirm,
    send,
    stop,
    newChat,
    saveAsNote,
    saveAsFile,
  };
}
