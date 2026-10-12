const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "2:14 pm" */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "8 Oct", or "8 Oct 2025" outside the current year. */
export function formatDay(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** List dates: "Today, 2:14 pm", "Yesterday", "8 Oct". */
export function formatListDate(ts: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ts))) / 86_400_000);
  if (days === 0) return `Today, ${formatTime(ts)}`;
  if (days === 1) return 'Yesterday';
  return formatDay(ts, now);
}

/** Editor meta line: "Edited today, 2:14 pm" / "Edited 8 Oct, 7:30 pm". */
export function formatEdited(ts: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ts))) / 86_400_000);
  const day = days === 0 ? 'today' : days === 1 ? 'yesterday' : formatDay(ts, now);
  return `Edited ${day}, ${formatTime(ts)}`;
}
