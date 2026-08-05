// Supplements chrome.devtools.network (which only sees requests that happen
// while the DevTools panel is open) by independently watching response
// headers for every request, so a snapshot is still discoverable if the
// developer opens DevTools after the request already finished. Headers and
// timing only — no bodies are read here, matching the plan's reasoning that
// only the header value is needed for correlation.
const STORAGE_KEY = 'laravelHistory';
const MAX_ENTRIES = 200;
const HEADER_NAME = 'x-laravel-devtools-request';

chrome.webRequest.onCompleted.addListener(
    (details) => {
        const header = (details.responseHeaders || []).find(
            (h) => h.name.toLowerCase() === HEADER_NAME
        );

        if (!header) {
            return;
        }

        const entry = {
            method: details.method,
            url: details.url,
            status: details.statusCode,
            laravelRequestId: header.value,
            timeStamp: details.timeStamp,
        };

        chrome.storage.session.get(STORAGE_KEY).then((result) => {
            const history = result[STORAGE_KEY] || [];
            history.push(entry);

            if (history.length > MAX_ENTRIES) {
                history.splice(0, history.length - MAX_ENTRIES);
            }

            chrome.storage.session.set({ [STORAGE_KEY]: history });
        });
    },
    // Deliberately left broad even though host_permissions is narrowed to
    // local dev hosts: the filter only narrows what an already-permitted
    // event reports, it never widens access — Chrome fires this listener
    // solely for URLs the extension actually holds host permission for. A
    // filter hardcoded to the same list as the manifest would go stale the
    // moment a user grants one of the optional_host_permissions at runtime,
    // silently skipping the very origin they just approved.
    { urls: ['http://*/*', 'https://*/*'] },
    ['responseHeaders']
);

chrome.action.onClicked.addListener((tab) => {
    try {
        const url = new URL(tab.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            chrome.tabs.create({ url: url.origin + '/__devtools' });
        }
    } catch (e) {
        // Ignore invalid URLs
    }
});
