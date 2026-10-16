import { initialVoiceState, voiceReducer, type VoiceEvent, type VoiceState } from '../session';

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) => events.reduce(voiceReducer, from);

describe('voiceReducer', () => {
  it('one question: listen → think → speak → idle', () => {
    let s = run([{ type: 'START', handsFree: false }]);
    expect(s).toMatchObject({ phase: 'listening', listenId: 1 });
    s = run([{ type: 'PARTIAL', text: 'play some' }], s);
    expect(s.partial).toBe('play some');
    s = run([{ type: 'FINAL', text: 'Play some Arijit Singh' }], s);
    expect(s).toMatchObject({ phase: 'thinking', heard: 'Play some Arijit Singh', partial: '' });
    s = run([{ type: 'REPLY', text: 'Playing 8 songs.' }], s);
    expect(s).toMatchObject({ phase: 'speaking', reply: 'Playing 8 songs.' });
    s = run([{ type: 'SPEECH_DONE' }], s);
    expect(s.phase).toBe('idle');
  });

  it('hands-free keeps listening after each reply', () => {
    const s = run([
      { type: 'START', handsFree: true },
      { type: 'FINAL', text: 'What did I note about the car?' },
      { type: 'REPLY', text: 'Next service at 10,000 km.' },
      { type: 'SPEECH_DONE' },
    ]);
    expect(s).toMatchObject({ phase: 'listening', listenId: 2 });
  });

  it('ends hands-free on "stop" or silence', () => {
    expect(run([{ type: 'START', handsFree: true }, { type: 'FINAL', text: 'Stop.' }])).toMatchObject({ phase: 'idle', message: null });
    expect(run([{ type: 'START', handsFree: true }, { type: 'NO_SPEECH' }])).toMatchObject({ phase: 'idle', message: null });
    expect(run([{ type: 'START', handsFree: false }, { type: 'NO_SPEECH' }])).toMatchObject({ phase: 'idle', message: 'I didn’t hear anything.' });
  });

  it('reports errors and ignores events from the wrong phase', () => {
    expect(run([{ type: 'START', handsFree: false }, { type: 'STT_ERROR', message: 'Mic busy' }])).toMatchObject({
      phase: 'idle',
      message: 'Mic busy',
    });
    const thinking = run([{ type: 'START', handsFree: false }, { type: 'FINAL', text: 'hi' }]);
    expect(run([{ type: 'PARTIAL', text: 'late' }, { type: 'SPEECH_DONE' }], thinking)).toEqual(thinking);
    expect(run([{ type: 'AGENT_FAILED', message: 'No internet' }], thinking)).toMatchObject({ phase: 'idle', message: 'No internet' });
  });

  it('skips speaking when there is no reply text', () => {
    const s = run([{ type: 'START', handsFree: true }, { type: 'FINAL', text: 'pause the music' }, { type: 'REPLY', text: '' }]);
    expect(s).toMatchObject({ phase: 'listening', listenId: 2 });
  });

  it('STOP always returns to idle', () => {
    const speaking = run([{ type: 'START', handsFree: true }, { type: 'FINAL', text: 'x' }, { type: 'REPLY', text: 'y' }]);
    expect(run([{ type: 'STOP' }], speaking).phase).toBe('idle');
  });
});
