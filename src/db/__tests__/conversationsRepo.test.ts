/**
 * @jest-environment node
 */
import { createConversationsRepo } from '../conversationsRepo';
import { migrate } from '../migrate';
import { createNodeDb } from '../testing/nodeDb';

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  let clock = 0;
  return createConversationsRepo(db, () => (clock += 1000));
}

describe('conversationsRepo', () => {
  it('stores messages verbatim, in order, including content blocks', async () => {
    const repo = await setup();
    const convo = await repo.create('Car service');
    const blocks = [
      { type: 'thinking', thinking: '', signature: 'sig==' },
      { type: 'tool_use', id: 'toolu_1', name: 'search_notes', input: { query: 'car' } },
    ];
    await repo.append(convo.id, 'user', 'What did I note about the car?');
    await repo.append(convo.id, 'system', 'It is now Wed 15 Oct 2026.');
    await repo.append(convo.id, 'assistant', blocks);

    const msgs = await repo.messages(convo.id);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
    expect(msgs[0].content).toBe('What did I note about the car?');
    expect(msgs[2].content).toEqual(blocks);
  });

  it('lists conversations by latest activity and deletes them with their messages', async () => {
    const repo = await setup();
    const a = await repo.create('A');
    const b = await repo.create('B');
    await repo.append(a.id, 'user', 'newer message in A');
    expect((await repo.list()).map((c) => c.title)).toEqual(['A', 'B']);

    await repo.remove(a.id);
    expect((await repo.list()).map((c) => c.id)).toEqual([b.id]);
    expect(await repo.messages(a.id)).toEqual([]);

    await repo.clearAll();
    expect(await repo.list()).toEqual([]);
  });

  it('renames', async () => {
    const repo = await setup();
    const c = await repo.create();
    await repo.setTitle(c.id, 'Groceries');
    expect((await repo.get(c.id))?.title).toBe('Groceries');
  });
});
