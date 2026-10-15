/** Fewer readable characters than this per page means the PDF is scanned images. */
const MIN_CHARS_PER_PAGE = 15;

/**
 * Decides whether a PDF's extracted text is real, or the PDF is scanned pages
 * that need OCR (Phase 7). Counts only visible characters.
 */
export function isScannedPdf(text: string, pageCount: number): boolean {
  const visible = text.replace(/\s+/g, '').length;
  return visible < Math.max(1, pageCount) * MIN_CHARS_PER_PAGE;
}

/** Tidies PDFBox output: unify line endings, drop trailing spaces and runs of blank lines. */
export function cleanPdfText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
