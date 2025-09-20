jest.mock('obsidian');

const PluginClass = require('../../main.js');
const { helpers } = PluginClass;
const { createPlugin, createMockAdapter } = require('../../tests/testUtils');

const { createEmptyIndex } = helpers;

describe('settings loading and index', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('loadSettings applies saved values and clears ignore cache', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });
    plugin.loadData = jest.fn().mockResolvedValue({
      settings: { ignorePatterns: ['**/*.tmp'] },
    });
    plugin.readIndexFile = jest.fn().mockResolvedValue({ index: createEmptyIndex(), hash: 'hash', existed: true });
    plugin.invalidateIgnoreCache = jest.fn();

    await plugin.loadSettings();

    expect(plugin.settings.ignorePatterns).toEqual(['**/*.tmp']);
    expect(plugin.invalidateIgnoreCache).toHaveBeenCalled();
  });

  test('loadSettings carries extra data and updates indexMeta', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });
    plugin.loadData = jest.fn().mockResolvedValue({
      settings: {},
      extra: 42,
      indexMeta: { hash: 'old' },
    });
    plugin.readIndexFile = jest.fn().mockResolvedValue({ index: createEmptyIndex(), hash: 'newHash', existed: true });
    plugin.saveSettings = jest.fn().mockResolvedValue();
    plugin.saveData = jest.fn().mockResolvedValue();

    await plugin.loadSettings();

    expect(plugin._persistedExtra).toEqual({ extra: 42 });
    expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({
      settings: plugin.settings,
      indexMeta: { hash: 'newHash', version: 1 },
      extra: 42,
    }));
  });

  test('loadSettings recreates index when file is missing', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });
    const empty = createEmptyIndex();
    plugin.loadData = jest.fn().mockResolvedValue({ settings: {} });
    plugin.readIndexFile = jest.fn().mockResolvedValue({ index: empty, hash: null, existed: false });
    plugin.writeIndexFile = jest.fn().mockResolvedValue('rehash');
    plugin.saveSettings = jest.fn().mockResolvedValue();
    plugin.saveData = jest.fn().mockResolvedValue();

    await plugin.loadSettings();

    expect(plugin.writeIndexFile).toHaveBeenCalledWith(empty);
    expect(plugin.indexHash).toBe('rehash');
    expect(plugin.indexMeta.hash).toBe('rehash');
  });

  test('ensureIndexDir creates directory only once', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValueOnce(false).mockResolvedValue(true);
    const plugin = createPlugin({ adapter });

    await plugin.ensureIndexDir();
    await plugin.ensureIndexDir();

    expect(adapter.mkdir).toHaveBeenCalledTimes(1);
  });

  test('ensureIndexDir logs adapter error', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockRejectedValueOnce(new Error('fail'));
    const plugin = createPlugin({ adapter });

    await plugin.ensureIndexDir();

    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to create index directory'));
  });

  test('indexFileExists updates cache', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValueOnce(true);
    const plugin = createPlugin({ adapter });

    const res = await plugin.indexFileExists();

    expect(res).toBe(true);
    expect(plugin._indexFileKnownExists).toBe(true);
  });

  test('indexFileExists resets cache on error', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockRejectedValueOnce(new Error('io'));
    const plugin = createPlugin({ adapter });

    const res = await plugin.indexFileExists();

    expect(res).toBe(false);
    expect(plugin._indexFileKnownExists).toBe(false);
  });
});
