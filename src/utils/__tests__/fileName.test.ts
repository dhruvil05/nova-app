import { formatFileSize } from '../fileSize';
import { renamedFileName, sanitizeFileName, splitExtension, textFileName } from '../fileName';

describe('file names', () => {
  it('splits extensions', () => {
    expect(splitExtension('a.b.pdf')).toEqual({ base: 'a.b', ext: '.pdf' });
    expect(splitExtension('.hidden')).toEqual({ base: '.hidden', ext: '' });
    expect(splitExtension('README')).toEqual({ base: 'README', ext: '' });
  });

  it('removes unsafe characters and never returns an empty name', () => {
    expect(sanitizeFileName('a/b:c*?.txt')).toBe('a b c.txt');
    expect(sanitizeFileName('   ')).toBe('Untitled');
    expect(sanitizeFileName('...pdf')).toBe('pdf');
    expect(sanitizeFileName('x'.repeat(300) + '.pdf')).toHaveLength(120);
  });

  it('keeps the original extension when renaming', () => {
    expect(renamedFileName('Resume_2026.pdf', 'My CV')).toBe('My CV.pdf');
    expect(renamedFileName('Resume_2026.pdf', 'My CV.pdf')).toBe('My CV.pdf');
    expect(renamedFileName('notes.txt', 'plan.docx')).toBe('plan.docx.txt');
  });

  it('names AI text files', () => {
    expect(textFileName('Leave application')).toBe('Leave application.txt');
    expect(textFileName('summary.md')).toBe('summary.md');
    expect(textFileName('')).toBe('Nova note.txt');
  });
});

describe('formatFileSize', () => {
  it.each([
    [null, ''],
    [512, '512 B'],
    [2048, '2 KB'],
    [188_416, '184 KB'],
    [2_202_009, '2.1 MB'],
    [52_428_800, '50 MB'],
  ] as [number | null, string][])('%s bytes -> %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
