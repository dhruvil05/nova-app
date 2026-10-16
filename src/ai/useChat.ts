import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useConversationsRepo, useFilesRepo, useNotesRepo, useSettingsRepo, useTracksRepo } from '@/db/hooks';

import { useChatStore } from './chatStore';
import { buildTranscript, type ChatItem } from './transcript';

/** Connects the shared chat engine to the database (call from any screen that uses chat). */
export function useBindChat() {
  const conversations = useConversationsRepo();
  const notes = useNotesRepo();
  const files = useFilesRepo();
  const tracks = useTracksRepo();
  const settings = useSettingsRepo();
  useEffect(() => {
    useChatStore.getState().bind({ conversations, notes, files, tracks, settings });
  }, [conversations, notes, files, tracks, settings]);
}

/** State and actions for the AI chat screen. */
export function useChat() {
  useBindChat();
  const state = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      title: s.title,
      streamingText: s.streamingText,
      liveTools: s.liveTools,
      busy: s.busy,
      notice: s.notice,
      confirm: s.confirm,
      conversationId: s.conversationId,
    })),
  );
  const items: ChatItem[] = useMemo(() => buildTranscript(state.messages), [state.messages]);
  const actions = useChatStore.getState();

  return {
    ...state,
    items,
    send: (text: string) => actions.send(text),
    stop: actions.stop,
    newChat: () => actions.open(null),
    answerConfirm: actions.answerConfirm,
    dismissNotice: actions.dismissNotice,
    saveAsNote: actions.saveAsNote,
    saveAsFile: actions.saveAsFile,
  };
}
