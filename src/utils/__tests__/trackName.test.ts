import { formatDuration, parseTrackFilename } from '../trackName';

describe('parseTrackFilename', () => {
  it.each([
    ['Arijit Singh - Kesariya.mp3', { artist: 'Arijit Singh', title: 'Kesariya' }],
    ['03. Kun_Faya_Kun.m4a', { artist: null, title: 'Kun Faya Kun' }],
    ['01 - A. R. Rahman - Jai Ho.flac', { artist: 'A. R. Rahman', title: 'Jai Ho' }],
    ['voice-memo.ogg', { artist: null, title: 'voice-memo' }],
    ['Rehearsal take 3.wav', { artist: null, title: 'Rehearsal take 3' }],
  ])('%s', (input, expected) => {
    expect(parseTrackFilename(input)).toEqual(expected);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(268_000)).toBe('4:28');
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('–:––');
  });
});
