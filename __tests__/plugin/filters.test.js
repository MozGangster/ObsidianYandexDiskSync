jest.mock('obsidian');

const { createPlugin } = require('../../tests/testUtils');

describe('sync filters', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('toLocalRel and fromLocalRel respect the base path', () => {
    const plugin = createPlugin({ settings: { localBasePath: 'vault/notes' } });

    expect(plugin.toLocalRel('vault/notes/daily/today.md')).toBe('daily/today.md');
    expect(plugin.toLocalRel('other/file.md')).toBe('other/file.md');
    expect(plugin.fromLocalRel('daily/today.md')).toBe('vault/notes/daily/today.md');
  });

  test('inScope checks membership in the base folder', () => {
    const plugin = createPlugin({ settings: { localBasePath: 'vault/notes' } });

    expect(plugin.inScope('vault/notes', 'vault/notes')).toBe(true);
    expect(plugin.inScope('vault/notes/daily', 'vault/notes/daily')).toBe(true);
    expect(plugin.inScope('vault/other', 'vault/other')).toBe(false);
  });

  test('matchesIgnore uses the cache and clears it', () => {
    const plugin = createPlugin({ settings: { ignorePatterns: ['**/*.log'] } });

    expect(plugin.matchesIgnore('logs/app.log')).toBe(true);
    const cacheBefore = plugin._ignoreCache;
    expect(Array.isArray(cacheBefore)).toBe(true);
    plugin.invalidateIgnoreCache();
    expect(plugin._ignoreCache).toBe(null);
    expect(plugin.matchesIgnore('docs/readme.md')).toBe(false);
  });

  test('allowRemoteItem filters by ignore rules, extension, and size', () => {
    const plugin = createPlugin({
      settings: {
        ignorePatterns: ['private/**'],
        excludeExtensions: ['png'],
        maxSizeMB: 1,
      },
    });
    plugin.invalidateIgnoreCache();

    expect(plugin.allowRemoteItem({ rel: 'private/data.md', size: 10 })).toBe(false);
    expect(plugin.allowRemoteItem({ rel: 'notes/image.png', size: 10 })).toBe(false);
    expect(plugin.allowRemoteItem({ rel: 'notes/big.md', size: 3 * 1024 * 1024 })).toBe(false);
    expect(plugin.allowRemoteItem({ rel: 'notes/ok.md', size: 100 })).toBe(true);
  });
});
