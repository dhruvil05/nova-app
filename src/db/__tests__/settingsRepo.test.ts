/**
 * @jest-environment node
 */
import { migrate } from '../migrate';
import { createSettingsRepo } from '../settingsRepo';
import { createNodeDb } from '../testing/nodeDb';

describe('settingsRepo', () => {
  it('stores, overwrites and removes values', async () => {
    const db = createNodeDb();
    await migrate(db);
    const settings = createSettingsRepo(db);

    expect(await settings.get('ai.model')).toBeNull();
    await settings.set('ai.model', 'fast');
    await settings.set('ai.model', 'strong');
    expect(await settings.get('ai.model')).toBe('strong');
    await settings.remove('ai.model');
    expect(await settings.get('ai.model')).toBeNull();
  });
});
