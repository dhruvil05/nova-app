import type { IconName } from '@/components/Icon';

import { NO_REPLY_ERROR, NO_REPLY_STOPPED } from './agent';

/**
 * Turns stored API messages into what the chat screen shows: user and assistant
 * bubbles, a card per tool call, and quiet notes. Thinking, compaction and the
 * per-turn context system messages are never shown.
 */

export type ChatItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | {
      kind: 'tool';
      key: string;
      name: string;
      input: Record<string, unknown>;
      /** Parsed tool result, or undefined while it is still running */
      result?: Record<string, unknown>;
      isError?: boolean;
    }
  | { kind: 'note'; key: string; text: string };

type Block = { type?: string; [k: string]: unknown };
type StoredLike = { role: string; content: unknown };

function parseResult(content: unknown): Record<string, unknown> {
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? (content as Block[]).map((b) => (typeof b.text === 'string' ? b.text : '')).join('')
        : '';
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return { value: raw };
  }
}

export function buildTranscript(messages: StoredLike[]): ChatItem[] {
  const items: ChatItem[] = [];
  const toolIndex = new Map<string, number>();

  messages.forEach((m, mi) => {
    if (m.role === 'system') return;

    if (typeof m.content === 'string') {
      if (m.role === 'user') items.push({ kind: 'user', key: `u${mi}`, text: m.content });
      else if (m.content.trim()) items.push({ kind: 'assistant', key: `a${mi}`, text: m.content });
      return;
    }
    if (!Array.isArray(m.content)) return;

    (m.content as Block[]).forEach((b, bi) => {
      const key = `${mi}-${bi}`;
      if (b.type === 'text' && typeof b.text === 'string') {
        if (m.role === 'user') {
          if (b.text.trim()) items.push({ kind: 'user', key, text: b.text });
          return;
        }
        if (b.text === NO_REPLY_STOPPED) items.push({ kind: 'note', key, text: 'Stopped before Nova replied.' });
        else if (b.text === NO_REPLY_ERROR) items.push({ kind: 'note', key, text: 'Nova couldn’t reply to this message.' });
        else if (b.text.trim()) items.push({ kind: 'assistant', key, text: b.text.trim() });
      } else if (b.type === 'tool_use' && typeof b.id === 'string') {
        toolIndex.set(b.id, items.length);
        items.push({
          kind: 'tool',
          key: b.id,
          name: String(b.name),
          input: (b.input as Record<string, unknown>) ?? {},
        });
      } else if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        const i = toolIndex.get(b.tool_use_id);
        const item = i === undefined ? undefined : items[i];
        if (item?.kind === 'tool') {
          items[i!] = { ...item, result: parseResult(b.content), isError: b.is_error === true };
        }
      }
    });
  });

  return items;
}

export type ToolCardInfo = {
  icon: IconName;
  /** Small grey line: what happened */
  label: string;
  /** Main line: the thing it happened to */
  detail: string;
  /** Screen to open from the card */
  link?: { pathname: '/note/[id]' | '/file/[id]'; id: number } | { pathname: '/player' };
};

const RUNNING: Record<string, string> = {
  create_note: 'Creating note…',
  search_notes: 'Searching notes…',
  get_note: 'Reading note…',
  update_note: 'Updating note…',
  delete_note: 'Waiting for your OK…',
  search_music: 'Searching music…',
  play_music: 'Starting music…',
  control_playback: 'Controlling playback…',
  now_playing: 'Checking the player…',
  list_files: 'Looking at files…',
  read_file: 'Reading file…',
  save_file: 'Saving file…',
};

const ICONS: Record<string, IconName> = {
  create_note: 'note',
  search_notes: 'search',
  get_note: 'note',
  update_note: 'edit',
  delete_note: 'trash',
  search_music: 'search',
  play_music: 'music',
  control_playback: 'music',
  now_playing: 'music',
  list_files: 'folder',
  read_file: 'folder',
  save_file: 'folder',
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Text for a tool card, e.g. { label: 'Created note', detail: 'Meeting with Raj' }. */
export function describeTool(
  name: string,
  input: Record<string, unknown>,
  result?: Record<string, unknown>,
  isError?: boolean,
): ToolCardInfo {
  const icon = ICONS[name] ?? 'sparkles';
  if (!result) return { icon, label: RUNNING[name] ?? 'Working…', detail: str(input.title) || str(input.query) || str(input.name) || '' };
  if (isError) return { icon, label: 'Couldn’t complete', detail: str(result.error) || 'Something went wrong' };

  const r = result;
  switch (name) {
    case 'create_note':
      return { icon, label: 'Created note', detail: str(r.title), link: num(r.id) ? { pathname: '/note/[id]', id: num(r.id)! } : undefined };
    case 'update_note':
      return { icon, label: 'Updated note', detail: str(r.title), link: num(r.id) ? { pathname: '/note/[id]', id: num(r.id)! } : undefined };
    case 'get_note':
      return { icon, label: 'Read note', detail: str(r.title) || 'Untitled', link: num(r.id) ? { pathname: '/note/[id]', id: num(r.id)! } : undefined };
    case 'delete_note':
      return r.deleted ? { icon, label: 'Deleted note', detail: str(r.title) } : { icon, label: 'Not deleted', detail: 'You chose to keep it' };
    case 'search_notes':
      return { icon, label: `Searched notes · “${str(input.query)}”`, detail: plural(num(r.count) ?? 0, 'note found', 'notes found') };
    case 'search_music':
      return { icon, label: `Searched music · “${str(input.query)}”`, detail: plural(num(r.count) ?? 0, 'song found', 'songs found') };
    case 'play_music': {
      const first = (r.first ?? {}) as Record<string, unknown>;
      const count = num(r.playing) ?? 0;
      return {
        icon,
        label: `Started playback${r.shuffle ? ' · shuffle on' : ''}`,
        detail: count > 1 ? `${str(first.title)} + ${count - 1} more` : str(first.title),
        link: { pathname: '/player' },
      };
    }
    case 'control_playback': {
      const labels: Record<string, string> = { pause: 'Paused', resume: 'Resumed', next: 'Skipped to next song', previous: 'Went back a song' };
      return { icon, label: 'Player', detail: labels[str(input.action)] ?? 'Done', link: { pathname: '/player' } };
    }
    case 'now_playing': {
      const t = r.track as Record<string, unknown> | null;
      return { icon, label: 'Checked the player', detail: t ? str(t.title) : 'Nothing playing' };
    }
    case 'list_files':
      return { icon, label: 'Looked at files', detail: plural(num(r.count) ?? 0, 'file', 'files') };
    case 'read_file':
      return {
        icon,
        label: r.truncated ? 'Read file (first part)' : 'Read file',
        detail: [str(r.name), num(r.pages) ? plural(num(r.pages)!, 'page', 'pages') : ''].filter(Boolean).join(' · '),
        link: num(r.id) ? { pathname: '/file/[id]', id: num(r.id)! } : undefined,
      };
    case 'save_file':
      return { icon, label: 'Saved file', detail: str(r.name), link: num(r.id) ? { pathname: '/file/[id]', id: num(r.id)! } : undefined };
    default:
      return { icon, label: name, detail: '' };
  }
}
