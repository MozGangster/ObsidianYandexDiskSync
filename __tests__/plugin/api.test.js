jest.mock('obsidian');

const obsidian = require('obsidian');
const { createPlugin } = require('../../tests/testUtils');

const API_BASE = 'https://cloud-api.yandex.net/v1/disk';

describe('Yandex Disk API helpers', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('ydGetUploadHref builds the correct URL', async () => {
    const plugin = createPlugin();
    plugin.http = jest.fn().mockResolvedValue({ href: 'https://upload' });

    const href = await plugin.ydGetUploadHref('disk:/Root/file.txt', true);

    expect(plugin.http).toHaveBeenCalledWith(
      'GET',
      `${API_BASE}/resources/upload?path=disk%3A%2FRoot%2Ffile.txt&overwrite=true`,
      { expectJson: true },
    );
    expect(href).toBe('https://upload');
  });

  test('ydEnsureFolder ignores 409 and rethrows other errors', async () => {
    const plugin = createPlugin();
    const conflict = Object.assign(new Error('HTTP 409: Folder exists'), { message: 'HTTP 409: Folder exists' });
    plugin.http = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(new Error('Boom'));

    await expect(plugin.ydEnsureFolder('disk:/Root/folder')).resolves.toBeUndefined();
    await expect(plugin.ydEnsureFolder('disk:/Root/folder')).rejects.toThrow('Boom');
  });

  test('ydDelete issues HTTP DELETE', async () => {
    const plugin = createPlugin();
    plugin.http = jest.fn().mockResolvedValue();

    await plugin.ydDelete('disk:/Root/file.txt', true);

    expect(plugin.http).toHaveBeenCalledWith(
      'DELETE',
      `${API_BASE}/resources?path=disk%3A%2FRoot%2Ffile.txt&permanently=true`,
    );
  });

  test('ydGetResource requests JSON', async () => {
    const plugin = createPlugin();
    plugin.http = jest.fn().mockResolvedValue({ ok: true });

    const data = await plugin.ydGetResource('disk:/Root/file.txt', { limit: 1 });

    expect(plugin.http).toHaveBeenCalledWith(
      'GET',
      `${API_BASE}/resources?limit=1&path=disk%3A%2FRoot%2Ffile.txt`,
      { expectJson: true },
    );
    expect(data).toEqual({ ok: true });
  });

  test('listLocalFilesInScope respects exclusions and size limit', () => {
    const plugin = createPlugin({
      settings: {
        localBasePath: 'vault',
        ignorePatterns: ['ignore/**'],
        excludeExtensions: ['png'],
        maxSizeDesktopMB: 1,
      },
    });
    const ok = { path: 'vault/notes/note.md', stat: { size: 100, mtime: 2000, ctime: 1000 } };
    const big = { path: 'vault/notes/big.md', stat: { size: 2 * 1024 * 1024, mtime: 2000, ctime: 1000 } };
    const ignored = { path: 'vault/ignore/doc.md', stat: { size: 10, mtime: 2000, ctime: 1000 } };
    const png = { path: 'vault/image.png', stat: { size: 10, mtime: 2000, ctime: 1000 } };
    const folder = new obsidian.TFolder('vault/folder');

    plugin.app.vault.getAllLoadedFiles = jest.fn(() => [ok, big, ignored, png, folder]);

    const result = plugin.listLocalFilesInScope();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rel: 'notes/note.md', size: 100, ext: 'md' });
  });
});
