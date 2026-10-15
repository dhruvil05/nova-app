import JSZip from 'jszip';

import { docxXmlToText } from './docxText';

/** Text of a .docx from its raw bytes. Throws if it isn't a Word document. */
export async function extractDocxFromBytes(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Not a Word document (word/document.xml missing)');
  return docxXmlToText(await entry.async('string'));
}
