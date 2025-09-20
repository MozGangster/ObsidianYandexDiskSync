const PluginClass = require('../main.js');
const { helpers } = PluginClass;
const { createEmptyIndex } = helpers;
const obsidian = require('obsidian');

function buildApp(overrides = {}) {
  const adapter = overrides.adapter || {
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn().mockResolvedValue('{}'),
    write: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  };

  const vault = Object.assign(
    {
      adapter,
      getAllLoadedFiles: jest.fn(() => []),
      getAbstractFileByPath: jest.fn(),
      getName: jest.fn(() => 'TestVault'),
      create: jest.fn().mockResolvedValue(undefined),
      createBinary: jest.fn().mockResolvedValue(undefined),
      modify: jest.fn().mockResolvedValue(undefined),
      modifyBinary: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(''),
      readBinary: jest.fn().mockResolvedValue(new Uint8Array()),
      createFolder: jest.fn().mockResolvedValue(undefined),
    },
    overrides.vault || {},
  );

  return Object.assign(
    {
      vault,
      workspace: {
        onLayoutReady: jest.fn((cb) => {
          if (typeof cb === 'function') cb();
        }),
      },
    },
    overrides.app || {},
  );
}

function createPlugin(options = {}) {
  const app = buildApp(options);
  const plugin = new PluginClass(app, options.manifest || {});

  plugin.app = app;
  plugin.settings = Object.assign({}, PluginClass.DEFAULT_SETTINGS, {
    accessToken: 'test-token',
    showStatusBar: false,
  }, options.settings || {});
  plugin.log = [];
  plugin.logWarn = jest.fn();
  plugin.logInfo = jest.fn();
  plugin.logError = jest.fn();
  plugin.updateStatusBar = jest.fn();
  plugin.reportOpStart = jest.fn();
  plugin.reportOpEnd = jest.fn();
  plugin.lastHttpError = null;
  plugin.index = Object.assign(createEmptyIndex(), options.index || {});
  plugin.currentRun = null;
  plugin._ignoreCache = null;

  if (options.overrides) Object.assign(plugin, options.overrides);

  return plugin;
}

function makeTFile(path) {
  return new obsidian.TFile(path);
}

function createMockAdapter(initial = {}) {
  const fileStore = new Map(Object.entries(initial));
  const dirStore = new Set();

  const adapter = {
    exists: jest.fn(async (path) => fileStore.has(path) || dirStore.has(path)),
    read: jest.fn(async (path) => {
      if (!fileStore.has(path)) throw new Error(`ENOENT: ${path}`);
      return fileStore.get(path);
    }),
    write: jest.fn(async (path, data) => {
      fileStore.set(path, data);
    }),
    mkdir: jest.fn(async (path) => {
      dirStore.add(path);
    }),
  };

  adapter.__get = (path) => fileStore.get(path);
  adapter.__hasDir = (path) => dirStore.has(path);
  return adapter;
}

module.exports = {
  createPlugin,
  buildApp,
  makeTFile,
  createMockAdapter,
};
