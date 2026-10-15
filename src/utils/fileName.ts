/** Characters Android file systems (and share targets) reject in file names. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001F]/g;

export function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' };
}

/** Safe, trimmed file name; never empty, at most ~120 characters. */
export function sanitizeFileName(name: string, fallback = 'Untitled'): string {
  const cleaned = name.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  const { base, ext } = splitExtension(cleaned);
  const safeBase = (base.trim() || fallback).slice(0, 120 - ext.length);
  return `${safeBase}${ext}`;
}

/**
 * A new name for a renamed file that keeps the original extension,
 * e.g. ("Resume_2026.pdf", "My CV") -> "My CV.pdf".
 */
export function renamedFileName(original: string, requested: string): string {
  const { ext } = splitExtension(original);
  const req = requested.trim();
  const reqExt = splitExtension(req).ext;
  const base = reqExt.toLowerCase() === ext.toLowerCase() ? splitExtension(req).base : req;
  return sanitizeFileName(`${base}${ext}`);
}

/** Name for a text file the AI saves: adds .txt unless it already ends in .txt or .md. */
export function textFileName(requested: string): string {
  const name = sanitizeFileName(requested, 'Nova note');
  return /\.(txt|md)$/i.test(name) ? name : `${name}.txt`;
}
