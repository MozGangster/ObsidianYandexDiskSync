jest.mock('obsidian');

const PluginClass = require('../main.js');
const { helpers } = PluginClass;

const {
  globToRegExp,
  pathJoin,
  createEmptyIndex,
  sanitizeIndexForHash,
  computeIndexHash,
  normalizeRelPath,
} = helpers;

describe('utility helpers', () => {
  test('globToRegExp supports basic glob syntax', () => {
    const anyMarkdown = globToRegExp('**/*.md');
    expect(anyMarkdown.test('notes/daily/today.md')).toBe(true);
    expect(anyMarkdown.test('notes/daily/today.txt')).toBe(false);

    const directChild = globToRegExp('vault/*.md');
    expect(directChild.test('vault/file.md')).toBe(true);
    expect(directChild.test('vault/sub/file.md')).toBe(false);

    const singleChar = globToRegExp('?.md');
    expect(singleChar.test('a.md')).toBe(true);
    expect(singleChar.test('ab.md')).toBe(false);
  });

  test('pathJoin normalizes separators and removes empties', () => {
    expect(pathJoin('foo', 'bar', 'baz')).toBe('foo/bar/baz');
    expect(pathJoin('foo\\bar', '', 'baz')).toBe('foo/bar/baz');
  });

  test('normalizeRelPath trims leading slashes and backslashes', () => {
    expect(normalizeRelPath('///foo/bar')).toBe('foo/bar');
    expect(normalizeRelPath('foo\\bar/baz')).toBe('foo/bar/baz');
  });

  test('createEmptyIndex returns clean structure', () => {
    const empty = createEmptyIndex();
    expect(empty).toEqual({ files: {}, lastSyncAt: null });
  });

  test('sanitizeIndexForHash sorts entries deeply and drops unsafe values', () => {
    const dirty = {
      files: {
        'b.md': { beta: 2, alpha: 1 },
        'a.md': { zeta: 3, eta: 4 },
      },
      lastSyncAt: 123,
      extra: 'ignored',
    };

    const sanitized = sanitizeIndexForHash(dirty);

    expect(Object.keys(sanitized.files)).toEqual(['a.md', 'b.md']);
    expect(Object.keys(sanitized.files['b.md'])).toEqual(['alpha', 'beta']);
    expect(sanitized.lastSyncAt).toBeNull();
    expect(sanitized).not.toBe(dirty);
  });

  test('computeIndexHash stays stable for equivalent structures', () => {
    const idx1 = {
      lastSyncAt: '2024-01-01T00:00:00.000Z',
      files: {
        'a.md': { alpha: 1, beta: 2 },
        'b.md': { gamma: 3 },
      },
    };
    const idx2 = {
      files: {
        'b.md': { gamma: 3 },
        'a.md': { beta: 2, alpha: 1 },
      },
      lastSyncAt: '2024-01-01T00:00:00.000Z',
    };

    expect(computeIndexHash(idx1)).toBe(computeIndexHash(idx2));
  });
});
