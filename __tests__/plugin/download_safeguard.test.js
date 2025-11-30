jest.mock('obsidian');

const { createPlugin } = require('../../tests/testUtils');
const { Platform } = require('obsidian');

describe('download safeguards', () => {
    beforeEach(() => {
        jest.useRealTimers();
        Platform.isMobile = true; // Simulate mobile
    });

    afterEach(() => {
        Platform.isMobile = false;
    });

    test('detects ignored Range header and accepts full file if it matches total', async () => {
        const plugin = createPlugin();
        const MB = 1024 * 1024;
        const totalSize = 3 * MB; // 3MB, enough to trigger chunking (limit is 2MB)
        const fullContent = new Uint8Array(totalSize).fill(1);

        plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');

        // Mock http to return the FULL content even when a small range is requested
        plugin.http = jest.fn().mockImplementation(async (method, url, opts) => {
            // Return full content
            if (opts.returnHeaders) {
                return { body: fullContent.buffer, headers: {} };
            }
            return fullContent.buffer;
        });

        const targetPath = 'notes/large_file.bin';
        const remoteMeta = { size: totalSize, path: 'disk:/notes/large_file.bin' };

        // Mock file system for streaming
        const fsSafe = {
            mkdirSync: jest.fn(),
            openSync: jest.fn().mockReturnValue(123),
            writeSync: jest.fn(),
            closeSync: jest.fn(),
            unlinkSync: jest.fn(),
            renameSync: jest.fn(),
        };

        await plugin.downloadRemoteFile('disk:/notes/large_file.bin', targetPath, remoteMeta);

        expect(plugin.http).toHaveBeenCalledTimes(1); // Should stop after first chunk because it got full file
        expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledWith(targetPath, fullContent);
        expect(plugin.logWarn).not.toHaveBeenCalled();
    });

    test('fails on overflow data when total is known', async () => {
        const plugin = createPlugin();
        const MB = 1024 * 1024;
        const totalSize = 3 * MB;
        plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');
        const targetPath = 'notes/overflow.bin';
        const remoteMeta = { size: totalSize, path: 'disk:/notes/overflow.bin' };

        const hugeSize = totalSize + 1024;
        const hugeContent = new Uint8Array(hugeSize).fill(3);

        plugin.http = jest.fn().mockImplementation(async (method, url, opts) => {
            if (opts.returnHeaders) {
                return { body: hugeContent.buffer, headers: {} };
            }
            return hugeContent.buffer;
        });

        await expect(plugin.downloadRemoteFile('disk:/notes/overflow.bin', targetPath, remoteMeta))
          .rejects.toThrow(/Chunk exceeds expected size/);

        expect(plugin.app.vault.adapter.writeBinary).not.toHaveBeenCalled();
        expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Chunk too large'));
    });
});
