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
        expect(plugin.app.vault.createBinary).toHaveBeenCalledWith(targetPath, fullContent);
        expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Range ignored?'));
    });

    test('truncates overflow data when total is known', async () => {
        const plugin = createPlugin();
        const MB = 1024 * 1024;
        const totalSize = 3 * MB;
        // We expect the first chunk to be 2MB.
        // Let's say the server returns 2MB + 100 bytes.
        const chunkSize = 2 * MB;
        const overflowSize = chunkSize + 100;
        const overflowContent = new Uint8Array(overflowSize).fill(2);

        plugin.ydGetDownloadHref = jest.fn().mockResolvedValue('https://download');

        // Mock http to return overflow content for the first chunk
        plugin.http = jest.fn().mockImplementation(async (method, url, opts) => {
            if (opts.returnHeaders) {
                return { body: overflowContent.buffer, headers: {} };
            }
            return overflowContent.buffer;
        });

        const targetPath = 'notes/overflow.bin';
        const remoteMeta = { size: totalSize, path: 'disk:/notes/overflow.bin' };

        await plugin.downloadRemoteFile('disk:/notes/overflow.bin', targetPath, remoteMeta);

        // The logic should detect overflow for the *chunk* vs *total*.
        // Wait, the overflow check `got + arr.length > total` checks against TOTAL file size.
        // If we are at offset 0, got=0. arr.length = 2MB + 100. Total = 3MB.
        // 0 + 2MB + 100 < 3MB. So it WON'T trigger "Received more data than expected" for the total size check.

        // But `isWayTooBig` check: `arr.length > requestedSize * 2`.
        // requestedSize is 2MB. arr.length is 2MB + 100. Not way too big.

        // So this test case as written (checking for truncation) relies on `got + arr.length > total`.
        // To test truncation, we need `got + arr.length > total`.
        // So if we are at the LAST chunk, or if we get more than TOTAL.

        // Let's simulate getting MORE than TOTAL in the first chunk.
        // Total = 3MB. Server returns 3.1MB.
        const hugeSize = totalSize + 1024;
        const hugeContent = new Uint8Array(hugeSize).fill(3);

        plugin.http = jest.fn().mockImplementation(async (method, url, opts) => {
            if (opts.returnHeaders) {
                return { body: hugeContent.buffer, headers: {} };
            }
            return hugeContent.buffer;
        });

        await plugin.downloadRemoteFile('disk:/notes/overflow.bin', targetPath, remoteMeta);

        // It should truncate to totalSize
        const expectedContent = hugeContent.subarray(0, totalSize);
        expect(plugin.app.vault.createBinary).toHaveBeenCalledWith(targetPath, expectedContent);
        expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('Received more data than expected'));
    });
});
