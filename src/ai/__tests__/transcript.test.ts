import { NO_REPLY_STOPPED } from '../agent';
import { buildTranscript, describeTool } from '../transcript';

describe('buildTranscript', () => {
  it('shows bubbles and tool cards, hides thinking, system and compaction', () => {
    const items = buildTranscript([
      { role: 'user', content: 'Play something by Arijit Singh' },
      { role: 'system', content: 'Current date and time…' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 's' },
          { type: 'tool_use', id: 't1', name: 'play_music', input: { query: 'Arijit Singh', shuffle: true } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"playing":8,"shuffle":true,"first":{"title":"Kesariya"}}' }],
      },
      { role: 'assistant', content: [{ type: 'compaction', content: 'summary' }, { type: 'text', text: 'Playing 8 songs.' }] },
    ]);

    expect(items.map((i) => i.kind)).toEqual(['user', 'tool', 'assistant']);
    const tool = items[1];
    expect(tool.kind === 'tool' && tool.result).toEqual({ playing: 8, shuffle: true, first: { title: 'Kesariya' } });
    expect(items[2]).toMatchObject({ kind: 'assistant', text: 'Playing 8 songs.' });
  });

  it('marks running tools and stopped turns', () => {
    const items = buildTranscript([
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'read_file', input: { id: 2 } }] },
      { role: 'assistant', content: [{ type: 'text', text: NO_REPLY_STOPPED }] },
    ]);
    expect(items[1]).toMatchObject({ kind: 'tool' });
    expect(items[1].kind === 'tool' && items[1].result).toBeUndefined();
    expect(items[2]).toMatchObject({ kind: 'note', text: 'Stopped before Nova replied.' });
  });
});

describe('describeTool', () => {
  it('labels results', () => {
    expect(describeTool('create_note', {}, { id: 4, title: 'Meeting with Raj' })).toMatchObject({
      label: 'Created note',
      detail: 'Meeting with Raj',
      link: { pathname: '/note/[id]', id: 4 },
    });
    expect(describeTool('play_music', {}, { playing: 8, shuffle: true, first: { title: 'Kesariya' } })).toMatchObject({
      label: 'Started playback · shuffle on',
      detail: 'Kesariya + 7 more',
    });
    expect(describeTool('search_music', { query: 'Arijit Singh' }, { count: 8 }).label).toBe('Searched music · “Arijit Singh”');
    expect(describeTool('read_file', {}, { id: 3, name: 'Resume_2026.pdf', pages: 2, truncated: false })).toMatchObject({
      detail: 'Resume_2026.pdf · 2 pages',
    });
    expect(describeTool('delete_note', {}, { deleted: false })).toMatchObject({ label: 'Not deleted' });
  });

  it('labels running and failed calls', () => {
    expect(describeTool('search_notes', { query: 'car' })).toMatchObject({ label: 'Searching notes…', detail: 'car' });
    expect(describeTool('get_note', {}, { error: 'No note with id 9' }, true)).toMatchObject({
      label: 'Couldn’t complete',
      detail: 'No note with id 9',
    });
  });
});
