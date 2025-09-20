jest.mock('obsidian');

const obsidian = require('obsidian');
const { createPlugin } = require('../../tests/testUtils');

const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('UI and diagnostics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('showDiagnostics builds summary and refreshes it after verifyToken', async () => {
    const opened = [];
    jest.spyOn(obsidian.Modal.prototype, 'open').mockImplementation(function () {
      opened.push(this);
    });

    const plugin = createPlugin({ settings: { accessToken: 'abcdef', remoteBasePath: 'disk:/Base' } });
    plugin.getRemoteBase = jest.fn(() => 'disk:/Base/TestVault');
    plugin.getOAuthBase = jest.fn(() => 'https://oauth');
    plugin.log = ['[older]', '[newer]'];
    plugin.lastApiCheck = { ok: false, error: 'fail', at: '2024-01-01' };
    plugin.verifyToken = jest.fn().mockImplementation(async () => {
      plugin.lastApiCheck = { ok: true, path: 'disk:/Base', at: '2024-01-02' };
      return plugin.lastApiCheck;
    });

    await plugin.showDiagnostics();

    expect(opened).toHaveLength(1);
    const modal = opened[0];
    expect(modal.text).toContain('Local scope: (root)');
    expect(modal.text).toContain('Token present: yes (****abcdef)');
    expect(plugin.verifyToken).toHaveBeenCalledWith(true);

    await flush();

    expect(modal.text).toContain('OK for disk:/Base');
  });

  test('openProgress reuses the modal', () => {
    const plugin = createPlugin();
    const openSpy = jest.spyOn(obsidian.Modal.prototype, 'open');

    plugin.openProgress();
    const first = plugin._progressModal;
    plugin.openProgress();
    const second = plugin._progressModal;

    expect(first).toBe(second);
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  test('cancelCurrentRun marks cancellation and logs a warning', () => {
    const plugin = createPlugin();
    plugin.currentRun = { active: true, canceled: false };

    plugin.cancelCurrentRun();

    expect(plugin.currentRun.canceled).toBe(true);
    expect(plugin.logWarn).toHaveBeenCalledWith('Cancellation requested by user');
  });
});
