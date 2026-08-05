const state = {
    nextId: 1,
    entries: [],
    selectedId: null,
    settings: LaravelInspectorSettings.DEFAULT_SETTINGS,
    lastSnapshot: null,
    lastOrigin: null,
    loadToken: 0,
};

const listEl = document.getElementById('request-list');
const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const detailTitle = document.getElementById('detail-title');
const tabsEl = document.getElementById('tabs');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const themeSelect = document.getElementById('setting-theme');

const DEFAULT_EMPTY_MESSAGE = detailEmpty.innerHTML;

function applyTheme(settings) {
    const mode = settings.themeMode === 'auto'
        ? (chrome.devtools.panels.themeName === 'dark' ? 'dark' : 'default')
        : settings.themeMode;

    document.documentElement.dataset.theme = mode;
}

function initSettingsUi(settings) {
    themeSelect.value = settings.themeMode;
}

async function updateSettings(partial) {
    state.settings = await LaravelInspectorSettings.save(partial);
    applyTheme(state.settings);

    if (state.lastSnapshot) {
        renderOverview(document.getElementById('panel-overview'), state.lastSnapshot);
    }
}

settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    settingsPanel.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
    if (!settingsPanel.classList.contains('hidden') && !settingsPanel.contains(event.target)) {
        settingsPanel.classList.add('hidden');
    }
});

themeSelect.addEventListener('change', () => {
    updateSettings({ themeMode: themeSelect.value });
});

function statusClass(status) {
    if (status >= 500) return 'status-5xx';
    if (status >= 400) return 'status-4xx';
    if (status >= 300) return 'status-3xx';
    return 'status-2xx';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]));
}

function shortUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname + u.search;
    } catch {
        return url;
    }
}

function renderList() {
    if (state.entries.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Waiting for requests&hellip;</div>';
        return;
    }

    listEl.innerHTML = '';

    for (const entry of state.entries) {
        const row = document.createElement('div');
        row.className = 'request-row'
            + (entry.laravelRequestId ? '' : ' is-plain')
            + (entry.id === state.selectedId ? ' is-selected' : '');
        row.dataset.id = String(entry.id);

        row.innerHTML = `
            <span class="request-row__name">${entry.laravelRequestId ? '<span class="laravel-dot"></span>' : ''}<span>${escapeHtml(entry.method)} ${escapeHtml(shortUrl(entry.url))}</span></span>
            <span class="status-badge ${statusClass(entry.status)}">${entry.status}</span>
            <span>${Math.round(entry.time)}ms</span>
        `;

        row.addEventListener('click', () => selectEntry(entry.id));
        listEl.appendChild(row);
    }
}

function addEntry(entry) {
    if (!entry.laravelRequestId) {
        return;
    }
    entry.id = state.nextId++;
    state.entries.push(entry);
    renderList();
}

function showEmptyDetail(message) {
    detailContent.classList.add('hidden');
    detailEmpty.classList.remove('hidden');
    detailEmpty.innerHTML = message;
}

function selectEntry(id) {
    state.selectedId = id;
    renderList();

    const entry = state.entries.find((e) => e.id === id);

    if (!entry.laravelRequestId) {
        showEmptyDetail('This request has no <code>X-Laravel-Devtools-Request</code> header &mdash; nothing to show.');
        return;
    }

    detailEmpty.classList.add('hidden');
    detailContent.classList.remove('hidden');
    detailTitle.textContent = `${entry.method} ${shortUrl(entry.url)}`;
    loadSnapshot(entry);
}

function panels() {
    return {
        overview: document.getElementById('panel-overview'),
        queries: document.getElementById('panel-queries'),
        events: document.getElementById('panel-events'),
        jobs: document.getElementById('panel-jobs'),
        timeline: document.getElementById('panel-timeline'),
    };
}

async function loadSnapshot(entry) {
    // Each call gets a token; if a newer call has started by the time this
    // one's fetch resolves, this one's result is stale and must be dropped —
    // otherwise clicking through requests quickly can let an older,
    // slower-to-resolve fetch overwrite the detail pane after a newer one.
    const token = ++state.loadToken;

    const p = panels();
    p.overview.innerHTML = '<div class="empty-state">Loading&hellip;</div>';
    p.queries.innerHTML = '';
    p.events.innerHTML = '';
    p.jobs.innerHTML = '';
    p.timeline.innerHTML = '';

    let origin;
    try {
        origin = new URL(entry.url, window.location.origin).origin;
    } catch {
        if (token === state.loadToken) {
            p.overview.innerHTML = '<div class="error-note">Could not determine the request\'s origin.</div>';
        }
        return;
    }

    let snapshot;
    try {
        const res = await fetch(`${origin}/__devtools/request/${encodeURIComponent(entry.laravelRequestId)}`);

        if (token !== state.loadToken) {
            return;
        }

        if (!res.ok) {
            p.overview.innerHTML = `<div class="error-note">Snapshot not found (HTTP ${res.status}). Is <code>LARAVEL_DEVTOOLS_ENABLED=true</code> set on ${escapeHtml(origin)}?</div>`;
            return;
        }

        snapshot = await res.json();

        if (token !== state.loadToken) {
            return;
        }
    } catch (err) {
        if (token === state.loadToken) {
            p.overview.innerHTML = `<div class="error-note">Could not reach ${escapeHtml(origin)} &mdash; ${escapeHtml(err.message)}</div>`;
        }
        return;
    }

    state.lastSnapshot = snapshot;
    state.lastOrigin = origin;

    renderOverview(p.overview, snapshot);
    renderQueries(p.queries, snapshot.queries);
    renderEvents(p.events, snapshot.events);
    renderJobs(p.jobs, snapshot.jobs);
    renderTimeline(p.timeline, snapshot);

    document.querySelector('.tab[data-tab="queries"]').textContent = `Queries${snapshot.queries && snapshot.queries.length ? ` (${snapshot.queries.length})` : ''}`;
    document.querySelector('.tab[data-tab="events"]').textContent = `Events${snapshot.events && snapshot.events.length ? ` (${snapshot.events.length})` : ''}`;
    document.querySelector('.tab[data-tab="jobs"]').textContent = `Jobs${snapshot.jobs && snapshot.jobs.length ? ` (${snapshot.jobs.length})` : ''}`;
    document.querySelector('.tab[data-tab="timeline"]').textContent = `Timeline${snapshot.timeline && snapshot.timeline.length ? ` (${snapshot.timeline.length})` : ''}`;
}

// Reusable across any collector's output — the Vue-DevTools-style "open in
// IDE" affordance: any field with file+line becomes clickable, so future
// collectors (Job, Resource, ...) get this for free once they populate
// file/line, with no extension changes. No editor is picked here — the
// click just asks the Laravel backend to open the file, and it auto-detects
// whichever supported editor is running on that machine (see
// OpenEditorController), same as Vue DevTools.
function renderFileLink(file, line) {
    if (!file) {
        return '—';
    }

    const label = escapeHtml(file) + (line ? ':' + line : '');

    return `<a class="file-link mono" href="#" data-file="${escapeHtml(file)}" data-line="${line ?? ''}" title="Open in editor">${label}</a>`;
}

async function openInEditor(link) {
    const file = link.dataset.file;
    const line = link.dataset.line;

    if (!file || !state.lastOrigin) {
        return;
    }

    link.classList.remove('file-link--error');
    link.title = 'Opening…';

    try {
        const url = new URL('/__devtools/open-editor', state.lastOrigin);
        url.searchParams.set('file', file);
        if (line) {
            url.searchParams.set('line', line);
        }

        const res = await fetch(url);

        if (res.ok) {
            link.title = 'Open in editor';
            return;
        }

        const body = await res.json().catch(() => null);
        link.title = (body && body.message) || `Could not open editor (HTTP ${res.status})`;
        link.classList.add('file-link--error');
    } catch (err) {
        link.title = `Could not reach ${state.lastOrigin} — ${err.message}`;
        link.classList.add('file-link--error');
    }
}

document.addEventListener('click', (event) => {
    const link = event.target.closest('.file-link');
    if (!link) {
        return;
    }

    event.preventDefault();
    openInEditor(link);
});

function renderOverview(el, snapshot) {
    const req = snapshot.request || {};
    const route = req.route || {};
    const controller = snapshot.controller || {};
    const response = snapshot.response || {};

    el.innerHTML = `
        <dl class="kv-table">
            <dt>Method</dt><dd>${escapeHtml(req.method ?? '—')}</dd>
            <dt>URL</dt><dd class="mono">${escapeHtml(req.url ?? '—')}</dd>
            <dt>Route</dt><dd class="mono">${escapeHtml(route.uri ?? '—')}</dd>
            <dt>Route name</dt><dd>${escapeHtml(route.name ?? '—')}</dd>
            <dt>Controller</dt><dd class="mono">${escapeHtml(controller.class ?? '—')}${controller.method ? '@' + escapeHtml(controller.method) : ''}</dd>
            <dt>File</dt><dd>${renderFileLink(controller.file, controller.line)}</dd>
            <dt>Status</dt><dd><span class="status-badge ${statusClass(response.status)}">${response.status ?? '—'}</span></dd>
            <dt>Duration</dt><dd>${response.duration ?? '—'} ms</dd>
        </dl>
    `;
}

function renderQueries(el, queries) {
    if (!queries || queries.length === 0) {
        el.innerHTML = '<div class="reserved-note">No queries recorded for this request.</div>';
        return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    for (const q of queries) {
        const badge = q.is_slow ? '<span class="status-badge status-5xx" style="margin-left: 8px;">SLOW</span>' : '';
        html += `<div style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <div class="mono" style="margin-bottom: 6px; font-weight: 600;">${escapeHtml(q.sql)}</div>
            <dl class="kv-table" style="margin: 0; font-size: 10px;">
                <dt>Time</dt><dd>${q.time}ms ${badge}</dd>
                <dt>Connection</dt><dd>${escapeHtml(q.connection)}</dd>
                <dt>Bindings</dt><dd class="mono">${escapeHtml(JSON.stringify(q.bindings))}</dd>
                <dt>File</dt><dd>${renderFileLink(q.file, q.line)}</dd>
            </dl>
        </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
}

function renderEvents(el, events) {
    if (!events || events.length === 0) {
        el.innerHTML = '<div class="reserved-note">No events recorded for this request.</div>';
        return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    for (const e of events) {
        html += `<div style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <div class="mono" style="margin-bottom: 6px; font-weight: 600;">${escapeHtml(e.name)}</div>
            <dl class="kv-table" style="margin: 0; font-size: 10px;">
                <dt>Payload</dt><dd class="mono">${escapeHtml(JSON.stringify(e.payload))}</dd>
                <dt>File</dt><dd>${renderFileLink(e.file, e.line)}</dd>
            </dl>
        </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
}

function renderJobs(el, jobs) {
    if (!jobs || jobs.length === 0) {
        el.innerHTML = '<div class="reserved-note">No jobs recorded for this request.</div>';
        return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    for (const j of jobs) {
        const statusCls = j.status === 'failed' ? 'status-5xx' : 'status-2xx';
        html += `<div style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <div class="mono" style="margin-bottom: 6px; font-weight: 600;">${escapeHtml(j.class)}</div>
            <dl class="kv-table" style="margin: 0; font-size: 10px;">
                <dt>Status</dt><dd class="status-badge ${statusCls}">${escapeHtml(j.status)}</dd>
                <dt>Time</dt><dd>${j.time}ms</dd>
                <dt>Connection</dt><dd>${escapeHtml(j.connection)}</dd>
                <dt>Queue</dt><dd>${escapeHtml(j.queue)}</dd>
            </dl>
        </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
}

function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max - 1) + '…' : str;
}

function renderTimeline(el, snapshot) {
    const timeline = snapshot.timeline || [];
    
    if (timeline.length === 0) {
        el.innerHTML = '<div class="reserved-note">No timeline entries recorded yet.</div>';
        return;
    }

    const typeColors = {
        middleware: '#6366f1',
        controller: '#10b981',
        query: '#f59e0b',
        event: '#8b5cf6',
        job: '#ec4899',
    };

    const typeLabels = {
        middleware: 'MIDW',
        controller: 'CTRL',
        query: 'SQL',
        event: 'EVNT',
        job: 'JOB',
    };

    const totalDuration = snapshot.response?.duration || 100;
    
    let html = `<div class="collector-summary">Total: ${totalDuration}ms &middot; ${timeline.length} ${timeline.length === 1 ? 'entry' : 'entries'}</div>`;
    html += '<div class="timeline-waterfall">';

    timeline.forEach((entry, index) => {
        const offsetPercent = Math.min((entry.offset / totalDuration) * 100, 100);
        const durationPercent = entry.duration
            ? Math.max(Math.min((entry.duration / totalDuration) * 100, 100 - offsetPercent), 0.4)
            : 0.4;
        const color = typeColors[entry.type] || '#78909c';
        const typeLabel = typeLabels[entry.type] || entry.type.toUpperCase().substring(0, 4);
        const timeText = entry.duration != null
            ? entry.duration.toFixed(1) + 'ms'
            : entry.offset.toFixed(1) + 'ms';
        const tooltipText = `${entry.offset.toFixed(1)}ms` + (entry.duration != null ? ` — ${entry.duration.toFixed(1)}ms` : '');

        html += `<div class="timeline-row" data-index="${index}">
            <div class="timeline-label">
                <span class="timeline-type-badge" style="background: ${color}">${typeLabel}</span>
                <span class="timeline-entry-label mono" title="${escapeHtml(entry.label)}">${escapeHtml(truncate(entry.label, 50))}</span>
            </div>
            <div class="timeline-bar-container">
                <div class="timeline-bar" style="left: ${offsetPercent}%; width: ${durationPercent}%; background: ${color};" title="${tooltipText}"></div>
            </div>
            <div class="timeline-time">${timeText}</div>
        </div>`;
    });

    html += '</div>';
    el.innerHTML = html;
}

tabsEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab');
    if (!btn) return;

    for (const tab of tabsEl.querySelectorAll('.tab')) {
        tab.classList.toggle('is-active', tab === btn);
    }

    const name = btn.dataset.tab;
    for (const panel of document.querySelectorAll('.tab-panel')) {
        panel.classList.toggle('is-active', panel.dataset.panel === name);
    }
});

document.getElementById('clear-btn').addEventListener('click', () => {
    state.entries = [];
    state.selectedId = null;
    renderList();
    showEmptyDetail(DEFAULT_EMPTY_MESSAGE);
});

/* ─── Modal Logic ─── */
const timelineModal = document.getElementById('timeline-modal');
const timelineModalTitle = document.getElementById('timeline-modal-title');
const timelineModalBody = document.getElementById('timeline-modal-body');

function closeTimelineModal() {
    timelineModal.classList.add('hidden');
}

document.getElementById('timeline-modal-close').addEventListener('click', closeTimelineModal);
document.querySelector('#timeline-modal .modal-backdrop').addEventListener('click', closeTimelineModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !timelineModal.classList.contains('hidden')) {
        closeTimelineModal();
    }
});

document.getElementById('panel-timeline').addEventListener('click', (e) => {
    const row = e.target.closest('.timeline-row');
    if (!row) return;

    const index = row.dataset.index;
    if (index === undefined || !state.lastSnapshot || !state.lastSnapshot.timeline) return;

    const entry = state.lastSnapshot.timeline[index];
    if (!entry) return;

    timelineModalTitle.textContent = entry.type.toUpperCase() + ' Details';

    let bodyHtml = `<dl class="kv-table" style="margin-bottom: 0;">`;
    
    if (entry.label) {
        bodyHtml += `<dt>Label</dt><dd class="mono">${escapeHtml(entry.label)}</dd>`;
    }
    
    let fullItem = null;
    if (entry.type === 'query' && state.lastSnapshot.queries) {
        fullItem = state.lastSnapshot.queries.find(q => q.sql === entry.label);
    } else if (entry.type === 'event' && state.lastSnapshot.events) {
        fullItem = state.lastSnapshot.events.find(ev => ev.name === entry.label);
    } else if (entry.type === 'job' && state.lastSnapshot.jobs) {
        fullItem = state.lastSnapshot.jobs.find(j => j.class === entry.label);
    } else if (entry.type === 'controller' && state.lastSnapshot.controller) {
        fullItem = state.lastSnapshot.controller;
    }

    if (fullItem) {
        if (entry.type === 'query' && fullItem.bindings && fullItem.bindings.length > 0) {
            bodyHtml += `<dt>Bindings</dt><dd class="mono">${escapeHtml(JSON.stringify(fullItem.bindings))}</dd>`;
        }
        if (fullItem.connection) {
            bodyHtml += `<dt>Connection</dt><dd>${escapeHtml(fullItem.connection)}</dd>`;
        }
        if (fullItem.file) {
            bodyHtml += `<dt>File</dt><dd>${renderFileLink(fullItem.file, fullItem.line)}</dd>`;
        }
    }

    bodyHtml += `</dl>`;

    timelineModalBody.innerHTML = bodyHtml;
    timelineModal.classList.remove('hidden');
});

// Backfill requests that finished before this panel was opened, captured
// independently by background.js via chrome.webRequest.
chrome.storage.session.get('laravelHistory').then((result) => {
    const history = result.laravelHistory || [];

    for (const h of history) {
        addEntry({
            method: h.method,
            url: h.url,
            status: h.status,
            time: 0,
            laravelRequestId: h.laravelRequestId,
        });
    }
});

LaravelInspectorSettings.load().then((settings) => {
    state.settings = settings;
    applyTheme(settings);
    initSettingsUi(settings);
});

chrome.devtools.network.onRequestFinished.addListener((request) => {
    const headers = (request.response && request.response.headers) || [];
    const header = headers.find((h) => h.name.toLowerCase() === 'x-laravel-devtools-request');

    addEntry({
        method: request.request.method,
        url: request.request.url,
        status: request.response.status,
        time: request.time || 0,
        laravelRequestId: header ? header.value : null,
    });
});
