jest.mock('obsidian');

const { createPlugin, makeTFile } = require('../../tests/testUtils');

describe('sync operations', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('remoteAbsToRel handles app:/ and disk:/ correctly', () => {
    const plugin = createPlugin();

    expect(plugin.remoteAbsToRel('disk:/Applications/YDS/TestVault/file.md', 'app:/TestVault')).toBe('file.md');
    expect(plugin.remoteAbsToRel('disk:/Root/Sub/file.md', 'disk:/Root/Sub')).toBe('file.md');
    expect(plugin.remoteAbsToRel('disk:/Other/path.txt', 'disk:/Root/Sub')).toBe('Other/path.txt');
  });

  test('ydListFolderRecursive traverses directories and files', async () => {
    const plugin = createPlugin();
    const firstCall = {
      _embedded: {
        items: [
          { type: 'dir', path: 'disk:/Root/Dir', name: 'Dir' },
          { type: 'file', path: 'disk:/Root/root.md', name: 'root.md', size: 1, md5: '1', sha256: 'a', modified: '2024-01-01T00:00:00.000Z', revision: 'r1' },
        ],
      },
    };
    const secondCall = {
      _embedded: {
        items: [
          { type: 'file', path: 'disk:/Root/Dir/deep.md', name: 'deep.md', size: 2, md5: '2', sha256: 'b', modified: '2024-01-02T00:00:00.000Z', revision: 'r2' },
        ],
      },
    };
    plugin.ydGetResource = jest.fn()
      .mockResolvedValueOnce(firstCall)
      .mockResolvedValueOnce(secondCall)
      .mockResolvedValue({ _embedded: { items: [] } });

    const files = await plugin.ydListFolderRecursive('disk:/Root');

    expect(plugin.ydGetResource).toHaveBeenCalledWith('disk:/Root', expect.objectContaining({ limit: 200, offset: 0, fields: expect.any(String) }));
    expect(plugin.ydGetResource).toHaveBeenCalledWith('disk:/Root/Dir', expect.any(Object));
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ rel: 'root.md', name: 'root.md', revision: 'r1' });
    expect(files[1]).toMatchObject({ rel: 'Dir/deep.md', name: 'deep.md', revision: 'r2' });
  });

  test('runWithConcurrency limits concurrency and logs errors', async () => {
    const plugin = createPlugin();
    const items = [1, 2, 3, 4];
    let active = 0;
    let maxActive = 0;

    await plugin.runWithConcurrency(items, 2, async (value) => {
      active++;
      if (active > maxActive) maxActive = active;
      await Promise.resolve();
      if (value === 3) throw new Error('boom');
      active--;
    }).catch(() => {});

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(plugin.reportOpStart).toHaveBeenCalledTimes(4);
    expect(plugin.reportOpEnd).toHaveBeenCalledTimes(4);
    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Task failed'));
  });

  test('runWithConcurrency stops when canceled', async () => {
    const plugin = createPlugin();
    plugin.currentRun = { canceled: true };
    const task = jest.fn();

    await plugin.runWithConcurrency([1, 2, 3], 2, task);

    expect(task).not.toHaveBeenCalled();
  });

  test('uploadLocalFile reads file and uploads via href', async () => {
    const plugin = createPlugin();
    const data = new Uint8Array([1, 2, 3]);
    plugin.ydEnsureFolder = jest.fn().mockResolvedValue();
    plugin.ydGetUploadHref = jest.fn().mockResolvedValue('https://upload');
    plugin.http = jest.fn().mockResolvedValue();
    plugin.app.vault.readBinary.mockResolvedValue(data);
    const file = makeTFile('vault/notes/file.md');

    await plugin.uploadLocalFile('notes/file.md', file, 'disk:/Root/notes/file.md');

    expect(plugin.ydEnsureFolder).toHaveBeenCalledWith('disk:/Root/notes');
    expect(plugin.ydGetUploadHref).toHaveBeenCalledWith('disk:/Root/notes/file.md', true);
    expect(plugin.http).toHaveBeenCalledWith('PUT', 'https://upload', { body: data, contentType: 'application/octet-stream' });
  });

  test('downloadRemoteFile updates existing file', async () => {
    const plugin = createPlugin();
    const bin = new Uint8Array([5, 6]);
    plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');
    plugin.http = jest.fn().mockResolvedValue(bin);
    const existing = makeTFile('notes/file.bin');
    plugin.app.vault.getAbstractFileByPath.mockReturnValue(existing);

    await plugin.downloadRemoteFile('disk:/Root/notes/file.bin', 'notes/file.bin');

    expect(plugin.app.vault.modifyBinary).toHaveBeenCalledWith(existing, bin);
    expect(plugin.http).toHaveBeenCalledWith('GET', 'https://download', {}, true);
  });

  test('downloadRemoteFile creates file in existing folder', async () => {
    const plugin = createPlugin();
    const bin = new Uint8Array([7]);
    plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download2');
    plugin.http = jest.fn().mockResolvedValue(bin);
    const folder = new (require('obsidian').TFolder)('notes');
    plugin.app.vault.getAbstractFileByPath.mockReturnValue(folder);

    await plugin.downloadRemoteFile('disk:/Root/notes/sub/file.bin', 'notes/sub/file.bin');

    expect(plugin.app.vault.createBinary).toHaveBeenCalledWith('notes/sub/file.bin/file.bin', bin);
  });

  test('downloadRemoteFile creates path when file is missing', async () => {
    const plugin = createPlugin();
    const bin = new Uint8Array([9]);
    plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://d');
    plugin.http = jest.fn().mockResolvedValue(bin);
    plugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
    plugin.ensureFolderForPath = jest.fn().mockResolvedValue();

    await plugin.downloadRemoteFile('disk:/Root/new/file.md', 'new/file.md');

    expect(plugin.ensureFolderForPath).toHaveBeenCalledWith('new/file.md');
    expect(plugin.app.vault.createBinary).toHaveBeenCalledWith('new/file.md', bin);
  });

  test('ensureFolderForPath creates missing directories', async () => {
    const plugin = createPlugin();
    const seen = new Set();
    plugin.app.vault.getAbstractFileByPath.mockImplementation((path) => {
      return seen.has(path) ? {} : null;
    });
    plugin.app.vault.createFolder.mockImplementation(async (path) => {
      seen.add(path);
    });

    await plugin.ensureFolderForPath('foo/bar/baz.txt');

    expect(plugin.app.vault.createFolder).toHaveBeenCalledWith('foo');
    expect(plugin.app.vault.createFolder).toHaveBeenCalledWith('foo/bar');
  });

  test('resolveConflictByDuplication duplicates markdown files', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const plugin = createPlugin();
    plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');
    plugin.http = jest.fn().mockResolvedValue(Buffer.from('remote text', 'utf8'));
    plugin.app.vault.read = jest.fn().mockResolvedValue('local text');
    plugin.ensureFolderForPath = jest.fn().mockResolvedValue();

    await plugin.resolveConflictByDuplication('note.md', makeTFile('note.md'), { path: 'disk:/Remote/note.md' });

    const expectedLocal = 'note (conflict 2024-01-01-00-00-00 local).md';
    const expectedRemote = 'note (conflict 2024-01-01-00-00-00 remote).md';
    expect(plugin.app.vault.create).toHaveBeenCalledWith(expectedLocal, 'local text');
    expect(plugin.app.vault.create).toHaveBeenCalledWith(expectedRemote, 'remote text');
    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining(expectedLocal));
  });

  test('resolveConflictByDuplication duplicates binary files', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const plugin = createPlugin();
    plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');
    const remote = new Uint8Array([1, 2]);
    const local = new Uint8Array([3]);
    plugin.http = jest.fn().mockResolvedValue(remote);
    plugin.app.vault.readBinary = jest.fn().mockResolvedValue(local);
    plugin.ensureFolderForPath = jest.fn().mockResolvedValue();

    await plugin.resolveConflictByDuplication('archive.zip', makeTFile('archive.zip'), { path: 'disk:/Remote/archive.zip' });

    const expectedLocal = 'archive (conflict 2024-01-01-00-00-00 local).zip';
    const expectedRemote = 'archive (conflict 2024-01-01-00-00-00 remote).zip';
    expect(plugin.app.vault.createBinary).toHaveBeenCalledWith(expectedLocal, local);
    expect(plugin.app.vault.createBinary).toHaveBeenCalledWith(expectedRemote, remote);
  });
});
