const DEFAULTS = { debug: false, autoReload: true, darkMode: true, clicks: 0, clicksAt: 0, reloads: 0 };
const LOG_KEY = 'ringupLog';
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
    const count = (items[LOG_KEY] || []).length;
    document.getElementById('logCount').textContent = count + (count === 1 ? ' line' : ' lines');
}

function refresh() {
    storage.get({ ...DEFAULTS, [LOG_KEY]: [] }, render);
}

function flash(id, text) {
    const button = document.getElementById(id);
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, 1500);
}

for (const id of ['debug', 'autoReload', 'darkMode']) {
    document.getElementById(id).addEventListener('change', e => storage.set({ [id]: e.target.checked }));
}

document.getElementById('reset').addEventListener('click', () => {
    storage.set({ clicks: 0, clicksAt: 0, reloads: 0, reloadsAt: 0 }, refresh);
});

document.getElementById('copyLogs').addEventListener('click', () => {
    storage.get({ [LOG_KEY]: [] }, items => {
        const lines = items[LOG_KEY] || [];
        navigator.clipboard.writeText(lines.join('\n')).then(
            () => flash('copyLogs', 'Copied ' + lines.length + ' lines'),
            () => flash('copyLogs', 'Copy failed')
        );
    });
});

document.getElementById('clearLogs').addEventListener('click', () => {
    storage.set({ [LOG_KEY]: [] }, refresh);
});

chrome.storage.onChanged.addListener(refresh);
refresh();
