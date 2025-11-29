const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// --- CONFIGURATION ---
const TOKEN = process.env.YD_TOKEN || 'y0__xCn5cAJGJCKOiCWlIioFHoL3uDR2a2XSMtsf_ZkLFMCg3v3';
const CLIENT_ID = process.env.YD_CLIENT_ID || 'ac091db2c4a84599ae312a4a7c9bfc9d';
// Для app-folder токена: по умолчанию используем app:/ (alias на папку приложения),
// и папку vault = Obsidian (по структуре app:/Obsidian/...).
const REMOTE_BASE = process.env.YD_REMOTE_BASE || 'app:/';
const VAULT_FOLDER = process.env.YD_VAULT_FOLDER || 'Obsidian'; // имя папки в диске (vault)
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'downloads';
const API_BASE = 'https://cloud-api.yandex.net/v1/disk';
const MOBILE_DOWNLOAD_CHUNK_BYTES = Number(process.env.CHUNK_BYTES || (2 * 1024 * 1024)); // 2MB как в плагине
const VERIFY_MD5 = process.env.VERIFY_MD5 !== '0'; // сверять md5 скачанного с md5 из метаданных (если есть)

// Порядок скачивания по умолчанию: сначала небольшой файл, затем проблемный большой
const DEFAULT_TARGETS = [
  'Мультики.md',
  'Books/Машинное обучение. Паттерны проектирования/mashinnoe-obuchenie-patterny-proektirovaniya_RuLit_Me_764134.pdf',
];

const CLI_TARGETS = process.argv.slice(2).filter(Boolean);
const TARGETS = CLI_TARGETS.length ? CLI_TARGETS : DEFAULT_TARGETS;

if (TOKEN === 'YOUR_TOKEN_HERE') {
  console.error('Error: Please set YD_TOKEN environment variable or edit the script.');
  process.exit(1);
}

// --- MOCKS & POLYFILLS ---

// Polyfill для requestUrl из Obsidian
function requestUrl(opts) {
  const maxRedirects = 5;

  const doRequest = (urlStr, redirectCount, overrideMethod) => new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const options = {
      method: overrideMethod || opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 30000,
    };

    if (opts.contentType) {
      options.headers['Content-Type'] = opts.contentType;
    }

    const req = https.request(urlObj, options, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers?.location;
      // Обработка редиректов (Yandex часто отдаёт 302 на загрузку)
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        if (redirectCount >= maxRedirects) {
          reject(new Error(`Too many redirects (${maxRedirects})`));
          return;
        }
        const nextUrl = new URL(location, urlStr).toString();
        // 303 требует GET
        const nextMethod = status === 303 ? 'GET' : (opts.method || overrideMethod || 'GET');
        resolve(doRequest(nextUrl, redirectCount + 1, nextMethod));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status,
          headers: res.headers,
          arrayBuffer: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          text: body.toString('utf8'),
          json: () => JSON.parse(body.toString('utf8')),
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (opts.body) req.write(opts.body);
    req.end();
  });

  return doRequest(opts.url, 0, opts.method);
}

const fsSafe = fs;

// Минимальный мок плагина
class YandexDiskPlugin {
  constructor() {
    this.settings = {
      accessToken: TOKEN,
      clientId: CLIENT_ID,
    };
    this.app = {
      vault: {
        adapter: {
          stat: async () => null,
        },
      },
    };
  }

  logInfo(msg) { console.log(`[INFO] ${msg}`); }
  logWarn(msg) { console.warn(`[WARN] ${msg}`); }
  logError(msg) { console.error(`[ERROR] ${msg}`); }

  isMobileDevice() { return true; } // насильно мобильный, чтобы включалось чанкирование

  getAbsolutePath(relPath) {
    return path.resolve(process.cwd(), relPath);
  }

  ensureParentDir(absPath) {
    if (!absPath) return;
    const dir = path.dirname(absPath);
    if (!dir || dir === '.') return;
    try {
      fsSafe.mkdirSync(dir, { recursive: true });
    } catch (e) {
      this.logWarn(`Не удалось создать директорию ${dir}: ${e?.message || e}`);
    }
  }

  fromLocalRel(rel) { return rel; }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Копия http из main.js ---
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
          await this.delay(waitMs);
          continue;
        }
        if (res.status >= 400) {
          const err = new Error(`HTTP ${res.status}: ${res.text || ''}`);
          err.status = res.status;
          err.text = res.text;
          throw err;
        }
        if (opts.returnHeaders) {
          return {
            body: isBinary ? res.arrayBuffer : (opts.expectJson ? res.json() : res),
            headers: res.headers
          };
        }
        return isBinary ? res.arrayBuffer : (opts.expectJson ? res.json() : res);
      } catch (e) {
        const status = e?.status || e?.response?.status;
        const body = e?.text || e?.response?.text;
        const msg = status ? `HTTP ${status}${body ? `: ${String(body).slice(0, 200)}` : ''}` : (e?.message || String(e));
        const shouldRetry = !(noRetryStatuses.has?.(status)) && attempt < maxAttempts;
        if (!shouldRetry) {
          throw new Error(msg);
        }
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        this.logWarn(`HTTP error (attempt ${attempt}): ${msg}. Retrying in ${backoff}ms`);
        await this.delay(backoff);
      }
    }
  }

  async ydGetDownloadHref(path) {
    const url = `${API_BASE}/resources/download?path=${encodeURIComponent(path)}`;
    const json = await this.http('GET', url, { expectJson: true });
    return json.href;
  }

  // --- Копия downloadRemoteFile из main.js ---
  async downloadRemoteFile(fromAbs, toRel, remoteMeta) {
    const href = await this.ydGetDownloadHref(fromAbs);
    const targetPath = this.fromLocalRel(toRel);
    const size = Number(remoteMeta?.size) || 0;
    const shouldChunk = this.isMobileDevice() && size > MOBILE_DOWNLOAD_CHUNK_BYTES;

    let buffer;
    if (shouldChunk) {
      let total = size || 0;
      const targetAbs = this.getAbsolutePath(targetPath);
      const tmpAbs = targetAbs ? `${targetAbs}.yds.part` : null;
      const canStream = fsSafe && targetAbs && tmpAbs;
      let offset = 0;
      let got = 0;
      let chunks = 0;
      let targetBuf = canStream ? null : (total > 0 ? new Uint8Array(total) : null);
      let fd = null;
      if (canStream) {
        try {
          const dir = tmpAbs.split('/').slice(0, -1).join('/');
          fsSafe.mkdirSync(dir, { recursive: true });
          fd = fsSafe.openSync(tmpAbs, 'w');
        } catch (e) {
          this.logWarn(`Stream init failed, fallback to memory: ${e?.message || e}`);
          fd = null;
        }
      }
      while (!total || offset < total) {
        const end = total ? Math.min(total - 1, offset + MOBILE_DOWNLOAD_CHUNK_BYTES - 1) : offset + MOBILE_DOWNLOAD_CHUNK_BYTES - 1;
        const requestedSize = end - offset + 1;

        const chunkUrl = `${href}${href.includes('?') ? '&' : '?'}_t=${Date.now()}`;

        const resObj = await this.http('GET', chunkUrl, {
          headers: { Range: `bytes=${offset}-${end}` },
          returnHeaders: true
        }, true);

        const bin = resObj.body;
        const headers = resObj.headers || {};
        const arr = new Uint8Array(bin || []);

        if (!arr.length) break;

        const contentRange = headers['content-range'] || headers['Content-Range'];
        this.logInfo(`Chunk ${chunks + 1} range request: ${offset}-${end}, received len: ${arr.length}, content-range: ${contentRange}`);

        const isWayTooBig = arr.length > requestedSize * 2;
        const looksLikeFullFile = total && arr.length === total;

        if (isWayTooBig || looksLikeFullFile) {
          this.logWarn(`Range ignored? Requested ${requestedSize} bytes, got ${arr.length}. Assuming full file download.`);

          if (fd != null) {
            try {
              fsSafe.closeSync(fd);
              fd = fsSafe.openSync(tmpAbs, 'w');
              fsSafe.writeSync(fd, Buffer.from(arr));
            } catch (e) {
              this.logWarn(`Failed to rewrite full file in stream mode: ${e}`);
              throw e;
            }
            got = arr.length;
            total = arr.length;
            break;
          } else {
            targetBuf = arr;
            got = arr.length;
            total = arr.length;
            break;
          }
        }

        if (contentRange) {
          const match = contentRange.match(/bytes\s+(\d+)-(\d+)\//);
          if (match) {
            const startByte = parseInt(match[1], 10);
            if (startByte !== offset) {
              this.logWarn(`Content-Range mismatch! Expected start ${offset}, got ${startByte}. Aborting chunk to prevent corruption.`);
              throw new Error(`Content-Range mismatch: expected ${offset}, got ${startByte}`);
            }
          }
        }

        let dataToWrite = arr;
        if (total && got + arr.length > total) {
          const needed = total - got;
          if (needed < 0) break;
          this.logWarn(`Received more data than expected (got +${arr.length}, needed ${needed}). Truncating.`);
          dataToWrite = arr.subarray(0, needed);
        }

        if (fd != null) {
          try { fsSafe.writeSync(fd, Buffer.from(dataToWrite)); }
          catch (e) { this.logWarn(`Write chunk failed, switching to memory: ${e?.message || e}`); try { fsSafe.closeSync(fd); } catch (_) { } fd = null; }
        }

        if (targetBuf) {
          if (got + dataToWrite.length > targetBuf.length) {
            const nb = new Uint8Array(got + dataToWrite.length);
            nb.set(targetBuf.subarray(0, got), 0);
            targetBuf = nb;
          }
          targetBuf.set(dataToWrite, got);
        }

        got += dataToWrite.length;
        offset += dataToWrite.length;
        chunks++;

        if (!total && arr.length < MOBILE_DOWNLOAD_CHUNK_BYTES) break;
        if (total && got >= total) break;
      }
      if (fd != null) {
        try { fsSafe.closeSync(fd); } catch (_) { }
        try {
          try { fsSafe.unlinkSync(targetAbs); } catch (_) { }
          fsSafe.renameSync(tmpAbs, targetAbs);
        } catch (e) {
          this.logWarn(`Rename streamed file failed: ${e?.message || e}`);
        }
        buffer = null;
        this.logInfo(`Downloaded (stream) ${toRel}: ~${Math.round((total || got) / (1024 * 1024))}MB in ${chunks} chunks`);
        return;
      } else {
        buffer = targetBuf ? targetBuf.subarray(0, got) : new Uint8Array(0);
        this.logInfo(`Downloaded (chunked) ${toRel}: ${Math.round(buffer.length / (1024 * 1024))}MB in ${chunks} chunks`);
      }
    } else {
      const bin = await this.http('GET', href, {}, true);
      buffer = new Uint8Array(bin || []);
    }

    if (buffer && buffer.length) {
      const abs = this.getAbsolutePath(toRel);
      this.ensureParentDir(abs);
      fs.writeFileSync(abs, buffer);
    }
    this.logInfo(`Downloaded: ${toRel}`);
  }
}

// --- Helpers & runner ---
function buildRemoteRoot() {
  const base = (REMOTE_BASE || 'app:/').replace(/\/+$/, '');
  const folder = (VAULT_FOLDER || '').replace(/[\\/]+/g, '');
  return folder ? `${base}/${folder}` : base;
}

function normalizeRelPath(rel) {
  return (rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildRemotePath(rel) {
  return `${buildRemoteRoot()}/${normalizeRelPath(rel)}`;
}

async function computeMd5(absPath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyLocalFile(rel, meta, localRelPath) {
  const abs = path.resolve(process.cwd(), localRelPath);
  try {
    const stat = fs.statSync(abs);
    const expected = Number(meta?.size) || null;
    console.log(`Сохранено: ${abs}`);
    console.log(`Размер локально: ${stat.size}${expected ? ` (ожидалось ${expected})` : ''}`);
    if (expected && stat.size !== expected) {
      console.warn(`[WARN] Несовпадение размеров для ${rel}`);
    }
    if (VERIFY_MD5) {
      const localMd5 = await computeMd5(abs);
      const remoteMd5 = meta?.md5 || null;
      console.log(`MD5 локально: ${localMd5}${remoteMd5 ? ` | MD5 на диске: ${remoteMd5}` : ''}`);
      if (remoteMd5 && remoteMd5.toLowerCase() !== localMd5.toLowerCase()) {
        console.warn(`[WARN] MD5 не совпадает для ${rel}`);
      }
    }
  } catch (e) {
    console.error(`Не удалось проверить ${rel}:`, e?.message || e);
  }
}

async function downloadOne(plugin, rel) {
  const remotePath = buildRemotePath(rel);
  const localPath = path.join(OUTPUT_DIR, normalizeRelPath(rel));
  console.log(`\n==> Качаем ${rel}`);
  console.log(`   Remote: ${remotePath}`);
  const metaUrl = `${API_BASE}/resources?path=${encodeURIComponent(remotePath)}`;
  const meta = await plugin.http('GET', metaUrl, { expectJson: true });
  console.log(`   Найдено: ${meta.name}, размер ${meta.size} байт, md5: ${meta.md5 || 'n/a'}`);

  await plugin.downloadRemoteFile(remotePath, localPath, meta);
  await verifyLocalFile(rel, meta, localPath);
}

async function listPath(plugin, pathStr, label) {
  try {
    const listUrl = `${API_BASE}/resources?path=${encodeURIComponent(pathStr)}&limit=20`;
    const list = await plugin.http('GET', listUrl, { expectJson: true });
    const items = (list?._embedded?.items || []).map((i) => `${i.name} (${i.type})`);
    console.log(`Содержимое ${label}:`, items);
  } catch (e) {
    console.warn(`Не удалось получить список ${label}:`, e?.message || e);
  }
}

async function run() {
  const plugin = new YandexDiskPlugin();
  const remoteRoot = buildRemoteRoot();
  console.log(`Remote base: ${remoteRoot}`);
  console.log(`Chunk size: ${MOBILE_DOWNLOAD_CHUNK_BYTES} байт (~${(MOBILE_DOWNLOAD_CHUNK_BYTES / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Файлы: ${TARGETS.join(', ')}`);

  await listPath(plugin, '/', 'корня /');
  await listPath(plugin, remoteRoot, remoteRoot);

  for (const rel of TARGETS) {
    try {
      await downloadOne(plugin, rel);
    } catch (e) {
      console.error(`Ошибка при скачивании ${rel}:`, e?.message || e);
    }
  }

  console.log('\nЗавершено.');
}

run();
