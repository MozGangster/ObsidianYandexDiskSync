# PRD: Плагин синхронизации Obsidian ↔ Yandex.Disk (REST + OAuth)

## 1. Цель и рамки

**Цель:** обеспечить надёжную и быструю двунаправленную синхронизацию заметок Obsidian (Markdown + вложения) с Яндекс.Диском через REST API и OAuth.

**Входит в MVP:**

- OAuth-аутентификация через Яндекс ID; управление токеном.
- Один аккаунт и одна удалённая папка на плагин.
- Инкрементальная двунаправленная синхронизация (upload/download/rename/delete).
- Разрешение конфликтов для `.md` (3-way merge; при неудаче — файлы-конфликты).
- Игнор путей/расширений (glob/regex), лимиты по размеру и типам.
- Ручные команды: **Sync now**, **Dry-run**, **Diagnostics**; журнал операций.
- Работоспособность на Desktop и Mobile (с учётом CORS через `requestUrl`).

**Вне MVP (vNext):** несколько аккаунтов/профилей, фоновые расписания, E2EE на уровне плагина, шаринг/публичные ссылки, «почти realtime» дельта-синк, AppFolder-режим по умолчанию, кастомные свойства ресурсов.

---

## 2. Персоны и ключевые сценарии

**Персона 1 — Индивидуальный пользователь:** 2–3 устройства (Desktop + мобильный). Требует простоты: «нажал — синхронизировалось».

**Персона 2 — Тех. пользователь:** большой vault, много вложений (PDF/PNG/ZIP). Нужны фильтры, отчёты, контроль скорости/параллелизма.

**Сценарии:**

1. Первый вход → OAuth → выбор удалённой папки → первичная двусторонняя синхронизация.
2. Ежедневная работа: локальные изменения → **Sync now** (или автосинк по таймеру при активном приложении).
3. Конфликт редактирования `.md` → автоматический merge; при неуспехе — создаём две версии.
4. Диагностика: просмотр отчёта (версии, лимиты, последние ошибки).

---

## 3. Технические основы

### 3.1. REST API Yandex.Disk (ядро)

- Метаданные/листинг: `/v1/disk/resources` (пагинация, поля: `md5`, `sha256`, `size`, `modified`, `type`, `path`, `revision`).
- Загрузка: `GET /v1/disk/resources/upload?path=...&overwrite=...` → `PUT` по выданному `href`.
- Скачивание: `GET /v1/disk/resources/download?path=...` → `GET` по `href`.
- Операции: `POST /move`, `POST /copy`, `DELETE /v1/disk/resources?path=...`; длительные — polling статуса операции.

### 3.2. OAuth

- Поток авторизации через Яндекс ID: получение `access_token` c минимально необходимыми scope (чтение/запись к выбранной папке; опционально AppFolder).
- Хранение токена в данных плагина; опции: «не хранить — запрашивать при запуске».

### 3.3. Среда Obsidian

- Desktop: `fetch`/`requestUrl`. Mobile: только `requestUrl` для обхода CORS.
- Подписка на события Vault (create/modify/delete/rename) для инкрементального сканирования.

---

## 4. Функциональные требования

### 4.1. Настройки плагина

- **Account:** статус OAuth; кнопки *Connect*, *Disconnect*, *Revoke*.
- **Remote folder:** выбор/смена базовой папки на Диске.
- **Scope:** весь Vault или поддерево; списки **Ignore** (glob/regex) и **Binary-types** (png/jpg/pdf/zip и др.).
- **Политики синка:** двунаправленный / только upload / только download; поведение delete (зеркалирование/skip/корзина).
- **Ограничения:** `max-size` (МБ), `exclude-extensions`, параллелизм (Upload/Download), лимит одновременных операций.
- **Автосинк:** опция «каждые N минут при активном приложении» (без фонового демона).
- **Diagnostics:** сбор отчёта (JSON/MD), **Dry-run**.

### 4.2. Команды/UX

- **Sync now:** локальный скан → сравнение с кэшем → план операций → прогресс (файлы, байты, скорость, ретраи).
- **Dry-run:** показать план без выполнения.
- **Resolve conflicts:** уведомления + экран конфликтов с действиями.
- **Diagnostics:** лог, метрики, экспорт отчёта.
- **First run wizard:** OAuth → выбор папки → оценка объёма → запуск синка.

### 4.3. Синхронизация (алгоритм)

1. **Локальный индекс:** KV (`data.json` плагина): `path`, `size`, `mtime`, `hash?`, `remoteRevision`, `lastSync`.
2. **Удалённые метаданные:** листинг каталога (порционно); чтение `md5/sha256`, `size`, `modified`, `revision`.
3. **Сопоставление:**
   - Локальный новее → upload (overwrite согласно политике).
   - Удалённый новее → download.
   - **Rename:** обнаружение по совпадению `hash/size` при смене пути → `move` или локальный rename.
   - **Delete:** по выбранной политике.
4. **Передача:**
   - Upload: `GET upload_link` → `PUT` (потоково), фиксация `revision`.
   - Download: `GET download_link` → `GET` и запись файла.
5. **Очередь и устойчивость:** ограниченный параллелизм, экспоненциальный backoff, уважение `Retry-After` (429), паузы/повторы.

### 4.4. Конфликты и слияние

- **.md:** 3‑way merge (diff‑match‑patch); при неуспехе создаём две версии: `note (conflict yyyy-MM-dd HHmm local).md` и `note (remote).md`.
- **Бинарные:** всегда сохраняем обе версии.
- Журнал: причина, пути, задействованные `revision`.



---

## Приложение B. Ссылки на документацию

**Yandex.Disk REST API**
- Обзор REST API: https://yandex.com/dev/disk/rest/
- Обзор Disk API: https://yandex.com/dev/disk/
- Песочница (Polygon): https://yandex.com/dev/disk/poligon
- Базовый URL API: https://cloud-api.yandex.net/v1/disk/
  - Метаданные/листинг: `GET /v1/disk/resources?path=...`
  - Ссылка на загрузку: `GET /v1/disk/resources/upload?path=...&overwrite=true`
  - Ссылка на скачивание: `GET /v1/disk/resources/download?path=...`
  - Операции: `POST /v1/disk/resources/move`, `POST /v1/disk/resources/copy`, `DELETE /v1/disk/resources?path=...`
  - *(Неофициально)* Обновление `custom_properties`: https://yadisk.readthedocs.io/en/v3.1.0/api_reference/sync_api.html , пример `PatchRequest`: https://yadisk.readthedocs.io/ru/v2.1.0/_modules/yadisk/api/resources.html#PatchRequest

**OAuth (Yandex ID)**
- Обзор и концепции: https://yandex.com/dev/id/doc/en/
- Регистрация приложения: https://yandex.com/dev/id/doc/en/register-client
- Получение OAuth‑токена: https://yandex.com/dev/id/doc/en/access
- Панель управления OAuth: https://oauth.yandex.com/
- Прямая ссылка создания приложения: https://oauth.yandex.com/client/new/id/

**Obsidian Plugin API**
- Главная страница Dev Docs: https://docs.obsidian.md/Home
- Плагин (класс `Plugin`): https://docs.obsidian.md/Reference/TypeScript+API/Plugin
- HTTP без CORS — `requestUrl`: https://docs.obsidian.md/Reference/TypeScript+API/requestUrl
- Работа с файлами — `Vault`: https://docs.obsidian.md/Reference/TypeScript+API/Vault
- События: https://docs.obsidian.md/Plugins/Events
- Типы API (d.ts): https://github.com/obsidianmd/obsidian-api
- Шаблон плагина: https://github.com/obsidianmd/obsidian-sample-plugin
- Туториал «Build a plugin»: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin

**HTTP / устойчивость**
- Статус `429 Too Many Requests`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
- Заголовок `Retry-After`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After

**Алгоритм слияния текста**
- Google Diff Match Patch: https://github.com/google/diff-match-patch

