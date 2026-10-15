import type Anthropic from '@anthropic-ai/sdk';

/**
 * The 12 tools Nova's AI can call (spec 8.2). This list is sent on every request
 * in the same order and must not change during a conversation: the tool set is
 * part of the cached prompt prefix and of what Claude's thinking is bound to.
 *
 * `strict: true` makes Claude's arguments follow the schema exactly; with
 * `eager_input_streaming` the server stops validating them, so every input is
 * re-checked on the phone (./validate.ts) before a tool runs.
 */

type Schema = Anthropic.Beta.BetaTool['input_schema'];

function tool(name: string, description: string, input_schema: Schema): Anthropic.Beta.BetaTool {
  return { name, description, input_schema, strict: true, eager_input_streaming: true };
}

const noInput: Schema = { type: 'object', properties: {}, required: [], additionalProperties: false };

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = [
  // Notes
  tool(
    'create_note',
    'Create a new note in the Notes tab. Use for anything the user asks you to note, remember or write down.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title, a few words' },
        body: { type: 'string', description: 'The note text' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
  ),
  tool(
    'search_notes',
    "Search the user's notes by words in the title or body. Returns up to 10 matches with a short snippet and id. Private notes are never included.",
    {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words to search for' } },
      required: ['query'],
      additionalProperties: false,
    },
  ),
  tool('get_note', 'Read one note in full by its id (from search_notes).', {
    type: 'object',
    properties: { id: { type: 'integer' } },
    required: ['id'],
    additionalProperties: false,
  }),
  tool(
    'update_note',
    'Change the title and/or body of an existing note. To add to a note, read it first and send the full new body.',
    {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  ),
  tool(
    'delete_note',
    'Delete a note. The app shows the user a confirmation first; the result says whether they confirmed.',
    {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  ),

  // Music
  tool(
    'search_music',
    "Search the user's music library by song title, artist or album (typo-tolerant). Returns up to 10 songs with ids.",
    {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  ),
  tool(
    'play_music',
    'Replace the play queue and start playing. Give track_ids from search_music, or a query to play the best matches directly.',
    {
      type: 'object',
      properties: {
        track_ids: { type: 'array', items: { type: 'integer' }, description: 'Songs to play, in order' },
        query: { type: 'string', description: 'Used when track_ids is not given' },
        shuffle: { type: 'boolean' },
      },
      required: [],
      additionalProperties: false,
    },
  ),
  tool('control_playback', 'Pause, resume, or skip to the next or previous song.', {
    type: 'object',
    properties: { action: { type: 'string', enum: ['pause', 'resume', 'next', 'previous'] } },
    required: ['action'],
    additionalProperties: false,
  }),
  tool('now_playing', 'Get the song currently loaded in the player, and whether it is playing.', noInput),

  // Files
  tool(
    'list_files',
    "List the user's files (PDF, DOCX, TXT) with id, type, size and whether their text can be read. Optionally filter by name.",
    {
      type: 'object',
      properties: { query: { type: 'string', description: 'Part of the file name' } },
      required: [],
      additionalProperties: false,
    },
  ),
  tool(
    'read_file',
    "Read a file's extracted text by id (from list_files). Long files are cut to max_chars; the result says if it was shortened.",
    {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        max_chars: { type: 'integer', description: 'Default 20000, at most 60000' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  ),
  tool(
    'save_file',
    'Save text you wrote (a summary, draft, letter or list) as a .txt or .md file in the Files tab, marked as created by Nova.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name, e.g. "Leave application"' },
        content: { type: 'string' },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
  ),
];

export type ToolName =
  | 'create_note'
  | 'search_notes'
  | 'get_note'
  | 'update_note'
  | 'delete_note'
  | 'search_music'
  | 'play_music'
  | 'control_playback'
  | 'now_playing'
  | 'list_files'
  | 'read_file'
  | 'save_file';

export const TOOL_SCHEMAS: Record<string, Schema> = Object.fromEntries(
  TOOL_DEFINITIONS.map((t) => [t.name, t.input_schema]),
);
