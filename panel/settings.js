// Settings live on the extension side (chrome.storage.local, per Chrome
// profile). There is no editor picker: opening a file happens server-side
// (see OpenEditorController in the Laravel package), which auto-detects
// whichever supported editor is currently running on the developer's
// machine — the same click-to-open UX as Vue DevTools' `launch-editor`.
const LaravelInspectorSettings = (() => {
    const STORAGE_KEY = 'settings';

    const DEFAULT_SETTINGS = {
        themeMode: 'auto', // 'auto' | 'default' | 'dark'
    };

    async function load() {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
    }

    async function save(partial) {
        const current = await load();
        const next = { ...current, ...partial };
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
        return next;
    }

    return { DEFAULT_SETTINGS, load, save };
})();
