import { create } from 'zustand';

/** Which conversation the AI tab shows (null = a new, empty chat). */
export const useChatSession = create<{
  conversationId: number | null;
  setConversation: (id: number | null) => void;
}>((set) => ({
  conversationId: null,
  setConversation: (id) => set({ conversationId: id }),
}));
