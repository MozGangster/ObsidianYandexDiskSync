jest.mock('obsidian');

const { createPlugin, makeTFile } = require('../../tests/testUtils');

describe('buildPlan — расширенные сценарии', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('mirror удаляет удалённый файл при неизменённом состоянии', async () => {
    const plugin = createPlugin({
      index: {
        files: {
          'remote.md': {
            localMtime: 1000,
            localSize: 10,
            remoteModified: new Date('2024-01-01T00:00:00Z').getTime(),
            remoteRevision: 'r1',
          },
        },
      },
    });
    const remote = {
      rel: 'remote.md',
      path: 'disk:/Base/remote.md',
      modified: '2024-01-01T00:00:00Z',
      revision: 'r1',
    };

    plugin.listLocalFilesInScope = jest.fn(() => []);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);
    plugin.settings.syncMode = 'two-way';
    plugin.settings.deletePolicy = 'mirror';

    const { plan } = await plugin.buildPlan();

    expect(plan).toContainEqual({
      type: 'download',
      rel: 'remote.md',
      fromAbs: 'disk:/Base/remote.md',
      toRel: 'remote.md',
      remote,
    });
  });

  test('mirror не удаляет, если удалённый файл изменился', async () => {
    const plugin = createPlugin({
      index: {
        files: {
          'remote.md': {
            localMtime: 1000,
            localSize: 10,
            remoteModified: new Date('2024-01-01T00:00:00Z').getTime(),
            remoteRevision: 'r1',
          },
        },
      },
    });
    const remote = {
      rel: 'remote.md',
      path: 'disk:/Base/remote.md',
      modified: '2024-01-02T00:00:00Z',
      revision: 'r2',
    };

    plugin.listLocalFilesInScope = jest.fn(() => []);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);
    plugin.settings.syncMode = 'two-way';
    plugin.settings.deletePolicy = 'mirror';

    const { plan } = await plugin.buildPlan();

    expect(plan.find((op) => op.type === 'remote-delete')).toBeUndefined();
  });

  test('duplicate-both при конфликте создаёт операцию conflict', async () => {
    const plugin = createPlugin({
      settings: { conflictStrategy: 'duplicate-both' },
      index: {
        files: {
          'note.md': {
            localMtime: 1000,
            localSize: 10,
            remoteModified: new Date('2024-01-01T00:00:00Z').getTime(),
            remoteRevision: 'r1',
          },
        },
      },
    });
    const local = { rel: 'note.md', mtime: 2000, size: 12, tfile: makeTFile('note.md') };
    const remote = {
      rel: 'note.md',
      path: 'disk:/Base/note.md',
      modified: '2024-01-02T00:00:00Z',
      revision: 'r2',
    };

    plugin.listLocalFilesInScope = jest.fn(() => [local]);
    plugin.ydListFolderRecursive = jest.fn().mockResolvedValue([remote]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.allowRemoteItem = jest.fn(() => true);

    const { plan } = await plugin.buildPlan();

    expect(plan).toContainEqual(expect.objectContaining({ type: 'conflict', rel: 'note.md' }));
  });

  test('повторный запуск syncNow при активном процессе открывает прогресс', async () => {
    const plugin = createPlugin();
    plugin.openProgress = jest.fn();
    plugin.currentRun = { active: true };

    await plugin.syncNow(false);

    expect(plugin.openProgress).toHaveBeenCalled();
  });
});
