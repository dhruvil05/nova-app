import { isStopCommand, speechLanguageFor, toSpeakable } from '../speechText';

describe('toSpeakable', () => {
  it('removes Markdown, links and emoji', () => {
    expect(toSpeakable('**Done!** Saved [your note](https://x.y) 🎉')).toBe('Done! Saved your note');
    expect(toSpeakable('# Summary\n- Point one\n- Point two')).toBe('Summary. Point one. Point two');
    expect(toSpeakable('Run `npm test` now')).toBe('Run npm test now');
  });

  it('shortens long replies at a sentence boundary', () => {
    const long = 'This is a sentence. '.repeat(60);
    const spoken = toSpeakable(long, 100);
    expect(spoken.length).toBeLessThan(140);
    expect(spoken).toMatch(/sentence\. The rest is on screen\.$/);
  });
});

describe('speechLanguageFor', () => {
  it('picks the voice from the reply’s script', () => {
    expect(speechLanguageFor('Playing 8 songs.', 'en-IN')).toBe('en-IN');
    expect(speechLanguageFor('मैंने नोट बना दिया है।', 'en-IN')).toBe('hi-IN');
    expect(speechLanguageFor('મેં નોંધ બનાવી છે.', 'en-IN')).toBe('gu-IN');
    expect(speechLanguageFor('Okay, done.', 'hi-IN')).toBe('en-IN');
    expect(speechLanguageFor('12:30', 'gu-IN')).toBe('gu-IN');
  });
});

describe('isStopCommand', () => {
  it.each(['stop', 'Stop.', 'Nova stop', 'stop listening', 'okay bye', 'बस', 'રુકો'.replace('રુકો', 'બસ')])('"%s" stops', (t) => {
    expect(isStopCommand(t)).toBe(true);
  });
  it.each(['stop the music', 'play something', 'do not stop'])('"%s" does not', (t) => {
    expect(isStopCommand(t)).toBe(false);
  });
});
