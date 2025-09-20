jest.mock('obsidian');

const { createPlugin, makeTFile } = require('../../tests/testUtils');

function makeRemote(rel, overrides = {}) {
  const base = 'app:/TestVault';
  return Object.assign(
    {
      rel,
      path: `${base}/${rel}`,
      modified: new Date(0).toISOString(),
      revision: '1',
      size: 10,
    },
    overrides,
  );
}

describe('план синхронизации', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('новый локальный файл планируется на выгрузку', async () => {
    const plugin = createPlugin();
    const local = { rel: 'note.md', mtime: 2000, size: 5, tfile: makeTFile('note.md') };

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      type: 'upload',
      rel: 'note.md',
      from: local,
      toAbs: plugin.remoteAbs('note.md'),
    });
  });

  test('новый удалённый файл планируется на загрузку', async () => {
    const plugin = createPlugin();
    const remote = makeRemote('todo.md', { modified: new Date(5000).toISOString() });

    plugin.listLocalFilesInScope = jest.fn(() => []);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      type: 'download',
      rel: 'todo.md',
      fromAbs: remote.path,
      toRel: 'todo.md',
      remote,
    });
  });

  test('при стратегии duplicate-both возникает операция конфликта', async () => {
    const plugin = createPlugin({
      settings: { conflictStrategy: 'duplicate-both', timeSkewToleranceSec: 0 },
      index: {
        files: {
          'note.md': {
            localMtime: 1000,
            localSize: 5,
            remoteModified: new Date('2024-01-01T00:00:00.000Z').getTime(),
            remoteRevision: 'old',
          },
        },
        lastSyncAt: '2024-01-01T00:00:00.000Z',
      },
    });

    const local = { rel: 'note.md', mtime: 5000, size: 7, tfile: makeTFile('note.md') };
    const remote = makeRemote('note.md', {
      modified: '2024-02-01T00:00:00.000Z',
      revision: 'new',
    });

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'conflict', rel: 'note.md', from: local, remote });
  });

  test('newest-wins выбирает более свежую локальную версию вне толеранса', async () => {
    const plugin = createPlugin({
      settings: { conflictStrategy: 'newest-wins', timeSkewToleranceSec: 1 },
      index: {
        files: {
          'note.md': {
            localMtime: 2000,
            localSize: 5,
            remoteModified: 1000,
            remoteRevision: 'r1',
          },
        },
      },
    });

    const local = { rel: 'note.md', mtime: 10_000, size: 5, tfile: makeTFile('note.md') };
    const remote = makeRemote('note.md', {
      modified: new Date(2000).toISOString(),
      revision: 'r2',
    });

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'upload', rel: 'note.md', from: local, toAbs: remote.path });
  });

  test('newest-wins выбирает удалённую версию при более свежем облаке', async () => {
    const plugin = createPlugin({
      settings: { conflictStrategy: 'newest-wins', timeSkewToleranceSec: 0 },
      index: {
        files: {
          'note.md': {
            localMtime: 2000,
            localSize: 5,
            remoteModified: 1000,
            remoteRevision: 'r1',
          },
        },
      },
    });

    const local = { rel: 'note.md', mtime: 2000, size: 5, tfile: makeTFile('note.md') };
    const remote = makeRemote('note.md', {
      modified: new Date(5_000).toISOString(),
      revision: 'r2',
    });

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'download', rel: 'note.md', fromAbs: remote.path });
  });

  test('политика mirror при отсутствии локального файла оставляет скачивание (удаление подавляется приоритетом)', async () => {
    const modified = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const modifiedTime = new Date(modified).getTime();
    const remote = makeRemote('archive.md', {
      modified,
      revision: 'rev1',
    });

    const plugin = createPlugin({
      index: {
        files: {
          'archive.md': {
            localMtime: 1000,
            localSize: 5,
            remoteModified: modifiedTime,
            remoteRevision: 'rev1',
          },
        },
      },
    });

    plugin.listLocalFilesInScope = jest.fn(() => []);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'download', rel: 'archive.md' });
  });

  test('политика mirror при удалении в облаке оставляет выгрузку (удаление подавляется приоритетом)', async () => {
    const plugin = createPlugin({
      index: {
        files: {
          'trash.md': {
            localMtime: 2000,
            localSize: 7,
            remoteModified: 3000,
            remoteRevision: 'rev1',
          },
        },
      },
    });

    const local = { rel: 'trash.md', mtime: 2000, size: 7, tfile: makeTFile('trash.md') };

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'upload', rel: 'trash.md' });
  });
});
