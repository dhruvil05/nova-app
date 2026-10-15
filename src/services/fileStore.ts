import { extractPdfText } from '@modules/pdf-text';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

import { MIME, kindOf, type FileAuthor, type FileRecord, type FilesRepo } from '@/db/filesRepo';
import { useFilesStore } from '@/store/files';
import { renamedFileName, sanitizeFileName, splitExtension, textFileName } from '@/utils/fileName';

import { extractDocxFromBytes } from './extract/docx';
import { cleanPdfText, isScannedPdf } from './extract/pdfText';

/** Picker filter: the three types Nova can read (spec 10.3), plus Markdown. */
const PICKER_TYPES = [MIME.pdf, MIME.docx, MIME.txt, 'text/markdown'];
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function filesDir(): Directory {
  const dir = new Directory(Paths.document, 'files');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** "Resume.pdf" -> "Resume (2).pdf" when the name is taken. */
function uniqueFile(dir: Directory, name: string): File {
  const { base, ext } = splitExtension(name);
  let candidate = new File(dir, name);
  for (let n = 2; candidate.exists; n++) candidate = new File(dir, `${base} (${n})${ext}`);
  return candidate;
}

function mimeFor(name: string, reported: string | null | undefined): string | null {
  const kind = kindOf(name, reported ?? null);
  if (kind === 'pdf') return MIME.pdf;
  if (kind === 'docx') return MIME.docx;
  if (kind === 'txt') return /\.md$/i.test(name) ? 'text/markdown' : MIME.txt;
  return reported ?? null;
}

export type ImportResult = { imported: FileRecord[]; skipped: string[] };

/**
 * Lets the user pick PDF/DOCX/TXT files, copies them into the app's private
 * storage (so they survive the originals being deleted), and queues text extraction.
 */
export async function importFiles(repo: FilesRepo): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return { imported: [], skipped: [] };

  const dir = filesDir();
  const imported: FileRecord[] = [];
  const skipped: string[] = [];

  for (const asset of picked.assets) {
    const name = sanitizeFileName(asset.name);
    // Some file providers report .docx as application/octet-stream; trust the extension.
    if (kindOf(name, asset.mimeType ?? null) === 'other') {
      skipped.push(asset.name);
      continue;
    }
    const dest = uniqueFile(dir, name);
    const cached = new File(asset.uri);
    await cached.move(dest);
    imported.push(
      await repo.create({
        name: dest.name,
        uri: dest.uri,
        mimeType: mimeFor(dest.name, asset.mimeType),
        size: dest.size ?? asset.size ?? null,
      }),
    );
  }

  useFilesStore.getState().bump();
  void processPendingExtractions(repo);
  return { imported, skipped };
}

let queueRunning = false;

/**
 * Extracts text for every file still marked 'pending', one at a time (keeps memory
 * low with big PDFs). Safe to call repeatedly; also resumes work left over if the
 * app was closed mid-import.
 */
export async function processPendingExtractions(repo: FilesRepo): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  const store = useFilesStore.getState();
  try {
    for (;;) {
      const [next] = await repo.listPending();
      if (!next) break;
      store.setProgress(next.id, 0);
      try {
        await extractOne(repo, next, (p) => store.setProgress(next.id, p));
      } catch {
        await repo.setFailed(next.id, 'unreadable');
      } finally {
        store.setProgress(next.id, null);
        store.bump();
      }
    }
  } finally {
    queueRunning = false;
  }
}

async function extractOne(repo: FilesRepo, file: FileRecord, onProgress: (p: number) => void): Promise<void> {
  const source = new File(file.uri);
  if (!source.exists) {
    await repo.setFailed(file.id, 'missing');
    return;
  }

  if (file.kind === 'txt') {
    await repo.setExtracted(file.id, await source.text());
    return;
  }

  if (file.kind === 'docx') {
    await repo.setExtracted(file.id, await extractDocxFromBytes(await source.bytes()));
    return;
  }

  if (file.kind === 'pdf') {
    try {
      const { text, pageCount } = await extractPdfText(file.uri, (page, total) => onProgress(page / total));
      const cleaned = cleanPdfText(text);
      if (isScannedPdf(cleaned, pageCount)) await repo.setFailed(file.id, 'scanned', pageCount);
      else await repo.setExtracted(file.id, cleaned, pageCount);
    } catch (e) {
      const code = (e as { code?: string }).code;
      await repo.setFailed(file.id, code === 'ERR_PDF_PASSWORD' ? 'encrypted' : 'unreadable');
    }
    return;
  }

  await repo.setFailed(file.id, 'unsupported');
}

/** Retry a failed extraction (e.g. after updating the app). */
export async function retryExtraction(repo: FilesRepo, file: FileRecord): Promise<void> {
  await repo.setPending(file.id);
  useFilesStore.getState().bump();
  await processPendingExtractions(repo);
}

/**
 * Saves text the AI wrote (a summary, a draft) as a file in Files, marked as
 * AI-created, with the content stored as its extracted text (spec 10.3: save_file).
 */
export async function saveTextFile(
  repo: FilesRepo,
  requestedName: string,
  content: string,
  createdBy: FileAuthor = 'ai',
): Promise<FileRecord> {
  const dest = uniqueFile(filesDir(), textFileName(requestedName));
  dest.create();
  dest.write(content);
  const record = await repo.create({
    name: dest.name,
    uri: dest.uri,
    mimeType: /\.md$/i.test(dest.name) ? 'text/markdown' : MIME.txt,
    size: dest.size ?? content.length,
    createdBy,
    extractedText: content,
  });
  useFilesStore.getState().bump();
  return record;
}

export class FileNameTakenError extends Error {
  constructor(name: string) {
    super(`A file named “${name}” already exists`);
    this.name = 'FileNameTakenError';
  }
}

/** Renames the stored file (keeping its extension) and returns the new name. */
export async function renameFile(repo: FilesRepo, file: FileRecord, requested: string): Promise<string> {
  const name = renamedFileName(file.name, requested);
  if (name === file.name) return name;
  if (new File(filesDir(), name).exists) throw new FileNameTakenError(name);
  const stored = new File(file.uri);
  stored.rename(name);
  await repo.rename(file.id, name, stored.uri);
  useFilesStore.getState().bump();
  return name;
}

export async function deleteFile(repo: FilesRepo, file: FileRecord): Promise<void> {
  try {
    const stored = new File(file.uri);
    if (stored.exists) stored.delete();
  } catch {
    // Already gone; still remove the row.
  }
  await repo.remove(file.id);
  useFilesStore.getState().bump();
}

export async function shareFile(file: FileRecord): Promise<void> {
  await Sharing.shareAsync(file.uri, {
    mimeType: file.mimeType ?? undefined,
    dialogTitle: `Share ${file.name}`,
  });
}

/** Opens a PDF/DOCX in another app (a PDF viewer, Word, Docs…). Throws if none can. */
export async function openInOtherApp(file: FileRecord): Promise<void> {
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: new File(file.uri).contentUri,
    type: file.mimeType ?? '*/*',
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** Reads a text file's content directly from disk (for the TXT viewer). */
export async function readTextFile(file: FileRecord): Promise<string> {
  return new File(file.uri).text();
}
