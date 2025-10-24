const { Plugin, Notice, Modal, Setting, requestUrl, PluginSettingTab, TFile, TFolder, normalizePath } = require('obsidian');
const crypto = require('crypto');

const PLUGIN_ID = 'yandex-disk-sync';
const API_BASE = 'https://cloud-api.yandex.net/v1/disk';
const INDEX_FILE_NAME = 'index.json';
const INDEX_FILE_VERSION = 1;

// Simple i18n dictionary for field descriptions only
const I18N = {
  en: {
    'desc.clientId': 'Yandex OAuth Client ID used for Connect.',
    'desc.accessToken': 'Paste token manually. Value saves automatically. Use Open OAuth token page to launch the OAuth flow. Stored in plugin data.',
    'desc.oauthBaseUrl': 'Used for authorization and portal links.',
    'desc.oauthScopes': 'Leave empty to use scopes configured for your Yandex app. For app-folder only, keep this empty to avoid invalid_scope.',
    'desc.remoteBase': "Root on Yandex.Disk. For app-folder tokens, use 'app:/' (recommended). The vault will sync into the subfolder below.",
    'desc.vaultFolderName': 'Subfolder under remote base where this vault is stored (only the folder name). Default: current vault name',
    'desc.localScope': 'Relative path in vault to sync (empty = whole vault)',
    'desc.ignorePatterns': 'Comma-separated globs (e.g., .obsidian/**, **/.trash/**)',
    'desc.syncMode': 'Direction of sync: two-way (both directions), upload (local → cloud), download (cloud → local). Deletions follow Delete policy.',
    'desc.deletePolicy': 'Controls deletions. mirror: apply removals across sides based on last sync index (only if the other side did not change). skip: never delete automatically. Start with skip for safety; use mirror for true mirroring.',
    'desc.strategy': 'How to resolve simultaneous edits: newest-wins uses timestamps (overwrites the older side; within tolerance prefers local); duplicate-both creates two local copies ("… (conflict … local)" and "… (conflict … remote)").',
    'desc.tolerance': 'Time buffer for newest-wins. If local vs cloud modified times differ by less than this many seconds, treat them as equal and prefer the local version. Increase for clock drift; decrease for stricter comparison.',
    'desc.autoSync': 'Minutes between automatic syncs. 0 disables. Runs only while Obsidian is open. Typical: 5–30 min.',
    'desc.syncOnStartup': 'Run a sync automatically when Obsidian starts (after UI is ready).',
    'desc.syncNow': 'Run sync with current settings (mode, deletes, filters)',
    'desc.dryRun': 'Preview the sync plan without making changes. Opens a diagnostics window with the list of planned operations.',
    'desc.diagnostics': 'Open diagnostics: shows environment summary (paths, mode), last API check, last HTTP error, and recent logs. Set how many lines to show below.',
    'desc.maxSize': 'Skip local files larger than this during uploads. Default: 200.',
    'desc.concurrency': 'Parallel transfers (upload/download). High values may cause 429/409; recommended 1–3 / 1–4.',
    'desc.syncOnStartupDelay': 'Delay before startup sync runs (seconds). 0 = no delay.',
    'heading.required': 'Required settings',
    'heading.optional': 'Optional settings',
    'heading.conflict': 'Conflict handling',
    'heading.actions': 'Actions',
    'heading.diagnostics': 'Diagnostics',
  },
  ru: {
    'desc.clientId': 'ID клиента Яндекс OAuth, используется для подключения.',
    'desc.accessToken': 'Вставьте токен вручную — значение сохраняется автоматически. Кнопка Open OAuth token page откроет страницу OAuth. Значение хранится в данных плагина.',
    'desc.oauthBaseUrl': 'Используется для авторизации и ссылок портала.',
    'desc.oauthScopes': 'Оставьте пустым, чтобы использовать права, настроенные у вашего приложения. Для режима «папка приложения» оставьте пустым, иначе будет invalid_scope.',
    'desc.remoteBase': "Корневая папка на Яндекс.Диске. Для токенов с доступом к папке приложения используйте 'app:/' (рекомендуется). Вольт будет синхронизироваться в подпапку ниже.",
    'desc.vaultFolderName': 'Подпапка внутри удалённой базы для этого вольта (только имя папки). По умолчанию — имя текущего вольта.',
    'desc.localScope': 'Относительный путь внутри вольта для синхронизации (пусто = весь Vault)',
    'desc.ignorePatterns': 'Список шаблонов через запятую (например, .obsidian/**, **/.trash/**)',
    'desc.syncMode': 'Направление синхронизации: two-way (в обе стороны), upload (локально → облако), download (облако → локально). Удаления зависят от Delete policy.',
    'desc.deletePolicy': 'Управляет удалениями. mirror: отражать удаления между сторонами по индексу последней синхронизации (только если другая сторона не менялась). skip: ничего не удалять автоматически. Для начала безопаснее skip; mirror — для полного зеркала.',
    'desc.strategy': 'Как разрешать одновременные правки: newest-wins — по времени (перезаписывает более старую сторону; в пределах допуска предпочитает локальную); duplicate-both — создаёт две локальные копии ("… (conflict … local)" и "… (conflict … remote)").',
    'desc.tolerance': 'Допуск по времени для newest-wins. Если разница между временем изменения локальной и облачной версии меньше этого количества секунд, считаем их равными и берём локальную. Увеличьте при рассинхроне часов; уменьшите для более строгой проверки.',
    'desc.autoSync': 'Интервал (в минутах) между автосинхронизациями. 0 — выключено. Работает только пока открыт Obsidian. Типично: 5–30 мин.',
    'desc.syncOnStartup': 'Автоматически запускать синхронизацию при старте Obsidian (после загрузки интерфейса).',
    'desc.syncNow': 'Запустить синхронизацию по текущим настройкам (режим, удаления, фильтры)',
    'desc.dryRun': 'Предпросмотр плана без изменений. Откроется окно диагностики со списком запланированных операций.',
    'desc.diagnostics': 'Открыть диагностику: сводка окружения (пути, режим), последняя проверка API, последний HTTP‑код и последние строки журнала. Ниже можно указать, сколько строк показывать.',
    'desc.maxSize': 'Пропускать локальные файлы больше этого порога при выгрузке. По умолчанию: 200.',
    'desc.concurrency': 'Параллельные передачи (upload/download). Большие значения могут вызвать 429/409; рекомендация 1–3 / 1–4.',
    'desc.syncOnStartupDelay': 'Задержка перед запуском синхронизации при старте (в секундах). 0 = без задержки.',
    'heading.required': 'Обязательные параметры',
    'heading.optional': 'Дополнительные параметры',
    'heading.conflict': 'Разрешение конфликтов',
    'heading.actions': 'Действия',
    'heading.diagnostics': 'Диагностика',
  },
};

const DEFAULT_SETTINGS = {
  // OAuth
  clientId: '',
  accessToken: '',
  oauthBaseUrl: 'https://oauth.yandex.ru',
  // Leave empty to rely on scopes configured for the app in Yandex OAuth (recommended).
  // For app-folder-only apps, keep this empty to avoid invalid_scope.
  oauthScopes: '',
  // Paths
  localBasePath: '', // '' = whole vault
  // Prefer app-folder alias for safer defaults with app-folder tokens
  remoteBasePath: 'app:/',
  // Filters
  ignorePatterns: ['.obsidian/**', '**/.trash/**'],
  excludeExtensions: [],
  maxSizeMB: 200,
  // Policies
  syncMode: 'two-way', // 'two-way' | 'upload' | 'download'
  deletePolicy: 'mirror', // 'mirror' | 'skip'
  // Performance
  uploadConcurrency: 2,
  downloadConcurrency: 2,
  // Auto sync
  autoSyncIntervalMin: 0, // 0 = off
  // Diagnostics
  logLimit: 500,
  diagnosticsLines: 50,
  // Conflict handling
  timeSkewToleranceSec: 180, // resolve by newest with this tolerance
  conflictStrategy: 'newest-wins', // 'newest-wins' | 'duplicate-both'
  // UI
  showStatusBar: true,
  progressLines: 25,
  // Vault folder subdir under remote base
  vaultFolderName: '',
  _autoVaultNameApplied: false,
  // Startup behavior
  syncOnStartup: false,
  syncOnStartupDelaySec: 3,
  // i18n
  lang: 'auto', // 'auto' | 'en' | 'ru'
};

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function copyTextToClipboard(text, successMessage, failureMessage) {
  const value = text || '';
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    new Notice(successMessage);
    return true;
  } catch (_) {
    new Notice(failureMessage);
    return false;
  }
}

// Convert a simple glob (supports **, *, ?) to RegExp. Escapes regex meta as needed.
function globToRegExp(glob) {
  const reStr = '^' + glob
    .replace(/[.+^${}()|\[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DOUBLE_STAR::/g, '.*') + '$';
  return new RegExp(reStr);
}

function pathJoin(...parts) {
  const filtered = parts.filter(Boolean);
  if (!filtered.length) return '';
  return normalizePath(filtered.join('/'));
}

function createEmptyIndex() {
  return { files: {}, lastSyncAt: null };
}

function sanitizeIndexForHash(index) {
  const safe = index && typeof index === 'object' ? index : {};
  const lastSyncAt = typeof safe.lastSyncAt === 'string' ? safe.lastSyncAt : null;
  const files = {};
  const source = safe.files && typeof safe.files === 'object' ? safe.files : {};
  for (const rel of Object.keys(source).sort()) {
    const entry = source[rel];
    if (!entry || typeof entry !== 'object') continue;
    const sortedEntry = {};
    for (const key of Object.keys(entry).sort()) {
      sortedEntry[key] = entry[key];
    }
    files[rel] = sortedEntry;
  }
  return { lastSyncAt, files };
}

function computeIndexHash(index) {
  try {
    const normalized = sanitizeIndexForHash(index || {});
    const json = JSON.stringify(normalized);
    return crypto.createHash('sha1').update(json).digest('hex');
  } catch (_) {
    return null;
  }
}

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function normalizeRelPath(rel) {
  if (!rel) return '';
  return normalizePath(`${rel}`).replace(/^\/+/, '');
}

class DiagnosticsModal extends Modal {
  constructor(app, text) {
    super(app);
    this.text = text;
  }
  setText(text) {
    this.text = text || '';
    if (this.preEl) this.preEl.setText(this.text);
  }
  onOpen() {
    const { contentEl, modalEl, titleEl } = this;
    contentEl.empty();

    titleEl.setText('Yandex Disk Sync — Diagnostics');

    modalEl.addClass('yds-modal');
    modalEl.addClass('yds-diagnostics-modal');
    contentEl.addClass('yds-modal-content');

    const toolbar = contentEl.createEl('div', { cls: 'yds-modal-toolbar' });
    const copyBtn = toolbar.createEl('button', { text: 'Copy all' });
    copyBtn.addEventListener('click', () => {
      copyTextToClipboard(this.text || '', 'Diagnostics copied to clipboard', 'Copy failed');
    });

    const pre = (this.preEl = contentEl.createEl('pre', { cls: 'yds-modal-pre' }));
    pre.setText(this.text);
  }
}

class ProgressModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this._timer = null;
  }
  onOpen() {
    const { contentEl, modalEl, titleEl } = this;
    contentEl.empty();
    titleEl.setText('Yandex Disk Sync — Progress');

    modalEl.addClass('yds-modal');
    modalEl.addClass('yds-progress-modal');
    contentEl.addClass('yds-progress-content');

    const toolbar = contentEl.createEl('div', { cls: 'yds-progress-toolbar' });

    const syncBtn = toolbar.createEl('button', { text: 'Sync now' });
    syncBtn.onclick = () => {
      if (this.plugin.currentRun?.active) { new Notice('Sync is already running'); return; }
      this.plugin.syncNow(false);
    };

    const dryBtn = toolbar.createEl('button', { text: 'Dry-run' });
    dryBtn.onclick = () => {
      if (this.plugin.currentRun?.active) { new Notice('Sync is already running'); return; }
      this.plugin.syncNow(true);
    };

    const copyBtn = toolbar.createEl('button', { text: 'Copy all' });
    copyBtn.onclick = () => {
      copyTextToClipboard(this.plugin.getProgressSummary(), 'Progress copied to clipboard', 'Copy failed');
    };

    const cancelBtn = toolbar.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.plugin.cancelCurrentRun();

    const pre = (this.preEl = contentEl.createEl('pre', { cls: 'yds-modal-pre' }));

    const render = () => {
      pre.setText(this.plugin.getProgressSummary());
    };
    render();
    this._timer = setInterval(render, 500);
  }
  onClose() {
    if (this._timer) clearInterval(this._timer);
  }
}

class YandexDiskSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    try { containerEl.addClass('yds-copyable'); } catch (_) {}

    // Language selector at the top
    new Setting(containerEl)
      .setName('Language')
      .setDesc('Language for field descriptions (Auto/English/Русский)')
      .addDropdown((dd) =>
        dd
          .addOptions({ auto: 'Auto', en: 'English', ru: 'Русский' })
          .setValue(this.plugin.settings.lang || 'auto')
          .onChange(async (v) => {
            this.plugin.settings.lang = v;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl).setName(this.plugin.t('heading.required')).setHeading();

    new Setting(containerEl)
      .setName('OAuth base URL')
      .setDesc(this.plugin.t('desc.oauthBaseUrl'))
      .addText((txt) =>
        txt
          .setPlaceholder(DEFAULT_SETTINGS.oauthBaseUrl)
          .setValue(this.plugin.settings.oauthBaseUrl)
          .onChange(async (v) => {
            const val = (v || '').trim() || DEFAULT_SETTINGS.oauthBaseUrl;
            this.plugin.settings.oauthBaseUrl = val;
            await this.plugin.saveSettings();
          }),
      )
      .addButton((b) =>
        b
          .setButtonText('Open OAuth portal page')
          .onClick(() => this.plugin.openOAuthManagement()),
      );

    new Setting(containerEl)
      .setName('Client ID')
      .setDesc(this.plugin.t('desc.clientId'))
      .addText((txt) =>
        txt
          .setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
          .setValue(this.plugin.settings.clientId)
          .onChange(async (v) => {
            this.plugin.settings.clientId = v.trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((b) =>
        b
          .setButtonText('Open OAuth portal page')
          .onClick(() => this.plugin.openOAuthManagement()),
      );

    const defaultTokenDesc = this.plugin.t('desc.accessToken');
    const tokenSetting = new Setting(containerEl).setName('Access token').setDesc(defaultTokenDesc);

    tokenSetting.addText((txt) => {
      txt
        .setPlaceholder('(paste access token)')
        .setValue(this.plugin.settings.accessToken || '')
        .onChange(async (v) => {
          const value = (v || '').trim();
          this.plugin.settings.accessToken = value;
          await this.plugin.saveSettings();
        });
    });

    tokenSetting.addButton((b) =>
      b
        .setButtonText('Open OAuth token page')
        .onClick(() => this.plugin.startOAuthFlow()),
    );

    new Setting(containerEl).setName(this.plugin.t('heading.optional')).setHeading();

    new Setting(containerEl)
      .setName('OAuth scopes (optional)')
      .setDesc(this.plugin.t('desc.oauthScopes'))
      .addText((txt) =>
        txt
          .setPlaceholder('(empty = use app defaults)')
          .setValue(this.plugin.settings.oauthScopes || '')
          .onChange(async (v) => {
            this.plugin.settings.oauthScopes = (v || '').trim();
            await this.plugin.saveSettings();
          }),
      )
      .addButton((b) =>
        b
          .setButtonText('Use app folder')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.oauthScopes = '';
            this.plugin.settings.remoteBasePath = 'app:/';
            await this.plugin.saveSettings();
            new Notice('Scopes cleared. Remote base set to app:/');
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName('Remote base folder')
      .setDesc(this.plugin.t('desc.remoteBase'))
      .addText((txt) =>
        txt
          .setPlaceholder('app:/')
          .setValue(this.plugin.settings.remoteBasePath)
          .onChange(async (v) => {
            this.plugin.settings.remoteBasePath = v.trim() || '/';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Vault folder name')
      .setDesc(this.plugin.t('desc.vaultFolderName'))
      .addText((txt) =>
        txt
          .setPlaceholder(this.plugin.getSuggestedVaultFolderName())
          .setValue(this.plugin.settings.vaultFolderName || this.plugin.getSuggestedVaultFolderName())
          .onChange(async (v) => {
            let name = (v || '').trim();
            // Strip slashes and backslashes to keep it as a folder name only
            name = name.replace(/[\\/]+/g, '');
            if (!name) name = this.plugin.getSuggestedVaultFolderName();
            this.plugin.settings.vaultFolderName = name;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Local scope')
      .setDesc(this.plugin.t('desc.localScope'))
      .addText((txt) =>
        txt
          .setPlaceholder('(root)')
          .setValue(this.plugin.settings.localBasePath)
          .onChange(async (v) => {
            this.plugin.settings.localBasePath = normalizeRelPath(v.trim());
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Ignore patterns')
      .setDesc(this.plugin.t('desc.ignorePatterns'))
      .addTextArea((txt) =>
        txt
          .setPlaceholder('.obsidian/**, **/.trash/**')
          .setValue(this.plugin.settings.ignorePatterns.join(', '))
          .onChange(async (v) => {
            this.plugin.settings.ignorePatterns = v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            this.plugin.invalidateIgnoreCache();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Sync mode')
      .setDesc(this.plugin.t('desc.syncMode'))
      .addDropdown((dd) =>
        dd
          .addOptions({ 'two-way': 'two-way', upload: 'upload', download: 'download' })
          .setValue(this.plugin.settings.syncMode)
          .onChange(async (v) => {
            this.plugin.settings.syncMode = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Delete policy')
      .setDesc(this.plugin.t('desc.deletePolicy'))
      .addDropdown((dd) =>
        dd
          .addOptions({ mirror: 'mirror', skip: 'skip' })
          .setValue(this.plugin.settings.deletePolicy)
          .onChange(async (v) => {
            this.plugin.settings.deletePolicy = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName(this.plugin.t('heading.conflict')).setHeading();

    new Setting(containerEl)
      .setName('Strategy')
      .setDesc(this.plugin.t('desc.strategy'))
      .addDropdown((dd) =>
        dd
          .addOptions({ 'newest-wins': 'newest-wins', 'duplicate-both': 'duplicate-both' })
          .setValue(this.plugin.settings.conflictStrategy || 'newest-wins')
          .onChange(async (v) => {
            this.plugin.settings.conflictStrategy = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Time skew tolerance (sec)')
      .setDesc(this.plugin.t('desc.tolerance'))
      .addText((txt) =>
        txt
          .setPlaceholder('180')
          .setValue(String(this.plugin.settings.timeSkewToleranceSec || 0))
          .onChange(async (v) => {
            const n = Math.max(0, Math.min(3600, Number(v) || 0));
            this.plugin.settings.timeSkewToleranceSec = n;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Max file size (MB)')
      .setDesc(this.plugin.t('desc.maxSize'))
      .addText((txt) =>
        txt
          .setValue(String(this.plugin.settings.maxSizeMB))
          .onChange(async (v) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return;
            this.plugin.settings.maxSizeMB = n;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Concurrency (upload/download)')
      .setDesc(this.plugin.t('desc.concurrency'))
      .addText((txt) =>
        txt
          .setPlaceholder('upload')
          .setValue(String(this.plugin.settings.uploadConcurrency))
          .onChange(async (v) => {
            const n = Math.max(1, Math.min(8, Number(v) || 1));
            this.plugin.settings.uploadConcurrency = n;
            await this.plugin.saveSettings();
          }),
      )
      .addText((txt) =>
        txt
          .setPlaceholder('download')
          .setValue(String(this.plugin.settings.downloadConcurrency))
          .onChange(async (v) => {
            const n = Math.max(1, Math.min(8, Number(v) || 1));
            this.plugin.settings.downloadConcurrency = n;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Auto-sync interval (minutes)')
      .setDesc(this.plugin.t('desc.autoSync'))
      .addText((txt) =>
        txt
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.autoSyncIntervalMin))
          .onChange(async (v) => {
            const n = Math.max(0, Math.min(1440, Number(v) || 0));
            this.plugin.settings.autoSyncIntervalMin = n;
            await this.plugin.saveSettings();
            this.plugin.resetAutoSyncTimer();
          }),
      );

    new Setting(containerEl)
      .setName('Sync on startup')
      .setDesc(this.plugin.t('desc.syncOnStartup'))
      .addToggle((tg) =>
        tg
          .setValue(!!this.plugin.settings.syncOnStartup)
          .onChange(async (v) => {
            this.plugin.settings.syncOnStartup = !!v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Startup delay (sec)')
      .setDesc(this.plugin.t('desc.syncOnStartupDelay'))
      .addText((txt) =>
        txt
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.syncOnStartupDelaySec || 0))
          .onChange(async (v) => {
            const n = Math.max(0, Math.min(3600, Number(v) || 0));
            this.plugin.settings.syncOnStartupDelaySec = n;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName(this.plugin.t('heading.actions')).setHeading();

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc(this.plugin.t('desc.syncNow'))
      .addButton((b) => b.setCta().setButtonText('Sync').onClick(() => this.plugin.syncNow(false)));

    new Setting(containerEl)
      .setName('Dry-run (plan only)')
      .setDesc(this.plugin.t('desc.dryRun'))
      .addButton((b) => b.setButtonText('Build plan').onClick(() => this.plugin.syncNow(true)));

    new Setting(containerEl).setName(this.plugin.t('heading.diagnostics')).setHeading();
    new Setting(containerEl)
      .setName('Diagnostics')
      .setDesc(this.plugin.t('desc.diagnostics'))
      .addText((txt) =>
        txt
          .setPlaceholder(String(DEFAULT_SETTINGS.diagnosticsLines))
          .setValue(String(this.plugin.settings.diagnosticsLines || DEFAULT_SETTINGS.diagnosticsLines))
          .onChange(async (v) => {
            let n = Number(v);
            if (!Number.isFinite(n)) return;
            n = Math.max(1, Math.min(this.plugin.settings.logLimit || 500, Math.floor(n)));
            this.plugin.settings.diagnosticsLines = n;
            await this.plugin.saveSettings();
          }),
      )
      .addButton((b) => b.setButtonText('Open').onClick(() => this.plugin.showDiagnostics()));
  }
}

class YandexDiskSyncPlugin extends Plugin {
  async onload() {
    this.log = [];
    this.index = createEmptyIndex();
    this.indexMeta = { hash: null, version: INDEX_FILE_VERSION };
    this.indexHash = null;
    this._indexDirEnsured = false;
    this._indexFileKnownExists = false;
    this._persistedExtra = {};
    this.currentRun = null;
    this.statusBar = null;

    await this.loadSettings();
    // One-time migration: if vaultFolderName is unset or legacy 'vault', apply suggested vault name
    try {
      if (!this.settings._autoVaultNameApplied && (!this.settings.vaultFolderName || this.settings.vaultFolderName === 'vault')) {
        this.settings.vaultFolderName = this.getSuggestedVaultFolderName();
        this.settings._autoVaultNameApplied = true;
        await this.saveSettings();
      }
    } catch (_) {}

    this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => this.syncNow(false) });
    this.addCommand({ id: 'dry-run', name: 'Dry-run (plan only)', callback: () => this.syncNow(true) });
    this.addCommand({ id: 'diagnostics', name: 'Diagnostics', callback: () => this.showDiagnostics() });

    this.settingTab = new YandexDiskSyncSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // Ensure settings text (names/descriptions) is selectable/copyable
    try {
      this._copyStyleEl = document.createElement('style');
      this._copyStyleEl.textContent = `.yds-copyable, .yds-copyable * { user-select: text !important; -webkit-user-select: text !important; }`;
      document.head.appendChild(this._copyStyleEl);
    } catch (_) {}

    this.resetAutoSyncTimer();

    if (this.settings.showStatusBar) this.initStatusBar();
    this.initRibbon();

    // Optional: run sync on startup after layout is ready
    if (this.settings.syncOnStartup) {
      const start = () => {
        if (this.settings.accessToken) this.syncNow(false).catch(() => {});
      };
      const delayMs = Math.max(0, (Number(this.settings.syncOnStartupDelaySec) || 0) * 1000);
      try {
        if (this.app?.workspace?.onLayoutReady) this.app.workspace.onLayoutReady(() => setTimeout(start, delayMs));
        else setTimeout(start, Math.max(2000, delayMs));
      } catch (_) {
        setTimeout(start, Math.max(2000, delayMs));
      }
    }

    this.registerEvent(this.app.vault.on('modify', (f) => this.onLocalEvent('modify', f)));
    this.registerEvent(this.app.vault.on('create', (f) => this.onLocalEvent('create', f)));
    this.registerEvent(this.app.vault.on('delete', (f) => this.onLocalEvent('delete', f)));
    this.registerEvent(this.app.vault.on('rename', (f, oldPath) => this.onLocalEvent('rename', f, oldPath)));

    this.logInfo('Loaded Yandex Disk Sync');
  }

  onunload() {
    if (this._autoTimer) clearInterval(this._autoTimer);
    try {
      if (this._progressModal) this._progressModal.close();
    } catch (_) {}
    this._progressModal = null;
    try { this._copyStyleEl?.remove(); } catch (_) {}
  }

  getLang() {
    const pref = this.settings?.lang || 'auto';
    if (pref === 'en' || pref === 'ru') return pref;
    try {
      const nav = (typeof navigator !== 'undefined' && navigator.language) ? String(navigator.language).toLowerCase() : '';
      return nav.startsWith('ru') ? 'ru' : 'en';
    } catch (_) {
      return 'en';
    }
  }

  t(key) {
    const lang = this.getLang();
    return (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});

    this._persistedExtra = {};
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (key === 'settings' || key === 'index' || key === 'indexMeta') continue;
        this._persistedExtra[key] = data[key];
      }
    }

    const storedMeta = data && typeof data.indexMeta === 'object' ? data.indexMeta : null;
    const { index, hash, existed } = await this.readIndexFile();
    this.index = index;
    this.indexHash = hash || computeIndexHash(index);
    this.indexMeta = { hash: this.indexHash, version: INDEX_FILE_VERSION };
    if (!existed) {
      try {
        const rebuiltHash = await this.writeIndexFile(this.index);
        this.indexHash = rebuiltHash;
        this.indexMeta.hash = rebuiltHash;
      } catch (e) {
        this.logWarn(`Не удалось создать файл индекса: ${e?.message || e}`);
      }
    }

    if ((storedMeta && storedMeta.hash) !== this.indexMeta.hash) {
      try {
        await this.saveData(Object.assign({}, this._persistedExtra, { settings: this.settings, indexMeta: this.indexMeta }));
      } catch (e) {
        this.logWarn(`Не удалось обновить данные настроек: ${e?.message || e}`);
      }
    }

    this.invalidateIgnoreCache();
  }

  async saveSettings() {
    await this.persistIndexIfNeeded(false);
    try {
      await this.saveData(Object.assign({}, this._persistedExtra, { settings: this.settings, indexMeta: this.indexMeta }));
    } catch (e) {
      this.logWarn(`Не удалось сохранить настройки: ${e?.message || e}`);
    }
  }

  getPluginDataDir() {
    const configDir = this.app?.vault?.configDir || '.obsidian';
    const pluginId = this.manifest?.id || PLUGIN_ID;
    return pathJoin(configDir, 'plugins', pluginId);
  }

  getIndexFilePath() {
    return pathJoin(this.getPluginDataDir(), INDEX_FILE_NAME);
  }

  async ensureIndexDir() {
    if (this._indexDirEnsured) return;
    try {
      const adapter = this.app?.vault?.adapter;
      if (!adapter) return;
      const dir = this.getPluginDataDir();
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      this._indexDirEnsured = true;
    } catch (e) {
      this.logWarn(`Failed to create index directory: ${e?.message || e}`);
    }
  }

  async indexFileExists() {
    try {
      const adapter = this.app?.vault?.adapter;
      if (!adapter) return false;
      const exists = await adapter.exists(this.getIndexFilePath());
      this._indexFileKnownExists = exists;
      return exists;
    } catch (e) {
      this._indexFileKnownExists = false;
      return false;
    }
  }

  async readIndexFile() {
    const adapter = this.app?.vault?.adapter;
    if (!adapter) {
      const empty = createEmptyIndex();
      return { index: empty, hash: computeIndexHash(empty), existed: false };
    }
    try {
      const filePath = this.getIndexFilePath();
      const exists = await adapter.exists(filePath);
      if (!exists) {
        this._indexFileKnownExists = false;
        const empty = createEmptyIndex();
        return { index: empty, hash: computeIndexHash(empty), existed: false };
      }
      const raw = await adapter.read(filePath);
      let parsed = {};
      if (raw && raw.trim().length) {
        try { parsed = JSON.parse(raw); }
        catch (err) {
          this.logWarn(`Index is corrupted, will be rebuilt: ${err?.message || err}`);
          parsed = {};
        }
      }
      const body = parsed && typeof parsed === 'object' ? parsed : {};
      const filesSource = body.files && typeof body.files === 'object' ? body.files : {};
      const files = {};
      for (const key of Object.keys(filesSource)) files[key] = filesSource[key];
      const lastSyncAt = typeof body.lastSyncAt === 'string' ? body.lastSyncAt : null;
      const index = { files, lastSyncAt };
      const hash = computeIndexHash(index);
      this._indexFileKnownExists = true;
      return { index, hash, existed: true };
    } catch (e) {
      this._indexFileKnownExists = false;
      this.logWarn(`Failed to read index file: ${e?.message || e}`);
      return { index: createEmptyIndex(), hash: null, existed: false };
    }
  }

  async writeIndexFile(index) {
    const adapter = this.app?.vault?.adapter;
    if (!adapter) throw new Error('Vault adapter unavailable');
    await this.ensureIndexDir();
    const filesSource = index.files && typeof index.files === 'object' ? index.files : {};
    const files = {};
    for (const key of Object.keys(filesSource)) files[key] = filesSource[key];
    const payload = {
      version: INDEX_FILE_VERSION,
      lastSyncAt: typeof index.lastSyncAt === 'string' ? index.lastSyncAt : null,
      files,
    };
    await adapter.write(this.getIndexFilePath(), JSON.stringify(payload));
    this._indexFileKnownExists = true;
    return computeIndexHash(payload);
  }

  async persistIndexIfNeeded(force = false) {
    const current = this.index && typeof this.index === 'object' ? this.index : createEmptyIndex();
    const newHash = computeIndexHash(current);
    let needWrite = force || !this.indexHash || this.indexHash !== newHash;
    if (!needWrite) {
      if (!this._indexFileKnownExists) {
        const exists = await this.indexFileExists();
        needWrite = !exists;
      }
    }
    if (needWrite) {
      try {
        const writtenHash = await this.writeIndexFile(current);
        this.indexHash = writtenHash;
        this.indexMeta = { hash: writtenHash, version: INDEX_FILE_VERSION };
        return;
      } catch (e) {
        this.logWarn(`Не удалось обновить файл индекса: ${e?.message || e}`);
      }
    }
    this.indexHash = newHash;
    this.indexMeta = { hash: newHash, version: INDEX_FILE_VERSION };
  }

  initStatusBar() {
    try {
      this.statusBar = this.addStatusBarItem();
      try { this.statusBar.addClass('yds-status-bar'); }
      catch (_) { this.statusBar.classList?.add('yds-status-bar'); }
      this.statusBar.onclick = () => this.openProgress();
      this.updateStatusBar('Idle');
    } catch (_) {}
  }

  initRibbon() {
    try {
      this.ribbonEl = this.addRibbonIcon(
        'refresh-ccw',
        'Yandex Disk Sync — Sync now',
        async () => {
          if (this.currentRun?.active) {
            new Notice('Sync is already running');
            this.openProgress();
            return;
          }
          await this.syncNow(false);
        },
      );
      this.ribbonEl.addClass('yandex-disk-sync-ribbon');
    } catch (_) {}
  }

  updateStatusBar(state) {
    if (!this.statusBar) return;
    const run = this.currentRun;
    const total = run?.total || 0;
    const done = run?.done || 0;
    const failed = run?.failed || 0;
    const txt = total
      ? `YDS: ${state} (done:${done} failed:${failed} total:${total})`
      : `YDS: ${state}`;
    this.statusBar.textContent = txt;
    try {
      if (this.ribbonEl) {
        this.ribbonEl.setAttribute('aria-label', txt);
        this.ribbonEl.setAttribute('title', txt);
      }
    } catch (_) {}
    const stateClasses = ['is-running', 'is-throttled', 'is-error', 'is-done'];
    for (const cls of stateClasses) {
      try { this.statusBar.removeClass(cls); }
      catch (_) { this.statusBar.classList?.remove(cls); }
    }
    const classMap = {
      Running: 'is-running',
      Uploading: 'is-running',
      Downloading: 'is-running',
      Throttled: 'is-throttled',
      Error: 'is-error',
      Done: 'is-done',
    };
    const cls = classMap[state];
    if (cls) {
      try { this.statusBar.addClass(cls); }
      catch (_) { this.statusBar.classList?.add(cls); }
    }
    this.statusBar.title = `Last sync: ${this.index.lastSyncAt || 'never'}`;
  }

  openProgress() {
    if (!this._progressModal) this._progressModal = new ProgressModal(this.app, this);
    this._progressModal.open();
  }

  startRun(dryRun, planCount = 0) {
    this.currentRun = {
      active: true,
      dryRun: !!dryRun,
      startAt: Date.now(),
      phase: 'Planning',
      total: planCount,
      done: 0,
      failed: 0,
      queued: planCount,
      canceled: false,
      lastOps: [],
      counts: { upload: { queued: 0, done: 0 }, download: { queued: 0, done: 0 }, del: { queued: 0, done: 0 }, conflict: { queued: 0, done: 0 } },
    };
    this.updateStatusBar('Planning');
  }

  setRunPlan(plan) {
    const c = { upload: 0, download: 0, del: 0, conflict: 0 };
    for (const op of plan) {
      if (op.type === 'upload') c.upload++;
      else if (op.type === 'download') c.download++;
      else if (op.type === 'remote-delete' || op.type === 'local-delete') c.del++;
      else if (op.type === 'conflict') c.conflict++;
    }
    const r = this.currentRun;
    if (!r) return;
    r.total = plan.length;
    r.queued = plan.length;
    r.counts.upload.queued = c.upload;
    r.counts.download.queued = c.download;
    r.counts.del.queued = c.del;
    r.counts.conflict.queued = c.conflict;
    this.updateStatusBar('Running');
  }

  finishRun(ok) {
    const r = this.currentRun;
    if (!r) return;
    r.active = false;
    r.endAt = Date.now();
    this.updateStatusBar(ok ? 'Done' : 'Error');
  }

  cancelCurrentRun() {
    if (this.currentRun?.active) {
      this.currentRun.canceled = true;
      this.logWarn('Cancellation requested by user');
    }
  }

  reportOpStart(op) {
    const r = this.currentRun; if (!r) return;
    r.phase = op.type;
    this.updateStatusBar(op.type === 'upload' ? 'Uploading' : op.type === 'download' ? 'Downloading' : 'Running');
  }
  reportOpEnd(op, ok, errMsg) {
    const r = this.currentRun; if (!r) return;
    r.done += ok ? 1 : 0;
    r.failed += ok ? 0 : 1;
    r.queued = Math.max(0, r.queued - 1);
    const bucket = op.type === 'upload' ? 'upload' : op.type === 'download' ? 'download' : op.type === 'conflict' ? 'conflict' : 'del';
    if (r.counts[bucket]) {
      r.counts[bucket].done += ok ? 1 : 0;
      r.counts[bucket].queued = Math.max(0, r.counts[bucket].queued - 1);
    }
    const line = `${ok ? 'OK' : 'FAIL'} ${op.type} ${op.rel || ''}` + (op.toAbs ? ` -> ${op.toAbs}` : '') + (op.fromAbs ? ` <- ${op.fromAbs}` : '') + (ok ? '' : ` — ${errMsg || ''}`);
    r.lastOps.push(line);
    const cap = Math.max(1, this.settings.progressLines || 25);
    while (r.lastOps.length > cap) r.lastOps.shift();
  }

  getProgressSummary() {
    const r = this.currentRun;
    if (!r) return 'No active sync.';
    const elapsed = ((Date.now() - r.startAt) / 1000).toFixed(1);
    const uploadTotal = r.counts.upload.done + r.counts.upload.queued;
    const downloadTotal = r.counts.download.done + r.counts.download.queued;
    const deleteTotal = r.counts.del.done + r.counts.del.queued;
    const conflictTotal = r.counts.conflict.done + r.counts.conflict.queued;
    const countsLineParts = [
      `Uploads: ${r.counts.upload.done}/${uploadTotal}`,
      `Downloads: ${r.counts.download.done}/${downloadTotal}`,
      `Deletes: ${r.counts.del.done}/${deleteTotal}`,
    ];
    if (conflictTotal) countsLineParts.push(`Conflicts: ${r.counts.conflict.done}/${conflictTotal}`);
    const header = [
      `Phase: ${r.phase}${r.canceled ? ' (cancelling...)' : ''}`,
      `Progress: ${r.done}/${r.total} (failed ${r.failed}, queued ${r.queued})`,
      countsLineParts.join('  '),
      `Elapsed: ${elapsed}s`,
      '',
      'Recent ops:',
      ...(r.lastOps.length ? r.lastOps.slice().reverse() : ['(none)']),
    ].join('\n');
    return header;
  }

  resetAutoSyncTimer() {
    if (this._autoTimer) clearInterval(this._autoTimer);
    const minutes = this.settings.autoSyncIntervalMin;
    if (minutes > 0) {
      this._autoTimer = setInterval(() => this.syncNow(false).catch(() => {}), minutes * 60 * 1000);
    }
  }

  logInfo(msg) {
    const line = `[${nowIso()}] INFO ${msg}`;
    console.log(`[${PLUGIN_ID}]`, msg);
    this.log.push(line);
    if (this.log.length > this.settings.logLimit) this.log.shift();
  }
  logWarn(msg) {
    const line = `[${nowIso()}] WARN ${msg}`;
    console.warn(`[${PLUGIN_ID}]`, msg);
    this.log.push(line);
    if (this.log.length > this.settings.logLimit) this.log.shift();
  }
  logError(msg) {
    const line = `[${nowIso()}] ERROR ${msg}`;
    console.error(`[${PLUGIN_ID}]`, msg);
    this.log.push(line);
    if (this.log.length > this.settings.logLimit) this.log.shift();
  }

  async showDiagnostics() {
    const token = this.settings.accessToken || '';
    const tokenTail = token ? token.slice(-6) : '';
    const api = this.lastApiCheck;
    const lines = Math.max(1, Math.min(this.settings.logLimit || 500, Number(this.settings.diagnosticsLines || 50)));
    const summary = [
      `Local scope: ${this.settings.localBasePath || '(root)'}`,
      `Remote base: ${this.getRemoteBase()}`,
      `Sync mode: ${this.settings.syncMode}, Delete: ${this.settings.deletePolicy}`,
      `Conflict: ${this.settings.conflictStrategy}${this.settings.conflictStrategy==='newest-wins' ? ` (tolerance ${this.settings.timeSkewToleranceSec || 0}s)` : ''}`,
      `Concurrency: up ${this.settings.uploadConcurrency}, down ${this.settings.downloadConcurrency}`,
      `Auto-sync: ${this.settings.autoSyncIntervalMin} min`,
      `OAuth base: ${this.getOAuthBase()}`,
      `Client ID set: ${this.settings.clientId ? 'yes' : 'no'}`,
      `Token present: ${token ? 'yes' : 'no'}${token ? ` (****${tokenTail})` : ''}`,
      `Scopes: ${this.settings.oauthScopes ? this.settings.oauthScopes : '(app defaults)'}`,
      `API check: ${api ? (api.ok ? `OK for ${api.path || this.settings.remoteBasePath}` : `ERROR ${api.error}`) : 'not run'}${api?.at ? ` at ${api.at}` : ''}`,
      `Last sync: ${this.index.lastSyncAt || 'never'}`,
      `Items indexed: ${Object.keys(this.index.files).length}`,
      `Last HTTP error: ${this.lastHttpError || '-'}`,
      '',
      'Recent log (newest first):',
      ...this.log.slice(-lines).reverse(),
    ].join('\n');
    const modal = new DiagnosticsModal(this.app, summary);
    modal.open();

    // Refresh API status in background and update modal text when ready
    if (this.settings.accessToken) {
      this.verifyToken(true)
        .then(() => {
          const api2 = this.lastApiCheck;
          const lines2 = Math.max(1, Math.min(this.settings.logLimit || 500, Number(this.settings.diagnosticsLines || 50)));
          const updated = [
            `Local scope: ${this.settings.localBasePath || '(root)'}`,
            `Remote base: ${this.settings.remoteBasePath}`,
            `Sync mode: ${this.settings.syncMode}, Delete: ${this.settings.deletePolicy}`,
            `Concurrency: up ${this.settings.uploadConcurrency}, down ${this.settings.downloadConcurrency}`,
            `Auto-sync: ${this.settings.autoSyncIntervalMin} min`,
            `OAuth base: ${this.getOAuthBase()}`,
            `Client ID set: ${this.settings.clientId ? 'yes' : 'no'}`,
            `Token present: ${token ? 'yes' : 'no'}${token ? ` (****${tokenTail})` : ''}`,
            `Scopes: ${this.settings.oauthScopes ? this.settings.oauthScopes : '(app defaults)'}`,
            `API check: ${api2 ? (api2.ok ? `OK for ${api2.path || this.settings.remoteBasePath}` : `ERROR ${api2.error}`) : 'not run'}${api2?.at ? ` at ${api2.at}` : ''}`,
            `Last sync: ${this.index.lastSyncAt || 'never'}`,
            `Items indexed: ${Object.keys(this.index.files).length}`,
            `Last HTTP error: ${this.lastHttpError || '-'}`,
            '',
            'Recent log (newest first):',
            ...this.log.slice(-lines2).reverse(),
          ].join('\n');
          modal.setText(updated);
        })
        .catch(() => {});
    }
  }

  onLocalEvent(type, file, oldPath) {
    if (!(file?.path)) return;
    const rel = this.toLocalRel(file.path);
    if (!this.inScope(rel, file.path) || this.matchesIgnore(rel)) return;
    this.logInfo(`Local event: ${type} ${rel}${oldPath ? ` (from ${oldPath})` : ''}`);
    // We keep it simple: no immediate sync; rely on manual/auto timer.
  }

  getOAuthBase() {
    const base = (this.settings.oauthBaseUrl || DEFAULT_SETTINGS.oauthBaseUrl).replace(/\/+$/, '');
    return base;
  }

  getSuggestedVaultFolderName() {
    try {
      const name = (this.app?.vault?.getName && this.app.vault.getName()) || 'vault';
      return String(name).replace(/[\\/]+/g, '').trim() || 'vault';
    } catch (_) {
      return 'vault';
    }
  }

  getRemoteBase() {
    // Root may be 'app:/', 'disk:/Some', etc. Always append the vault subfolder name.
    let base = (this.settings.remoteBasePath || 'app:/').replace(/\/+$/, '');
    let folder = (this.settings.vaultFolderName || this.getSuggestedVaultFolderName() || 'vault').trim();
    folder = folder.replace(/[\\/]+/g, '');
    if (!folder) folder = this.getSuggestedVaultFolderName() || 'vault';
    return `${base}/${folder}`;
  }

  // OAuth helpers
  startOAuthFlow() {
    if (!this.settings.clientId) {
      new Notice('Set Client ID first.');
      return;
    }
    const base = this.getOAuthBase();
    const scopes = (this.settings.oauthScopes || '').trim();
    const url = `${base}/authorize?response_type=token&client_id=${encodeURIComponent(this.settings.clientId)}${scopes ? `&scope=${encodeURIComponent(scopes)}` : ''}`;
    try {
      // Desktop: open external browser via electron if available
      const electron = require('electron');
      if (electron?.shell?.openExternal) {
        electron.shell.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (_) {
      window.open(url, '_blank');
    }
    new Notice('Browser opened. Authorize the app, then copy access_token from the URL into Access token.');
  }

  openOAuthManagement() {
    const url = this.getOAuthBase();
    try {
      const electron = require('electron');
      if (electron?.shell?.openExternal) return electron.shell.openExternal(url);
    } catch (_) {}
    window.open(url, '_blank');
  }

  async verifyToken(silent = false) {
    // Verify by requesting an upload URL in the base path (does not modify data)
    const basePath = (this.getRemoteBase() || '/').replace(/\/+$/, '') || '/';
    try {
      const probe = `${basePath}/${'.obsidian-yandex-disk-sync-probe'}`;
      await this.ydGetUploadHref(probe, false);
      this.lastApiCheck = { ok: true, path: basePath, at: nowIso() };
      if (!silent) new Notice('Yandex Disk access verified');
      this.logInfo(`API access OK for base ${basePath}`);
      return this.lastApiCheck;
    } catch (e) {
      const msg = e?.message || String(e);
      this.lastApiCheck = { ok: false, error: msg, at: nowIso() };
      if (!silent) new Notice(`Token verification failed: ${msg}`);
      this.logError(`Token verification failed: ${msg}`);
      throw e;
    }
  }

  // Scope helpers
  toLocalRel(fullPath) {
    const base = this.settings.localBasePath ? normalizeRelPath(this.settings.localBasePath) + '/' : '';
    if (!base) return normalizeRelPath(fullPath);
    if (fullPath.startsWith(base)) return normalizeRelPath(fullPath.slice(base.length));
    return normalizeRelPath(fullPath);
  }
  fromLocalRel(rel) {
    const base = this.settings.localBasePath ? normalizeRelPath(this.settings.localBasePath) + '/' : '';
    return normalizeRelPath(base + rel);
  }
  inScope(rel, fullPath) {
    if (!this.settings.localBasePath) return true;
    const base = normalizeRelPath(this.settings.localBasePath);
    if (!base) return true;
    const candidateSource = fullPath != null ? fullPath : rel != null ? rel : '';
    const candidate = normalizeRelPath(candidateSource);
    if (!candidate) return false;
    if (candidate === base) return true;
    return candidate.startsWith(`${base}/`);
  }
  matchesIgnore(rel) {
    if (!this._ignoreCache) {
      this._ignoreCache = this.settings.ignorePatterns.map(globToRegExp);
    }
    return this._ignoreCache.some((re) => re.test(rel));
  }

  allowRemoteItem(item) {
    const relPath = item?.rel || '';
    if (this.matchesIgnore(relPath)) return false;
    const ext = getExt(relPath);
    const excludedExts = Array.isArray(this.settings.excludeExtensions) ? this.settings.excludeExtensions : [];
    if (excludedExts.includes(ext)) return false;
    const limitMb = Number(this.settings.maxSizeMB) || 0;
    if (limitMb > 0) {
      const sizeLimit = limitMb * 1024 * 1024;
      if (Number(item?.size) > sizeLimit) return false;
    }
    return true;
  }

  invalidateIgnoreCache() {
    this._ignoreCache = null;
  }

  // HTTP wrapper with token + backoff for 429; supports no-retry statuses
  async http(method, url, opts = {}, isBinary = false) {
    const token = this.settings.accessToken;
    if (!token) throw new Error('Not connected: access token missing');
    const headers = Object.assign({}, opts.headers || {}, {
      Authorization: `OAuth ${token}`,
    });
    const maxAttempts = Math.max(1, Number(opts.maxAttempts || 5));
    const noRetryStatuses = new Set(opts.noRetryStatuses || []);
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const res = await requestUrl({ url, method, headers, body: opts.body, contentType: opts.contentType });
        if (res.status === 429) {
          const ra = Number(res.headers['retry-after'] || res.headers['Retry-After'] || 1);
          const waitMs = Math.max(1000, ra * 1000);
          this.logWarn(`429 received, retrying after ${waitMs}ms`);
          try { this.updateStatusBar('Throttled'); } catch (_) {}
          await delay(waitMs);
          continue;
        }
        if (res.status >= 400) {
          const err = new Error(`HTTP ${res.status}: ${res.text || ''}`);
          err.status = res.status;
          err.text = res.text;
          throw err;
        }
        return isBinary ? res.arrayBuffer : (opts.expectJson ? res.json : res);
      } catch (e) {
        const status = e?.status || e?.response?.status;
        const body = e?.text || e?.response?.text;
        const msg = status ? `HTTP ${status}${body ? `: ${String(body).slice(0, 200)}` : ''}` : (e?.message || String(e));
        this.lastHttpError = msg;
        const shouldRetry = !(noRetryStatuses.has?.(status)) && attempt < maxAttempts;
        if (!shouldRetry) {
          if (e instanceof Error) {
            try {
              if (msg && e.message !== msg) e.message = msg;
            } catch (_) {}
            throw e;
          }
          const err = new Error(msg);
          try { err.cause = e; } catch (_) {}
          throw err;
        }
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        this.logWarn(`HTTP error (attempt ${attempt}): ${msg}. Retrying in ${backoff}ms`);
        await delay(backoff);
      }
    }
  }

  // Yandex Disk API
  async ydGetResource(path, params = {}) {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    q.set('path', path);
    const url = `${API_BASE}/resources?${q.toString()}`;
    const data = await this.http('GET', url, { expectJson: true });
    return data;
  }

  async ydListFolderRecursive(basePath) {
    const files = [];
    const stack = [basePath];
    const fields = '_embedded.items.name,_embedded.items.type,_embedded.items.path,_embedded.items.size,_embedded.items.md5,_embedded.items.sha256,_embedded.items.modified,_embedded.items.revision';
    while (stack.length) {
      const p = stack.pop();
      let limit = 200, offset = 0;
      while (true) {
        const data = await this.ydGetResource(p, { limit, offset, fields });
        const items = data?._embedded?.items || [];
        for (const it of items) {
          if (it.type === 'dir') {
            stack.push(it.path);
          } else if (it.type === 'file') {
            files.push({
              path: it.path, // absolute on YD
              name: it.name,
              size: it.size,
              md5: it.md5,
              sha256: it.sha256,
              modified: it.modified,
              revision: it.revision,
              rel: this.remoteAbsToRel(it.path, basePath),
            });
          }
        }
        if (items.length < limit) break;
        offset += limit;
      }
    }
    return files;
  }

  remoteAbsToRel(abs, base) {
    const stripAlias = (p) => (p || '').replace(/^(app:|disk:|trash:)/, '');
    // Normalize both
    let A = stripAlias(abs).replace(/^\/+/, '');
    const baseStr = base || '';
    let B = stripAlias(baseStr).replace(/^\/+/, '');

    if (baseStr.startsWith('app:')) {
      // Yandex expands app:/ to disk:/Приложения/<AppName>/...; drop those two segments from A
      const aSegs = A.split('/');
      if (aSegs.length >= 2) A = aSegs.slice(2).join('/'); else A = aSegs.join('/');
      const bRel = B; // for app:/vault => B = 'vault'
      if (bRel) {
        if (A === bRel) return '';
        if (A.startsWith(bRel + '/')) return A.slice(bRel.length + 1);
      }
      return A;
    }

    // disk:/... base — make relative against B
    if (B && A.startsWith(B)) {
      let rel = A.slice(B.length);
      if (rel.startsWith('/')) rel = rel.slice(1);
      return rel;
    }
    return A;
  }

  async ydGetUploadHref(absPath, overwrite = true) {
    const q = new URLSearchParams({ path: absPath, overwrite: String(!!overwrite) });
    const url = `${API_BASE}/resources/upload?${q.toString()}`;
    const data = await this.http('GET', url, { expectJson: true });
    return data.href;
  }

  async ydGetDownloadHref(absPath) {
    const q = new URLSearchParams({ path: absPath });
    const url = `${API_BASE}/resources/download?${q.toString()}`;
    const data = await this.http('GET', url, { expectJson: true });
    return data.href;
  }

  async ydEnsureFolder(absPath) {
    // Try to create; ignore 409 (already exists)
    const q = new URLSearchParams({ path: absPath });
    const url = `${API_BASE}/resources?${q.toString()}`;
    try {
      await this.http('PUT', url, { maxAttempts: 1, noRetryStatuses: [409] });
    } catch (e) {
      // If it's a 409, the folder already exists — safe to ignore
      if ((e?.message || '').includes('HTTP 409')) return;
      throw e;
    }
  }

  async ydDelete(absPath, permanently = false) {
    const q = new URLSearchParams({ path: absPath, permanently: String(!!permanently) });
    const url = `${API_BASE}/resources?${q.toString()}`;
    await this.http('DELETE', url);
  }

  async ydMove(fromAbs, toAbs, overwrite = true) {
    const q = new URLSearchParams({ from: fromAbs, path: toAbs, overwrite: String(!!overwrite) });
    const url = `${API_BASE}/resources/move?${q.toString()}`;
    await this.http('POST', url);
  }

  remoteAbs(rel) {
    let base = this.getRemoteBase();
    base = base.replace(/\/+$/, '');
    // Support Yandex aliases like app:/, disk:/, trash:
    if (base.startsWith('app:') || base.startsWith('disk:') || base.startsWith('trash:')) {
      return `${base}/${normalizeRelPath(rel)}`;
    }
    if (!base.startsWith('/')) base = '/' + base;
    return `${base}/${normalizeRelPath(rel)}`;
  }

  // Local scanning
  listLocalFilesInScope() {
    const out = [];
    const all = this.app.vault.getAllLoadedFiles();
    for (const f of all) {
      if (f instanceof TFolder) continue; // folders
      const rel = this.toLocalRel(f.path);
      if (!this.inScope(rel, f.path)) continue;
      if (this.matchesIgnore(rel)) continue;
      const ext = getExt(rel);
      if (this.settings.excludeExtensions.includes(ext)) continue;
      const size = f.stat.size;
      if (size > this.settings.maxSizeMB * 1024 * 1024) continue;
      out.push({ rel, tfile: f, size, mtime: f.stat.mtime, ctime: f.stat.ctime, ext });
    }
    return out;
  }

  // Build a sync plan based on local and remote states
  async buildPlan() {
    const local = this.listLocalFilesInScope();
    const remoteBase = this.getRemoteBase();
    await this.ydEnsureFolder(remoteBase || '/');
    const remoteListing = await this.ydListFolderRecursive(remoteBase || '/');
    const remote = remoteListing.filter((item) => this.allowRemoteItem(item));

    const localMap = new Map(local.map((x) => [x.rel, x]));
    const remoteMap = new Map(remote.map((x) => [x.rel, x]));
    const plan = [];

    // Consider both directions
    const rels = new Set([...localMap.keys(), ...remoteMap.keys()]);
    for (const rel of rels) {
      const loc = localMap.get(rel);
      const rem = remoteMap.get(rel);
      const idx = this.index.files[rel];
      const canUpload = this.settings.syncMode !== 'download';
      const canDownload = this.settings.syncMode !== 'upload';

      if (loc && !rem) {
        if (canUpload) plan.push({ type: 'upload', rel, from: loc, toAbs: this.remoteAbs(rel) });
        continue;
      }
      if (!loc && rem) {
        if (canDownload) plan.push({ type: 'download', rel, fromAbs: rem.path, toRel: rel, remote: rem });
        continue;
      }
      if (loc && rem) {
        const localChanged = !idx || loc.mtime > (idx.localMtime || 0) || loc.size !== (idx.localSize || 0);
        const remoteChanged = !idx || new Date(rem.modified).getTime() > (idx.remoteModified || 0) || rem.revision !== (idx.remoteRevision || rem.revision);

        if (localChanged && !remoteChanged) {
          if (canUpload) plan.push({ type: 'upload', rel, from: loc, toAbs: rem.path });
        } else if (!localChanged && remoteChanged) {
          if (canDownload) plan.push({ type: 'download', rel, fromAbs: rem.path, toRel: rel, remote: rem });
        } else if (localChanged && remoteChanged) {
          if ((this.settings.conflictStrategy || 'newest-wins') === 'duplicate-both') {
            plan.push({ type: 'conflict', rel, from: loc, remote: rem });
          } else {
            // newest-wins with tolerance for clock skew/timezones
            const tolMs = Math.max(0, (this.settings.timeSkewToleranceSec || 0) * 1000);
            const localTs = Number(loc.mtime) || 0;
            const remoteTs = Number(new Date(rem.modified).getTime()) || 0;
            if (canUpload && localTs > remoteTs + tolMs) {
              plan.push({ type: 'upload', rel, from: loc, toAbs: rem.path });
              this.logInfo(`Conflict resolved by newest: upload ${rel} (local ${localTs} > remote ${remoteTs} + tol ${tolMs})`);
            } else if (canDownload && remoteTs > localTs + tolMs) {
              plan.push({ type: 'download', rel, fromAbs: rem.path, toRel: rel, remote: rem });
              this.logInfo(`Conflict resolved by newest: download ${rel} (remote ${remoteTs} > local ${localTs} + tol ${tolMs})`);
            } else {
              // Within tolerance — prefer local to avoid losing user edits
              if (canUpload) {
                plan.push({ type: 'upload', rel, from: loc, toAbs: rem.path });
                this.logInfo(`Conflict within tolerance: prefer local upload for ${rel}`);
              }
            }
          }
        } else {
          // No changes
        }
      }
    }

    // Deletions (mirror policy): detect missing items vs index
    if (this.settings.deletePolicy === 'mirror') {
      for (const rel of Object.keys(this.index.files)) {
        const existsLocal = localMap.has(rel);
        const existsRemote = remoteMap.has(rel);
        const idx = this.index.files[rel];
        if (!existsLocal && existsRemote && this.settings.syncMode !== 'upload') {
          // Deleted locally -> consider delete remote only if remote unchanged since last sync
          const rem = remoteMap.get(rel);
          if (rem) {
            const remoteChanged = !idx || new Date(rem.modified).getTime() > (idx.remoteModified || 0) || rem.revision !== (idx.remoteRevision || rem.revision);
            if (!remoteChanged) plan.push({ type: 'remote-delete', rel, abs: rem.path });
          }
        } else if (existsLocal && !existsRemote && this.settings.syncMode !== 'download') {
          // Deleted remotely -> consider delete local only if local unchanged since last sync
          const loc = localMap.get(rel);
          if (loc) {
            const localChanged = !idx || loc.mtime > (idx.localMtime || 0) || loc.size !== (idx.localSize || 0);
            if (!localChanged) plan.push({ type: 'local-delete', rel, tfile: loc.tfile });
          }
        }
      }
    }

    // Deduplicate per rel: prefer conflict > delete > transfer
    // This ensures, for mirror policy, that intentional deletions
    // are not overridden by a download/upload decision.
    const pri = (t) => {
      if (t === 'conflict') return 3;
      if (t === 'remote-delete' || t === 'local-delete') return 2;
      if (t === 'upload' || t === 'download') return 1;
      return 0;
    };
    const byRel = new Map();
    for (const op of plan) {
      const prev = byRel.get(op.rel);
      if (!prev || pri(op.type) > pri(prev.type)) byRel.set(op.rel, op);
    }
    const finalPlan = Array.from(byRel.values());

    return { plan: finalPlan, remoteMap };
  }

  async syncNow(dryRun = false) {
    try {
      if (this.currentRun?.active) {
        new Notice('Sync is already running');
        this.openProgress();
        return;
      }
      if (!this.settings.accessToken) {
        new Notice('Connect account in settings first.');
        return;
      }
      this.logInfo(`Sync started (dryRun=${dryRun})`);
      this.startRun(dryRun, 0);
      const { plan, remoteMap } = await this.buildPlan();
      this.setRunPlan(plan);
      if (dryRun) {
        // Render plan in a safe, readable way without circular refs
        const lines = plan.map((op) => {
          try {
            switch (op.type) {
              case 'upload':
                return `upload ${op.rel} -> ${op.toAbs}`;
              case 'download':
                return `download ${op.rel} <- ${op.fromAbs}`;
              case 'conflict':
                return `conflict ${op.rel}`;
              case 'remote-delete':
                return `remote-delete ${op.rel} (${op.abs})`;
              case 'local-delete':
                return `local-delete ${op.rel}`;
              default:
                return JSON.stringify(op, (k, v) => (k === 'tfile' ? (v?.path || '[tfile]') : v));
            }
          } catch (_) {
            return `[unprintable op ${op?.type || 'unknown'} ${op?.rel || ''}]`;
          }
        });
        const txt = lines.join('\n');
        this.logInfo(`Plan (${plan.length} ops) built`);
        new DiagnosticsModal(this.app, `Dry-run plan (${plan.length} ops)\n\n${txt}`).open();
        this.finishRun(true);
        return;
      }
      await this.executePlan(plan, remoteMap);
      new Notice('Sync completed');
      this.finishRun(true);
    } catch (e) {
      this.logError(`Sync failed: ${e?.message || e}`);
      new Notice(`Sync failed: ${e?.message || String(e)}`);
      this.finishRun(false);
    }
  }

  async executePlan(plan, remoteMapFromPlan) {
    // Run upload/download with limited concurrency
    const uploads = plan.filter((x) => x.type === 'upload');
    const downloads = plan.filter((x) => x.type === 'download');
    const conflicts = plan.filter((x) => x.type === 'conflict');
    const rDeletes = plan.filter((x) => x.type === 'remote-delete');
    const lDeletes = plan.filter((x) => x.type === 'local-delete');

    // Uploads
    await this.runWithConcurrency(uploads, this.settings.uploadConcurrency, async (op) => {
      await this.uploadLocalFile(op.rel, op.from.tfile, op.toAbs);
    });
    // Downloads
    await this.runWithConcurrency(downloads, this.settings.downloadConcurrency, async (op) => {
      await this.downloadRemoteFile(op.fromAbs, op.toRel);
    });

    // Conflicts: for .md create two copies; for binaries, also duplicate
    for (const op of conflicts) {
      if (this.currentRun?.canceled) break;
      this.reportOpStart(op);
      try {
        await this.resolveConflictByDuplication(op.rel, op.from?.tfile, op.remote);
        this.reportOpEnd(op, true);
      } catch (e) {
        const msg = e?.message || String(e);
        this.logWarn(`Task failed (conflict ${op.rel}): ${msg}`);
        this.reportOpEnd(op, false, msg);
      }
    }

    // Deletes
    for (const op of rDeletes) {
      if (this.currentRun?.canceled) break;
      this.reportOpStart(op);
      try { await this.ydDelete(op.abs, false); this.reportOpEnd(op, true); }
      catch (e) { const msg = e?.message || String(e); this.logWarn(`Delete remote failed for ${op.abs}: ${msg}`); this.reportOpEnd(op, false, msg); }
    }
    for (const op of lDeletes) {
      if (this.currentRun?.canceled) break;
      this.reportOpStart(op);
      try { await this.app.vault.delete(op.tfile); this.reportOpEnd(op, true); }
      catch (e) { const msg = e?.message || String(e); this.logWarn(`Delete local failed for ${op.tfile?.path}: ${msg}`); this.reportOpEnd(op, false, msg); }
    }

    // Update index
    // Re-scan local state after operations
    const localAfter = this.listLocalFilesInScope();
    const remoteChanged = uploads.length > 0 || rDeletes.length > 0;
    let remoteAfter;
    if (remoteChanged || !remoteMapFromPlan) {
      const remoteRoot = this.getRemoteBase();
      remoteAfter = await this.ydListFolderRecursive(remoteRoot || '/');
    } else {
      remoteAfter = Array.from(remoteMapFromPlan.values());
    }
    const filteredRemoteAfter = (remoteAfter || []).filter((item) => this.allowRemoteItem(item));
    const remoteMap = new Map(filteredRemoteAfter.map((x) => [x.rel, x]));
    const newIndex = {};
    for (const loc of localAfter) {
      const rem = remoteMap.get(loc.rel);
      newIndex[loc.rel] = {
        localMtime: loc.mtime,
        localSize: loc.size,
        remoteModified: rem ? new Date(rem.modified).getTime() : 0,
        remoteRevision: rem ? rem.revision : undefined,
      };
    }
    this.index.files = newIndex;
    this.index.lastSyncAt = nowIso();
    await this.saveSettings();
  }

  async runWithConcurrency(items, limit, task) {
    let i = 0;
    const workers = Array.from({ length: Math.max(1, limit | 0) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        const it = items[idx];
        if (this.currentRun?.canceled) return;
        try {
          this.reportOpStart(it);
          await task(it);
          this.reportOpEnd(it, true);
        } catch (e) {
          const ctx = `${it?.type || 'task'}${it?.rel ? ` ${it.rel}` : ''}` + (it?.toAbs ? ` -> ${it.toAbs}` : '') + (it?.fromAbs ? ` <- ${it.fromAbs}` : '');
          const msg = e?.message || String(e);
          this.logWarn(`Task failed (${ctx}): ${msg}`);
          this.reportOpEnd(it, false, msg);
        }
      }
    });
    await Promise.all(workers);
  }

  async uploadLocalFile(rel, tfile, toAbs) {
    // Ensure remote parent folder exists
    const lastSlash = toAbs.lastIndexOf('/');
    if (lastSlash > 0) {
      const parent = toAbs.slice(0, lastSlash) || toAbs;
      await this.ydEnsureFolder(parent).catch(() => {});
    }
    const href = await this.ydGetUploadHref(toAbs, true);
    const data = await this.app.vault.readBinary(tfile);
    await this.http('PUT', href, { body: data, contentType: 'application/octet-stream' });
    this.logInfo(`Uploaded: ${rel}`);
  }

  async downloadRemoteFile(fromAbs, toRel) {
    const href = await this.ydGetDownloadHref(fromAbs);
    const bin = await this.http('GET', href, {}, true);
    const targetPath = this.fromLocalRel(toRel);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing && existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, bin);
    } else if (existing && existing instanceof TFolder) {
      // is a folder: append filename from fromAbs
      const filename = toRel.split('/').pop();
      await this.app.vault.createBinary(pathJoin(targetPath, filename), bin);
    } else {
      // Ensure parent folders
      await this.ensureFolderForPath(targetPath);
      await this.app.vault.createBinary(targetPath, bin);
    }
    this.logInfo(`Downloaded: ${toRel}`);
  }

  async ensureFolderForPath(path) {
    const parts = path.split('/');
    parts.pop();
    let cur = '';
    for (const p of parts) {
      cur = pathJoin(cur, p);
      if (!cur) continue;
      const f = this.app.vault.getAbstractFileByPath(cur);
      if (!f) await this.app.vault.createFolder(cur);
    }
  }

  async resolveConflictByDuplication(rel, localTFile, remoteMeta) {
    // Read remote and local, create conflict files side by side.
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const ext = getExt(rel);
    const base = ext ? rel.slice(0, -(ext.length + 1)) : rel;
    const suffixLocal = ` (conflict ${ts} local)`;
    const suffixRemote = ` (conflict ${ts} remote)`;
    const conflictLocal = `${base}${suffixLocal}${ext ? '.' + ext : ''}`;
    const conflictRemote = `${base}${suffixRemote}${ext ? '.' + ext : ''}`;

    const remoteHref = await this.ydGetDownloadHref(remoteMeta.path);
    const remoteBuf = await this.http('GET', remoteHref, {}, true);
    const localIsBinary = !(getExt(rel).toLowerCase() === 'md');

    const localConflictPath = this.fromLocalRel(conflictLocal);
    const remoteConflictPath = this.fromLocalRel(conflictRemote);
    await this.ensureFolderForPath(localConflictPath);
    await this.ensureFolderForPath(remoteConflictPath);

    if (localIsBinary) {
      // Binary: duplicate as-is
      const localBuf = await this.app.vault.readBinary(localTFile).catch(() => new Uint8Array());
      await this.app.vault.createBinary(localConflictPath, localBuf).catch(async () => {
        const f = this.app.vault.getAbstractFileByPath(localConflictPath);
        if (f) await this.app.vault.modifyBinary(f, localBuf);
      });
      await this.app.vault.createBinary(remoteConflictPath, remoteBuf).catch(async () => {
        const f = this.app.vault.getAbstractFileByPath(remoteConflictPath);
        if (f) await this.app.vault.modifyBinary(f, remoteBuf);
      });
    } else {
      // Markdown: store as text
      let remoteText = '';
      try { remoteText = new TextDecoder('utf-8').decode(remoteBuf); } catch { remoteText = ''; }
      let localText = '';
      try { localText = await this.app.vault.read(localTFile); } catch { localText = ''; }
      await this.app.vault.create(localConflictPath, localText).catch(async () => {
        const f = this.app.vault.getAbstractFileByPath(localConflictPath);
        if (f) await this.app.vault.modify(f, localText);
      });
      await this.app.vault.create(remoteConflictPath, remoteText).catch(async () => {
        const f = this.app.vault.getAbstractFileByPath(remoteConflictPath);
        if (f) await this.app.vault.modify(f, remoteText);
      });
    }
    this.logWarn(`Conflict -> duplicated: ${conflictLocal}, ${conflictRemote}`);
  }
}

module.exports = YandexDiskSyncPlugin;
module.exports.helpers = {
  globToRegExp,
  pathJoin,
  createEmptyIndex,
  sanitizeIndexForHash,
  computeIndexHash,
  normalizeRelPath,
};
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
