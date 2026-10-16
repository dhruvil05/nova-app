import { isStopCommand } from './speechText';

/**
 * Voice conversation as a small state machine (spec 9.1):
 * listening → thinking (the AI works) → speaking (reply read aloud) →
 * listening again in hands-free mode, otherwise back to idle.
 * Saying "stop", or ~8 seconds of silence, ends a hands-free session.
 *
 * Pure: the voice screen turns phase changes into microphone / speech calls.
 */

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceState = {
  phase: VoicePhase;
  handsFree: boolean;
  /** Live words while the user is still speaking */
  partial: string;
  /** The last thing the user said, as sent to Nova */
  heard: string;
  /** Nova's last reply (full text, shown on screen) */
  reply: string;
  /** Why the session ended, if not by the user's choice */
  message: string | null;
  /** Increments each time listening (re)starts, so the screen knows to start the mic */
  listenId: number;
};

export type VoiceEvent =
  | { type: 'START'; handsFree: boolean }
  | { type: 'PARTIAL'; text: string }
  | { type: 'FINAL'; text: string }
  | { type: 'NO_SPEECH' }
  | { type: 'STT_ERROR'; message: string }
  | { type: 'REPLY'; text: string }
  | { type: 'AGENT_FAILED'; message: string }
  | { type: 'SPEECH_DONE' }
  | { type: 'STOP' }
  | { type: 'SET_HANDS_FREE'; handsFree: boolean };

export const initialVoiceState: VoiceState = {
  phase: 'idle',
  handsFree: false,
  partial: '',
  heard: '',
  reply: '',
  message: null,
  listenId: 0,
};

function listen(state: VoiceState): VoiceState {
  return { ...state, phase: 'listening', partial: '', message: null, listenId: state.listenId + 1 };
}

function end(state: VoiceState, message: string | null = null): VoiceState {
  return { ...state, phase: 'idle', partial: '', message };
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'START':
      return listen({ ...state, handsFree: event.handsFree });

    case 'SET_HANDS_FREE':
      return { ...state, handsFree: event.handsFree };

    case 'STOP':
      return end(state);

    case 'PARTIAL':
      return state.phase === 'listening' ? { ...state, partial: event.text } : state;

    case 'FINAL': {
      if (state.phase !== 'listening') return state;
      const text = event.text.trim();
      if (!text) return end(state, 'I didn’t catch that.');
      if (isStopCommand(text)) return end(state);
      return { ...state, phase: 'thinking', partial: '', heard: text, reply: '' };
    }

    case 'NO_SPEECH':
      if (state.phase !== 'listening') return state;
      // In hands-free mode, silence is how a conversation naturally ends.
      return end(state, state.handsFree ? null : 'I didn’t hear anything.');

    case 'STT_ERROR':
      return state.phase === 'listening' ? end(state, event.message) : state;

    case 'REPLY': {
      if (state.phase !== 'thinking') return state;
      const next = { ...state, reply: event.text };
      if (event.text.trim()) return { ...next, phase: 'speaking' };
      return next.handsFree ? listen(next) : end(next);
    }

    case 'AGENT_FAILED':
      return state.phase === 'thinking' ? end(state, event.message) : state;

    case 'SPEECH_DONE':
      if (state.phase !== 'speaking') return state;
      return state.handsFree ? listen(state) : end(state);
  }
}
