/**
 * @jest-environment node
 */
import { createFilesRepo, kindOf, MIME } from '../filesRepo';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrate';
import { createNodeDb } from '../testing/nodeDb';

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  let clock = 0;
  return createFilesRepo(db, () => (clock += 1000));
}

describe('migrations', () => {
  it('upgrades a v1 database to the latest version without losing rows', async () => {
    const db = createNodeDb();
    // Build a v1 database by hand, as an older app version would have.
    await migrate(db);
    await db.execAsync('PRAGMA user_version = 1');
    await db.execAsync('ALTER TABLE files DROP COLUMN page_count; ALTER TABLE files DROP COLUMN extraction_error;');
    await db.runAsync(
      "INSERT INTO files (name, uri, extraction_status, created_at) VALUES ('old.txt', 'file:///old.txt', 'done', 1)",
      [],
    );

    await migrate(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(version?.user_version).toBe(LATEST_SCHEMA_VERSION);
    const repo = createFilesRepo(db);
    expect((await repo.list()).map((f) => f.name)).toEqual(['old.txt']);
  });
});

describe('filesRepo', () => {
  it('stores imported files as pending, then records extracted text', async () => {
    const repo = await setup();
    const file = await repo.create({ name: 'Resume.pdf', uri: 'file:///r.pdf', mimeType: MIME.pdf, size: 1234 });
    expect(file).toMatchObject({ extractionStatus: 'pending', kind: 'pdf', textLength: 0, createdBy: 'user' });
    expect((await repo.listPending()).map((f) => f.id)).toEqual([file.id]);

    await repo.setExtracted(file.id, 'Hello world', 2);
    expect(await repo.get(file.id)).toMatchObject({ extractionStatus: 'done', textLength: 11, pageCount: 2 });
    expect(await repo.listPending()).toEqual([]);
  });

  it('records why extraction failed', async () => {
    const repo = await setup();
    const file = await repo.create({ name: 'Bill.pdf', uri: 'file:///b.pdf' });
    await repo.setFailed(file.id, 'scanned', 3);
    expect(await repo.get(file.id)).toMatchObject({
      extractionStatus: 'failed',
      extractionError: 'scanned',
      pageCount: 3,
    });
  });

  it('marks files with known text (TXT, AI-written) as done immediately', async () => {
    const repo = await setup();
    const file = await repo.create({ name: 'Leave.txt', uri: 'file:///l.txt', createdBy: 'ai', extractedText: 'Dear Sir' });
    expect(file).toMatchObject({ extractionStatus: 'done', createdBy: 'ai', kind: 'txt', textLength: 8 });
  });

  it('cuts long text to maxChars and says so', async () => {
    const repo = await setup();
    const file = await repo.create({ name: 'Big.txt', uri: 'file:///big.txt', extractedText: 'x'.repeat(50) });
    expect(await repo.getText(file.id, 20)).toEqual({ text: 'x'.repeat(20), truncated: true, totalChars: 50 });
    expect(await repo.getText(file.id, 100)).toEqual({ text: 'x'.repeat(50), truncated: false, totalChars: 50 });
    expect(await repo.getText(9999)).toBeNull();
  });

  it('lists newest first and filters by name, type and author', async () => {
    const repo = await setup();
    await repo.create({ name: 'Resume_2026.pdf', uri: 'u1', mimeType: MIME.pdf });
    await repo.create({ name: 'Rental agreement.docx', uri: 'u2', mimeType: MIME.docx });
    await repo.create({ name: 'Leave.txt', uri: 'u3', createdBy: 'ai', extractedText: '' });

    expect((await repo.list()).map((f) => f.name)).toEqual(['Leave.txt', 'Rental agreement.docx', 'Resume_2026.pdf']);
    expect((await repo.list({ query: 'resume' })).map((f) => f.name)).toEqual(['Resume_2026.pdf']);
    expect((await repo.list({ kind: 'docx' })).map((f) => f.name)).toEqual(['Rental agreement.docx']);
    expect((await repo.list({ createdBy: 'ai' })).map((f) => f.name)).toEqual(['Leave.txt']);
    expect(await repo.list({ query: '100%' })).toEqual([]);
  });

  it('renames and deletes', async () => {
    const repo = await setup();
    const file = await repo.create({ name: 'a.txt', uri: 'file:///a.txt', extractedText: 'a' });
    await repo.rename(file.id, 'b.txt', 'file:///b.txt');
    expect(await repo.get(file.id)).toMatchObject({ name: 'b.txt', uri: 'file:///b.txt' });
    expect(await repo.remove(file.id)).toBe(true);
    expect(await repo.get(file.id)).toBeNull();
  });

  it('detects file kinds', () => {
    expect(kindOf('x.PDF', null)).toBe('pdf');
    expect(kindOf('x', MIME.docx)).toBe('docx');
    expect(kindOf('notes.md', null)).toBe('txt');
    expect(kindOf('photo.jpg', 'image/jpeg')).toBe('other');
  });
});
