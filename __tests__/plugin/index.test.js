jest.mock('obsidian');

const PluginClass = require('../../main.js');
const { helpers } = PluginClass;
const { createPlugin, createMockAdapter } = require('../../tests/testUtils');

const { createEmptyIndex, computeIndexHash } = helpers;

describe('index persistence', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('readIndexFile returns empty index without adapter', async () => {
    const plugin = createPlugin();
    plugin.app.vault.adapter = null;

    const res = await plugin.readIndexFile();

    expect(res.existed).toBe(false);
    expect(res.index).toEqual(createEmptyIndex());
    expect(res.hash).toBe(computeIndexHash(createEmptyIndex()));
  });

  test('readIndexFile creates empty index when file is missing', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });

    const res = await plugin.readIndexFile();

    expect(adapter.exists).toHaveBeenCalledWith(plugin.getIndexFilePath());
    expect(res.existed).toBe(false);
    expect(res.index).toEqual(createEmptyIndex());
  });

  test('readIndexFile restores data and hash', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });
    const payload = {
      files: { 'a.md': { localMtime: 123, localSize: 10 } },
      lastSyncAt: '2024-03-01T00:00:00.000Z',
    };
    await adapter.write(plugin.getIndexFilePath(), JSON.stringify(payload));
    adapter.exists.mockResolvedValueOnce(true);

    const res = await plugin.readIndexFile();

    expect(res.existed).toBe(true);
    expect(res.index).toEqual(payload);
    expect(res.hash).toBe(computeIndexHash(payload));
  });

  test('readIndexFile logs when JSON is broken', async () => {
    const adapter = createMockAdapter();
    const plugin = createPlugin({ adapter });
    await adapter.write(plugin.getIndexFilePath(), '{broken');
    adapter.exists.mockResolvedValueOnce(true);

    const res = await plugin.readIndexFile();

    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Index is corrupted'));
    expect(res.index).toEqual(createEmptyIndex());
    expect(res.existed).toBe(true);
  });

  test('readIndexFile logs when read fails', async () => {
    const adapter = createMockAdapter();
    adapter.read.mockRejectedValue(new Error('disk error'));
    adapter.exists.mockResolvedValueOnce(true);
    const plugin = createPlugin({ adapter });

    const res = await plugin.readIndexFile();

    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to read index file'));
    expect(res.existed).toBe(false);
  });

  test('writeIndexFile creates directory and writes JSON', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockImplementation(async (path) => adapter.__hasDir(path));
    const plugin = createPlugin({ adapter });
    const index = {
      files: { 'b.md': { localMtime: 1 } },
      lastSyncAt: '2024-02-02T00:00:00.000Z',
    };

    const hash = await plugin.writeIndexFile(index);

    const dir = plugin.getPluginDataDir();
    expect(adapter.mkdir).toHaveBeenCalledWith(dir);
    expect(adapter.write).toHaveBeenCalledWith(plugin.getIndexFilePath(), expect.any(String));
    const written = adapter.__get(plugin.getIndexFilePath());
    expect(JSON.parse(written)).toEqual({
      version: 1,
      lastSyncAt: '2024-02-02T00:00:00.000Z',
      files: { 'b.md': { localMtime: 1 } },
    });
    expect(hash).toBe(computeIndexHash({
      lastSyncAt: '2024-02-02T00:00:00.000Z',
      files: { 'b.md': { localMtime: 1 } },
    }));
  });

  test('writeIndexFile throws without adapter', async () => {
    const plugin = createPlugin();
    plugin.app.vault.adapter = null;

    await expect(plugin.writeIndexFile(createEmptyIndex())).rejects.toThrow('Vault adapter unavailable');
  });

  test('persistIndexIfNeeded writes only on changes', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValue(true);
    const plugin = createPlugin({ adapter });
    plugin.index = { files: { 'a': { localMtime: 1 } }, lastSyncAt: null };
    plugin.indexHash = computeIndexHash(plugin.index);

    await plugin.persistIndexIfNeeded(false);

    expect(adapter.write).not.toHaveBeenCalled();

    plugin.index.files.a.localMtime = 2;
    await plugin.persistIndexIfNeeded(false);

    expect(adapter.write).toHaveBeenCalledTimes(1);
    expect(plugin.indexHash).toBe(computeIndexHash(plugin.index));
  });

  test('persistIndexIfNeeded rewrites when the file is missing', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValue(false);
    const plugin = createPlugin({ adapter });
    plugin.index = { files: {}, lastSyncAt: null };
    const hash = computeIndexHash(plugin.index);
    plugin.indexHash = hash;
    plugin._indexFileKnownExists = false;

    await plugin.persistIndexIfNeeded(false);

    expect(adapter.write).toHaveBeenCalledTimes(1);
    expect(plugin.indexHash).toBe(computeIndexHash(plugin.index));
  });
});
