const DEFAULTS = { debug: false, autoReload: true, darkMode: true, clicks: 0, clicksAt: 0, reloads: 0 };
const storage = chrome.storage.local;

function formatTime(ms) {
    if (!ms) return 'never';
    const date = new Date(ms);
    return date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString()
        : date.toLocaleString();
}

function render(items) {
    document.getElementById('clicks').textContent = items.clicks;
    document.getElementById('clicksAt').textContent = formatTime(items.clicksAt);
    document.getElementById('reloads').textContent = items.reloads;
    document.getElementById('debug').checked = items.debug;
    document.getElementById('autoReload').checked = items.autoReload;
    document.getElementById('darkMode').checked = items.darkMode;
}

function refresh() {
    storage.get(DEFAULTS, render);
}

for (const id of ['debug', 'autoReload', 'darkMode']) {
    document.getElementById(id).addEventListener('change', e => storage.set({ [id]: e.target.checked }));
}

document.getElementById('reset').addEventListener('click', () => {
    storage.set({ clicks: 0, clicksAt: 0, reloads: 0, reloadsAt: 0 }, refresh);
});

chrome.storage.onChanged.addListener(refresh);
refresh();
