Yandex Disk Sync (Obsidian Plugin)

Overview
- Two-way sync of notes and attachments between your Obsidian vault and Yandex.Disk via REST + OAuth.
- MVP features: OAuth (paste access token), remote base folder selection, basic upload/download, dry-run plan, diagnostics, ignore patterns, simple delete mirroring.

Setup
1) Create a Yandex OAuth application and get a Client ID:
   - https://oauth.yandex.com/client/new/id/
   - Enable access to Yandex.Disk API.
2) In Obsidian, install this plugin (copy this folder into `<vault>/.obsidian/plugins/yandex-disk-sync/`).
3) Open Settings → Community plugins → Yandex Disk Sync:
   - Paste your Client ID.
   - Click Connect → browser opens → grant access. Copy `access_token` from the redirect URL and paste into the modal.
   - Adjust `Remote base folder` (default `/Apps/ObsidianYandex`) and other options.
4) Use commands: Sync now, Dry-run, Diagnostics.

Notes
- Mobile and Desktop supported through Obsidian `requestUrl` (no CORS issues).
- 3-way merge and rename detection are TODO. On conflict, plugin creates two files with `(conflict ...)` suffixes.
- Delete policy `mirror` removes files on the opposite side when deleted locally/remotely since last sync. Use with care.

Troubleshooting
- Check Diagnostics for recent log and environment summary.
- Ensure the remote base folder exists or let the plugin create it.
- Yandex API docs: https://yandex.com/dev/disk/rest/

