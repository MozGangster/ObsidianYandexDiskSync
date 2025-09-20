jest.mock('obsidian');

const { createPlugin, makeTFile } = require('../../tests/testUtils');

describe('executePlan', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  function makePlugin() {
    const plugin = createPlugin();
    plugin.runWithConcurrency = jest.fn(async (items, limit, task) => {
      for (const item of items) {
        await task(item);
      }
    });
    plugin.uploadLocalFile = jest.fn().mockResolvedValue();
    plugin.downloadRemoteFile = jest.fn().mockResolvedValue();
    plugin.resolveConflictByDuplication = jest.fn().mockResolvedValue();
    plugin.ydDelete = jest.fn().mockResolvedValue();
    plugin.app.vault.delete = jest.fn().mockResolvedValue();
    plugin.saveSettings = jest.fn().mockResolvedValue();
    plugin.getRemoteBase = jest.fn(() => 'disk:/Remote');
    plugin.allowRemoteItem = jest.fn(() => true);
    plugin.ydListFolderRecursive = jest.fn();
    return plugin;
  }

  test('после upload пересчитывает индекс и сохраняет настройки', async () => {
    const plugin = makePlugin();
    const tfile = makeTFile('note.md');
    const plan = [{ type: 'upload', rel: 'note.md', from: { tfile, mtime: 2000, size: 10 }, toAbs: 'disk:/Remote/note.md' }];
    const remoteMap = new Map();

    plugin.listLocalFilesInScope = jest.fn(() => [{ rel: 'note.md', mtime: 2000, size: 10, tfile }]);
    plugin.ydListFolderRecursive.mockResolvedValue([
      {
        rel: 'note.md',
        path: 'disk:/Remote/note.md',
        modified: '2024-01-01T00:00:02.000Z',
        revision: 'rev1',
        size: 10,
      },
    ]);

    await plugin.executePlan(plan, remoteMap);

    expect(plugin.uploadLocalFile).toHaveBeenCalledWith('note.md', tfile, 'disk:/Remote/note.md');
    expect(plugin.ydListFolderRecursive).toHaveBeenCalledWith('disk:/Remote');
    expect(plugin.index.files['note.md']).toMatchObject({
      localMtime: 2000,
      localSize: 10,
      remoteRevision: 'rev1',
    });
    expect(plugin.index.lastSyncAt).toBeTruthy();
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  test('использует переданный remoteMap без повторного запроса', async () => {
    const plugin = makePlugin();
    const tfile = makeTFile('note2.md');
    const plan = [];
    const remoteEntry = {
      rel: 'note2.md',
      path: 'disk:/Remote/note2.md',
      modified: '2024-01-01T01:00:00.000Z',
      revision: 'rev2',
    };
    const remoteMap = new Map([[remoteEntry.rel, remoteEntry]]);

    plugin.listLocalFilesInScope = jest.fn(() => [{ rel: 'note2.md', mtime: 3000, size: 5, tfile }]);

    await plugin.executePlan(plan, remoteMap);

    expect(plugin.ydListFolderRecursive).not.toHaveBeenCalled();
    expect(plugin.index.files['note2.md']).toMatchObject({
      localMtime: 3000,
      remoteRevision: 'rev2',
    });
  });

  test('обрабатывает локальные и удалённые удаления', async () => {
    const plugin = makePlugin();
    const tfile = makeTFile('old.md');
    const plan = [
      { type: 'local-delete', rel: 'old.md', tfile },
      { type: 'remote-delete', rel: 'remote.md', abs: 'disk:/Remote/remote.md' },
    ];
    const remoteMap = new Map([
      ['old.md', { rel: 'old.md', path: 'disk:/Remote/old.md', modified: '2024-01-01T00:00:00Z', revision: 'r1' }],
      ['remote.md', { rel: 'remote.md', path: 'disk:/Remote/remote.md', modified: '2024-01-01T00:00:00Z', revision: 'r1' }],
    ]);

    plugin.listLocalFilesInScope = jest.fn(() => []);
    plugin.ydListFolderRecursive.mockResolvedValue([]);

    await plugin.executePlan(plan, remoteMap);

    expect(plugin.app.vault.delete).toHaveBeenCalledWith(tfile);
    expect(plugin.ydDelete).toHaveBeenCalledWith('disk:/Remote/remote.md', false);
  });
});
