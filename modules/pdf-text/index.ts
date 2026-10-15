import { NativeModule, requireOptionalNativeModule } from 'expo';

export type PdfProgressEvent = { jobId: string; page: number; total: number };

type PdfTextEvents = { onProgress: (e: PdfProgressEvent) => void };

declare class PdfTextNativeModule extends NativeModule<PdfTextEvents> {
  extractTextAsync(fileUri: string, jobId: string): Promise<{ text: string; pageCount: number }>;
}

// Optional so the app (and tests) still load where the native code isn't built in.
const PdfText = requireOptionalNativeModule<PdfTextNativeModule>('PdfText');

export const isPdfTextAvailable = PdfText != null;

let nextJob = 0;

/**
 * Extracts the text of a PDF at a `file://` URI inside app storage.
 * Errors carry a `code`: ERR_PDF_PASSWORD, ERR_PDF_NOT_FOUND, ERR_PDF_UNREADABLE.
 */
export async function extractPdfText(
  fileUri: string,
  onProgress?: (page: number, total: number) => void,
): Promise<{ text: string; pageCount: number }> {
  if (!PdfText) throw new Error('PDF reading needs the Nova development build');
  const jobId = `${Date.now()}-${nextJob++}`;
  const sub = onProgress
    ? PdfText.addListener('onProgress', (e) => {
        if (e.jobId === jobId) onProgress(e.page, e.total);
      })
    : null;
  try {
    return await PdfText.extractTextAsync(fileUri, jobId);
  } finally {
    sub?.remove();
  }
}
