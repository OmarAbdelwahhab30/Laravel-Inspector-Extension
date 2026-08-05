# Laravel Inspector (Chrome extension)

Network-layer DevTools panel. No build step — load it unpacked:

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this `extension/` folder.
3. Open DevTools on any page hitting a Laravel app with the `laravel-inspector` package enabled, and switch to the **Laravel** panel.

Requests carrying an `X-Laravel-Devtools-Request` response header get a red dot in the list; click one to see its backend snapshot (Controller/Route/Response now, Queries/Events/Jobs/Timeline once those collectors are built in the package).

Note: `chrome.devtools.network.onRequestFinished` only sees requests that happen while the panel is open — `background.js` independently records the same header via `chrome.webRequest` so requests from before the panel was opened still show up.

## Site access

`host_permissions` covers the hosts Laravel dev servers actually use — `localhost`, `127.0.0.1`, `*.localhost` and `*.test` (Herd/Valet), over both http and https. Match patterns ignore ports, so `:8000`, `:80` and friends are all included.

Requesting "read every site you visit" for a tool that only ever talks to a local dev box is a needlessly alarming permission prompt — and a slower review, should this ever go up on the Chrome Web Store — so the broad pattern moved to `optional_host_permissions` instead.

**On a dev domain outside that list** (`myapp.local`, `*.ddev.site`, a custom host), only the pre-panel backfill degrades: nothing recorded before you opened DevTools appears. Everything else keeps working — `chrome.devtools.network` needs no host permission, and the panel's calls to `/__devtools/request/{id}` and `/__devtools/open-editor` succeed on plain CORS, since the package's `AllowExtensionOrigin` middleware answers both with `Access-Control-Allow-Origin: *`.

To restore the backfill, grant the wider access by hand: `chrome://extensions` → **Laravel Inspector** → **Details** → **Site access** → **On all sites**.

## Opening the extension

1. Open the Laravel application in Chrome.
2. Press **Right-click → Inspect** to open Chrome DevTools.
3. In the DevTools tab bar, click **Laravel Inspector**.
