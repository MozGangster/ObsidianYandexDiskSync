class Plugin {
  constructor(app = {}, manifest = {}) {
    this.app = app;
    this.manifest = manifest;
  }
  addCommand() {}
  addSettingTab() {}
   registerInterval() {}
  addRibbonIcon() {
    return {
      addClass() {},
      setAttribute() {},
    };
  }
  addStatusBarItem() {
    return {
      addClass() {},
      removeClass() {},
      classList: {
        add() {},
        remove() {},
      },
      setAttribute() {},
    };
  }
  registerEvent() {}
  loadData() { return Promise.resolve({}); }
  saveData() { return Promise.resolve(); }
}

class Notice {
  constructor() {}
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = createEl();
    this.modalEl = createEl();
    this.titleEl = createEl();
  }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }
  setName() { return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addDropdown(cb) {
    const api = {
      addOptions() { return api; },
      setValue() { return api; },
      onChange() { return api; },
      setDisabled() { return api; },
    };
    cb(api);
    return this;
  }
  addText(cb) {
    const api = {
      setPlaceholder() { return api; },
      setValue() { return api; },
      onChange() { return api; },
    };
    cb(api);
    return this;
  }
  addTextArea(cb) {
    const api = {
      setPlaceholder() { return api; },
      setValue() { return api; },
      onChange() { return api; },
    };
    cb(api);
    return this;
  }
  addButton(cb) {
    const api = {
      setButtonText() { return api; },
      onClick() { return api; },
      setCta() { return api; },
    };
    cb(api);
    return this;
  }
  addToggle(cb) {
    const api = {
      setValue() { return api; },
      onChange() { return api; },
    };
    cb(api);
    return this;
  }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createEl();
  }
  display() {}
  hide() {}
}

class TFile {
  constructor(path = '') {
    this.path = path;
  }
}

class TFolder {
  constructor(path = '') {
    this.path = path;
  }
}

function createEl() {
  return {
    empty() {},
    addClass() {},
    removeClass() {},
    appendChild() {},
    createEl() { return createEl(); },
    setText() {},
    setAttr() {},
    setAttribute() {},
    addEventListener() {},
    classList: {
      add() {},
      remove() {},
    },
  };
}

let requestHandler = async () => {
  throw new Error('requestUrl mock: not implemented');
};

async function requestUrl(...args) {
  return requestHandler(...args);
}

requestUrl.__setMock = (fn) => {
  requestHandler = typeof fn === 'function' ? fn : requestHandler;
};

const normalizePath = jest.fn((input) => {
  if (!input) return '';
  const str = `${input}`;
  return str
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\/+/, '');
});

function getLanguage() {
  return 'en';
}

module.exports = {
  Plugin,
  Notice,
  Modal,
  Setting,
  PluginSettingTab,
  TFile,
  TFolder,
  requestUrl,
  normalizePath,
  getLanguage,
};
