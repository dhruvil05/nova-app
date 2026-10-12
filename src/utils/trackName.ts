/**
 * Best-effort title/artist from a file name, used when a file has no readable tags:
 *   "Arijit Singh - Kesariya.mp3"  -> { artist: "Arijit Singh", title: "Kesariya" }
 *   "03. Kun_Faya_Kun.m4a"          -> { artist: null, title: "Kun Faya Kun" }
 */
export function parseTrackFilename(filename: string): { title: string; artist: string | null } {
  let base = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  base = base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  // Leading track numbers: "03 ", "03. ", "03 - ", "3-"
  base = base.replace(/^\d{1,3}\s*[.\-)]?\s+/, '').replace(/^\d{1,3}\s*-\s*/, '');

  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(' - ').trim()) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: null, title: base || filename };
}

/** "4:28", or "1:02:05" for long tracks. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '–:––';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}
