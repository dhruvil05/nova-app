/**
 * @jest-environment node
 */
import JSZip from 'jszip';

import { extractDocxFromBytes } from '../docx';
import { cleanPdfText, isScannedPdf } from '../pdfText';

async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', `<w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('extractDocxFromBytes', () => {
  it('reads a real zipped .docx', async () => {
    const bytes = await makeDocx(['Leave application', 'Dear Sir/Madam,']);
    await expect(extractDocxFromBytes(bytes)).resolves.toBe('Leave application\nDear Sir/Madam,');
  });

  it('rejects zips that are not Word documents', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(extractDocxFromBytes(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      'Not a Word document',
    );
  });

  it('rejects non-zip bytes', async () => {
    await expect(extractDocxFromBytes(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

describe('PDF text helpers', () => {
  it('flags scanned PDFs (little or no text per page)', () => {
    expect(isScannedPdf('', 3)).toBe(true);
    expect(isScannedPdf(' \n \n 1 \n 2 \n 3 ', 3)).toBe(true);
    expect(isScannedPdf('This page has a real sentence of text on it.', 1)).toBe(false);
    expect(isScannedPdf('x'.repeat(200), 20)).toBe(true);
    expect(isScannedPdf('x'.repeat(400), 20)).toBe(false);
  });

  it('cleans line endings and blank runs', () => {
    expect(cleanPdfText('A  \r\nB\r\n\r\n\r\n\r\nC\n')).toBe('A\nB\n\nC');
  });
});
