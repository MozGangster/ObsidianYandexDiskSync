jest.mock('obsidian');

const PluginClass = require('../../main.js');
const { helpers } = PluginClass;
const { createPlugin, createMockAdapter } = require('../../tests/testUtils');

const { createEmptyIndex } = helpers;

describe('загрузка настроек и индекс', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('loadSettings применяет значения из файла и сбрасывает кэш игноров', async () => {
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

  test('loadSettings переносит доп. данные и обновляет indexMeta', async () => {
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

  test('loadSettings пересоздает индекс, если файла нет', async () => {
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

  test('ensureIndexDir создает директорию только однажды', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValueOnce(false).mockResolvedValue(true);
    const plugin = createPlugin({ adapter });

    await plugin.ensureIndexDir();
    await plugin.ensureIndexDir();

    expect(adapter.mkdir).toHaveBeenCalledTimes(1);
  });

  test('ensureIndexDir логирует ошибку адаптера', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockRejectedValueOnce(new Error('fail'));
    const plugin = createPlugin({ adapter });

    await plugin.ensureIndexDir();

    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Не удалось создать директорию индекса'));
  });

  test('indexFileExists обновляет кеш', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValueOnce(true);
    const plugin = createPlugin({ adapter });

    const res = await plugin.indexFileExists();

    expect(res).toBe(true);
    expect(plugin._indexFileKnownExists).toBe(true);
  });

  test('indexFileExists сбрасывает кеш при ошибке', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockRejectedValueOnce(new Error('io'));
    const plugin = createPlugin({ adapter });

    const res = await plugin.indexFileExists();

    expect(res).toBe(false);
    expect(plugin._indexFileKnownExists).toBe(false);
  });
});
