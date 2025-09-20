jest.mock('obsidian');

const obsidian = require('obsidian');
const PluginClass = require('../../main.js');
const { createPlugin } = require('../../tests/testUtils');

describe('syncNow и UI состояния', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('syncNow в режиме dry-run не выполняет план и завершает успешно', async () => {
    const plugin = createPlugin();
    const plan = [{ type: 'upload', rel: 'a', toAbs: 'disk:/a', from: {} }];
    const remoteMap = new Map();
    plugin.buildPlan = jest.fn().mockResolvedValue({ plan, remoteMap });
    plugin.executePlan = jest.fn();
    plugin.finishRun = jest.fn();

    await plugin.syncNow(true);

    expect(plugin.buildPlan).toHaveBeenCalledTimes(1);
    expect(plugin.executePlan).not.toHaveBeenCalled();
    expect(plugin.finishRun).toHaveBeenCalledWith(true);
    expect(plugin.logInfo).toHaveBeenCalledWith(expect.stringContaining('Plan (1 ops) built'));
  });

  test('syncNow без токена показывает уведомление', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice');
    const plugin = createPlugin({ settings: { accessToken: '' } });

    await plugin.syncNow(false);

    expect(noticeSpy).toHaveBeenCalledWith('Connect account in settings first.');
    expect(plugin.logInfo).not.toHaveBeenCalledWith(expect.stringContaining('Sync started'));
  });

  test('syncNow выполняет план и завершает успешно', async () => {
    const plugin = createPlugin();
    const plan = [{ type: 'upload', rel: 'a', toAbs: 'disk:/a', from: {} }];
    const remoteMap = new Map();
    plugin.buildPlan = jest.fn().mockResolvedValue({ plan, remoteMap });
    plugin.executePlan = jest.fn().mockResolvedValue();
    plugin.finishRun = jest.fn();

    await plugin.syncNow(false);

    expect(plugin.executePlan).toHaveBeenCalledWith(plan, remoteMap);
    expect(plugin.finishRun).toHaveBeenCalledWith(true);
  });

  test('syncNow ловит ошибки и завершает с ошибкой', async () => {
    const plugin = createPlugin();
    plugin.buildPlan = jest.fn().mockRejectedValue(new Error('boom'));
    plugin.finishRun = jest.fn();

    await plugin.syncNow(false);

    expect(plugin.finishRun).toHaveBeenCalledWith(false);
    expect(plugin.logError).toHaveBeenCalledWith(expect.stringContaining('Sync failed'));
  });

  test('startRun/setRunPlan/finishRun обновляют состояние и статус', () => {
    const plugin = createPlugin();
    plugin.updateStatusBar = jest.fn();
    // восстановим реальные методы отчета
    plugin.reportOpStart = PluginClass.prototype.reportOpStart.bind(plugin);
    plugin.reportOpEnd = PluginClass.prototype.reportOpEnd.bind(plugin);

    plugin.startRun(false, 0);
    expect(plugin.currentRun.phase).toBe('Planning');
    expect(plugin.updateStatusBar).toHaveBeenCalledWith('Planning');

    plugin.setRunPlan([
      { type: 'upload', rel: 'a' },
      { type: 'download', rel: 'b' },
      { type: 'conflict', rel: 'c' },
      { type: 'remote-delete', rel: 'd' },
      { type: 'local-delete', rel: 'e' },
    ]);
    expect(plugin.updateStatusBar).toHaveBeenCalledWith('Running');
    expect(plugin.currentRun.total).toBe(5);
    expect(plugin.currentRun.counts.upload.queued).toBe(1);
    expect(plugin.currentRun.counts.download.queued).toBe(1);
    expect(plugin.currentRun.counts.conflict.queued).toBe(1);
    expect(plugin.currentRun.counts.del.queued).toBe(2);

    plugin.finishRun(true);
    expect(plugin.updateStatusBar).toHaveBeenCalledWith('Done');
  });

  test('getProgressSummary отражает последние операции', () => {
    const plugin = createPlugin();
    plugin.reportOpStart = PluginClass.prototype.reportOpStart.bind(plugin);
    plugin.reportOpEnd = PluginClass.prototype.reportOpEnd.bind(plugin);

    plugin.startRun(false, 2);
    plugin.currentRun.counts.upload.queued = 2;
    plugin.currentRun.counts.download.queued = 1;
    plugin.reportOpStart({ type: 'upload', rel: 'note.md' });
    plugin.reportOpEnd({ type: 'upload', rel: 'note.md' }, true);

    const summary = plugin.getProgressSummary();

    expect(summary).toContain('Phase: upload');
    expect(summary).toContain('Progress: 1/2 (failed 0, queued 1)');
    expect(summary).toContain('Uploads: 1/2');
    expect(summary).toContain('note.md');
  });
});
