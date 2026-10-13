const POLL_MS = 6000;
const POLL_FAST_MS = 1200;
const OBSERVER_THROTTLE_MS = 250;

const SETTINGS_DEFAULTS = { debug: false, autoReload: true, darkMode: true };
const settings = { ...SETTINGS_DEFAULTS };

function extensionStorage() {
    try {
        return chrome.storage && chrome.storage.local;
    } catch (_) {
        return null;
    }
}

const LOG_KEY = 'ringupLog';
const LOG_MAX = 2000;
const LOG_FLUSH_MS = 2000;

let settingsLoaded = false;
let persistedLog = null;
let unsavedLog = [];
let logFlushTimer = null;
const earlyLog = [];

function loadSettings() {
    const storage = extensionStorage();
    if (!storage) return;
    try {
        storage.get({ ...SETTINGS_DEFAULTS, [LOG_KEY]: [] }, items => {
            void chrome.runtime.lastError;
            items = items || {};
            for (const key of Object.keys(SETTINGS_DEFAULTS)) {
                if (key in items) settings[key] = items[key];
            }
            persistedLog = Array.isArray(items[LOG_KEY]) ? items[LOG_KEY] : [];
            settingsLoaded = true;
            for (const entry of earlyLog.splice(0)) writeLog(entry);
            updateDarkMode();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const key of Object.keys(SETTINGS_DEFAULTS)) {
                if (changes[key]) {
                    settings[key] = changes[key].newValue;
                    debugLog('Setting changed: ' + key + ' = ' + changes[key].newValue);
                }
            }
            if (changes[LOG_KEY]) persistedLog = changes[LOG_KEY].newValue || [];
            updateDarkMode();
        });
    } catch (_) {
        settingsLoaded = true;
    }
}

function timestamp() {
    const d = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
}

function writeLog(entry) {
    if (!settings.debug) return;
    console.log('[Ringup] ' + entry);
    unsavedLog.push(entry);
    if (!logFlushTimer) logFlushTimer = setTimeout(flushLog, LOG_FLUSH_MS);
}

function flushLog() {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
    const storage = extensionStorage();
    if (!storage || !persistedLog || !unsavedLog.length) return;
    persistedLog = persistedLog.concat(unsavedLog).slice(-LOG_MAX);
    unsavedLog = [];
    try {
        storage.set({ [LOG_KEY]: persistedLog }, () => void chrome.runtime.lastError);
    } catch (_) {}
}

const throttledLogs = new Map();

function debugLogEvery(key, ms, msg) {
    const now = Date.now();
    if (now - (throttledLogs.get(key) || 0) < ms) return;
    throttledLogs.set(key, now);
    debugLog(msg);
}

function bumpStat(name) {
    const storage = extensionStorage();
    if (!storage) return;
    try {
        storage.get({ [name]: 0 }, items => {
            void chrome.runtime.lastError;
            storage.set({ [name]: ((items && items[name]) || 0) + 1, [name + 'At']: Date.now() });
        });
    } catch (_) {}
}

function debugLog(msg) {
    const entry = timestamp() + ' ' + msg;
    if (!settingsLoaded) earlyLog.push(entry);
    else writeLog(entry);
}

const DARK_CLASS = 'ringup-dark';
const DARK_PATH = /^\/account\/dashboard/;
const DARK_FILTER = 'invert(1) hue-rotate(180deg)';

function updateDarkMode() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle(DARK_CLASS, !!settings.darkMode && DARK_PATH.test(location.pathname));
    if (document.body) markDarkExempt();
}

const DARK_EXEMPT_CLASS = 'ringup-dark-exempt';
const PLAYER_SELECTOR = 'video, [data-testid="video-player-header"]';

function playerRootOf(el) {
    const dialog = el.closest('[role="dialog"], [aria-modal="true"]');
    if (dialog) return dialog;
    let root = null;
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') root = node;
    }
    return root;
}

function markDarkExempt() {
    const roots = new Set();
    if (document.documentElement.classList.contains(DARK_CLASS)) {
        for (const el of document.querySelectorAll(PLAYER_SELECTOR)) {
            const root = playerRootOf(el);
            if (root) roots.add(root);
        }
    }
    for (const el of document.querySelectorAll('.' + DARK_EXEMPT_CLASS)) {
        if (!roots.has(el)) el.classList.remove(DARK_EXEMPT_CLASS);
    }
    for (const root of roots) {
        if ([...roots].some(other => other !== root && other.contains(root))) continue;
        root.classList.add(DARK_EXEMPT_CLASS);
    }
}

function watchDarkMode() {
    let lastPath = null;
    let lastHref = location.href;
    let lastCheck = 0;
    let pending = null;
    const check = () => {
        pending = null;
        lastCheck = Date.now();
        if (location.href !== lastHref) {
            debugLog('URL changed: ' + lastHref + ' -> ' + location.href);
            lastHref = location.href;
        }
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            updateDarkMode();
        }
        markDarkExempt();
    };
    const schedule = () => {
        if (pending) return;
        const wait = OBSERVER_THROTTLE_MS - (Date.now() - lastCheck);
        if (wait <= 0) check();
        else pending = setTimeout(check, wait);
    };
    check();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', schedule);
}

function injectStyles() {
    if (!document.head) return false;
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ringup-notification {
            position: fixed; top: 29px; right: 68px; width: 22px; height: 24px; z-index: 9999;
            opacity: 0; transition: opacity 0.3s ease-in-out; pointer-events: none;
            filter: drop-shadow(0 0 2px rgba(33, 150, 243, 0.3));
        }
        .ringup-notification.show { opacity: 1; }
        .ringup-notification svg { width: 100%; height: 100%; animation: rotate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .ringup-notification circle { stroke: url(#ringup-gradient); }
        html.${DARK_CLASS} { filter: ${DARK_FILTER}; }
        html.${DARK_CLASS} body { background-color: #fff !important; min-height: 100vh; }
        html.${DARK_CLASS} video,
        html.${DARK_CLASS} canvas,
        html.${DARK_CLASS} iframe,
        html.${DARK_CLASS} img:not([class*="IconImage"]),
        html.${DARK_CLASS} [class*="styled__Thumbnail-"],
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} { filter: ${DARK_FILTER}; }
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} video,
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} canvas,
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} iframe,
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} img,
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS} [class*="styled__Thumbnail-"] { filter: none; }
        html.${DARK_CLASS} :fullscreen { filter: ${DARK_FILTER}; }
        html.${DARK_CLASS} video:fullscreen,
        html.${DARK_CLASS} canvas:fullscreen,
        html.${DARK_CLASS} iframe:fullscreen,
        html.${DARK_CLASS} img:not([class*="IconImage"]):fullscreen,
        html.${DARK_CLASS} [class*="styled__Thumbnail-"]:fullscreen,
        html.${DARK_CLASS} .${DARK_EXEMPT_CLASS}:fullscreen { filter: none; }
    `;
    document.head.appendChild(style);
    return true;
}

const PAUSE_MODAL_SELECTOR = '[data-testid="live-view__global-reconnect-modal"]';

const CAMERA_RECONNECT_SELECTOR = '[data-testid="video-error__button"]';

const RECONNECT_WORDS = [
    'Reconnect', 'Reconnect session', 'Stay connected', 'Continue viewing',
    'Reconnecter', 'Se reconnecter', 'Rétablir la connexion', 'Continuer à regarder',
    'Rester connecté', 'Reprendre la vidéo en direct', 'Continuer la vidéo en direct',
    'Reconectar', 'Verbindung wiederherstellen', 'Riconnetti', 'Opnieuw verbinden',
    'Yeniden bağlan', 'Připojit znovu', 'Połącz ponownie', 'Újracsatlakozás', '重新连接', '再接続'
];

const MODAL_ONLY_WORDS = ['Continue', 'Resume', 'Continuer', 'Reprendre', 'Oui', 'Yes'];

const ENDED_PHRASES = [
    'Live view ended', 'Live View has ended', 'Live video ended', 'Live stream ended',
    'Vidéo en direct terminée', 'La vidéo en direct est terminée', 'Vidéo en direct arrêtée',
    'Liveansicht beendet', 'Live-Ansicht beendet', 'Vista en vivo finalizada',
    'Vídeo en directo finalizado', 'Visualizzazione live terminata', 'Liveweergave beëindigd'
];

const UNREACHABLE_PHRASES = [
    'Impossible de se connecter', 'Connexion impossible', 'Unable to connect', 'Could not connect',
    "Couldn't connect", 'Verbindung nicht möglich', 'No se puede conectar', 'Impossibile connettersi',
    'Kan geen verbinding maken'
];

const MODAL_PHRASES = [
    'Continue Live View', 'Live View paused', 'Reconnect or end', 'End live view',
    'Continuer la vidéo en direct', 'Vidéo en direct en pause', 'Vidéo en direct suspendue',
    'Reconnecter ou mettre fin', 'Mettre fin à la vidéo en direct', 'Terminer la vidéo en direct',
    'Mettre fin à la session', 'Toujours là', 'Êtes-vous toujours', 'en pause',
    'Poursuivre la vidéo en direct', 'Vidéo en direct mise en pause', 'Reconnectez-vous',
    ...ENDED_PHRASES
];

const MAX_LABEL_LEN = 40;
const MAX_MODAL_TEXT_LEN = 2000;
const MAX_SAME_TARGET_CLICKS = 3;
const CLICK_GRACE_MS = 10000;
const BACKOFF_MS = 60000;

function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function labelsOf(el) {
    const labels = [norm(el.innerText || el.textContent)];
    if (el.getAttribute) labels.push(norm(el.getAttribute('aria-label')));
    return labels.filter(l => l && l.length <= MAX_LABEL_LEN);
}

function isVisible(el) {
    if (!el || !el.offsetParent) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function isDisabled(el) {
    return el.disabled === true || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
}

function centerOf(el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isInViewport({ x, y }) {
    return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
}

function isOnTop(el) {
    const center = centerOf(el);
    if (!isInViewport(center)) return true;
    const root = el.getRootNode && el.getRootNode();
    const hit = (root && root.elementFromPoint ? root : document).elementFromPoint(center.x, center.y);
    return !hit || el === hit || el.contains(hit);
}

function findKnownButtons() {
    const testId = trustedClicks ? 'modal__accept-button' : 'modal__close-button';
    const modalButton = document.querySelector(PAUSE_MODAL_SELECTOR + ' [data-testid="' + testId + '"]');
    if (modalButton && isVisible(modalButton) && !isDisabled(modalButton)) return [modalButton];
    return [...document.querySelectorAll(CAMERA_RECONNECT_SELECTOR)]
        .filter(el => isVisible(el) && !isDisabled(el) && isOnTop(el));
}

function findEndedMessages() {
    const phrases = ENDED_PHRASES.map(norm);
    const found = [];
    for (const el of document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, [role="alert"], [role="status"]')) {
        const text = norm(el.textContent);
        if (!text || text.length > 80 || !phrases.some(p => text === p || text.startsWith(p))) continue;
        if (!isVisible(el)) continue;
        if (found.some(f => f.contains(el))) continue;
        for (let i = found.length - 1; i >= 0; i--) {
            if (el.contains(found[i])) found.splice(i, 1);
        }
        found.push(el);
    }
    return found;
}

function findUnreachableMessages() {
    const phrases = UNREACHABLE_PHRASES.map(norm);
    return [...document.querySelectorAll('p, span, div, [role="alert"], [role="status"]')].filter(el => {
        const text = norm(el.textContent);
        if (!text || text.length > 200 || !phrases.some(p => text.startsWith(p))) return false;
        return ![...el.children].some(child => phrases.some(p => norm(child.textContent).startsWith(p))) && isVisible(el);
    });
}

function isReconnectLabel(el) {
    return labelsOf(el).some(l => RECONNECT_WORDS.some(w => l.includes(norm(w))));
}

function findEndedReconnectButtons() {
    const targets = [];
    for (const message of findEndedMessages()) {
        let container = message.parentElement;
        for (let depth = 0; container && container !== document.body && depth < 6; depth++) {
            const clickables = [...container.querySelectorAll('button, [role="button"], a')]
                .filter(el => isVisible(el) && !isDisabled(el) && isReconnectLabel(el));
            const loose = clickables.length ? [] : [...container.querySelectorAll('*')]
                .filter(el => isVisible(el) && isReconnectLabel(el) && ![...el.children].some(isReconnectLabel));
            const pick = clickables[0] || loose[0];
            if (pick) {
                if (!targets.includes(pick)) targets.push(pick);
                break;
            }
            container = container.parentElement;
        }
    }
    return targets;
}

function isInsideReconnectModal(el) {
    let node = el;
    while (node && node !== document.body) {
        const text = norm(node.innerText || node.textContent);
        if (text.length > MAX_MODAL_TEXT_LEN) return false;
        if (MODAL_PHRASES.some(p => text.includes(norm(p)))) return true;
        node = node.parentElement || (node.getRootNode && node.getRootNode().host);
    }
    return false;
}

function collectClickables(root, out) {
    if (!root) return;
    try {
        out.push(...root.querySelectorAll('button, [role="button"], a[href="#"]'));
    } catch (_) {}
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectClickables(el.shadowRoot, out);
    }
}

function findReconnectByText(matches) {
    const candidates = [];
    collectClickables(document, candidates);
    let best = null;
    let bestRank = Infinity;
    for (const el of candidates) {
        if (!isVisible(el) || isDisabled(el)) continue;
        const labels = labelsOf(el);
        const strong = labels.some(l => RECONNECT_WORDS.some(w => l.includes(norm(w))));
        const weak = !strong && labels.some(l => MODAL_ONLY_WORDS.some(w => l === norm(w)));
        if (!strong && !weak) continue;
        const inModal = isInsideReconnectModal(el);
        const onTop = isOnTop(el);
        if (matches) matches.push({ label: labels.join(' | '), kind: strong ? 'strong' : 'weak', inModal, onTop });
        const rank = candidateRank(strong, inModal, onTop);
        if (rank === 0) return el;
        if (rank < bestRank) {
            best = el;
            bestRank = rank;
        }
    }
    return best;
}

function candidateRank(strong, inModal, onTop) {
    let rank;
    if (inModal) rank = strong ? 0 : 1;
    else if (strong) rank = 2;
    else return Infinity;
    return onTop ? rank : rank + 3;
}

const DIALOG_SELECTORS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], ' +
    '[class*="Modal"], [class*="modal"], [class*="Dialog"], [class*="Overlay"], [class*="Paused"]';
const DEBUG_HEARTBEAT_POLLS = 10;

let lastScanSummary = null;
let pollsSinceLastLog = 0;

function logScanState() {
    if (!settings.debug) return;
    const known = findKnownButtons().map(el => labelsOf(el).join(' | '));
    const matches = [];
    const picked = known.length ? null : findReconnectByText(matches);
    const dialogs = [];
    try {
        for (const el of document.querySelectorAll(DIALOG_SELECTORS)) {
            if (!isVisible(el)) continue;
            const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
            if (text && text.length <= 500) dialogs.push(text);
        }
    } catch (_) {}
    const summary = JSON.stringify({ known, matches, dialogs: [...new Set(dialogs)] });
    pollsSinceLastLog++;
    if (summary === lastScanSummary && pollsSinceLastLog < DEBUG_HEARTBEAT_POLLS) return;
    const changed = summary !== lastScanSummary;
    lastScanSummary = summary;
    pollsSinceLastLog = 0;
    debugLog('Scan' + (changed ? ' (changed)' : ' (heartbeat)') + ': ' + JSON.stringify({
        tabHidden: document.hidden,
        knownButtons: known,
        textFallback: picked ? labelsOf(picked).join(' | ') : null,
        matches,
        dialogs: [...new Set(dialogs)]
    }));
}

let trustedClicks = false;

function detectTrustedClicks() {
    try {
        chrome.runtime.sendMessage({ type: 'ping' }, response => {
            const err = chrome.runtime.lastError;
            trustedClicks = !!(response && response.ok);
            debugLog('Trusted clicks ' + (trustedClicks ? 'available' : 'unavailable (synthetic clicks only)') +
                (err ? ': ' + err.message : ''));
        });
    } catch (e) {
        debugLog('Trusted clicks unavailable: ' + e.message);
    }
}

function sendTrustedAction(message) {
    return new Promise(resolve => {
        const startedAt = Date.now();
        try {
            chrome.runtime.sendMessage(message, response => {
                const err = chrome.runtime.lastError;
                let failure = 'no answer';
                if (response) failure = response.error;
                else if (err) failure = err.message;
                const ok = !!(response && response.ok);
                if (!ok) debugLog('Trusted ' + message.type + ' failed: ' + failure);
                resolve({ ok, ms: Date.now() - startedAt });
            });
        } catch (e) {
            debugLog('Trusted ' + message.type + ' failed: ' + e.message);
            resolve({ ok: false, ms: Date.now() - startedAt });
        }
    });
}

function describeNode(node) {
    if (!(node instanceof Element)) return String(node);
    const testId = node.getAttribute('data-testid');
    const cls = typeof node.className === 'string' ? node.className.split(/\s+/)[0] : '';
    return node.tagName + (testId ? '[data-testid="' + testId + '"]' : '') + (cls ? '.' + cls : '');
}

async function requestTrustedEnter(el) {
    try { el.focus({ preventScroll: true }); } catch (_) {}
    if (document.activeElement !== el) {
        debugLog('Enter fallback skipped: could not focus the button (focused: ' + describeNode(document.activeElement) + ')');
        return false;
    }
    let reached = false;
    const onClick = e => {
        if (e.isTrusted && el.contains(e.target)) reached = true;
    };
    document.addEventListener('click', onClick, true);
    const result = await sendTrustedAction({ type: 'trustedEnter' });
    document.removeEventListener('click', onClick, true);
    if (result.ok) debugLog('Trusted Enter done in ' + result.ms + ' ms; reached the button: ' + reached);
    return result.ok;
}

async function requestTrustedClick(el) {
    const center = centerOf(el);
    if (!isInViewport(center) || !isOnTop(el)) {
        debugLog('Mouse click not possible (button off screen or covered); using Enter');
        return requestTrustedEnter(el);
    }
    debugLog('Trusted click requested at ' + Math.round(center.x) + ',' + Math.round(center.y) + ' on "' + (labelsOf(el)[0] || el.tagName) + '"');
    let landedOn = null;
    const onClick = e => {
        if (e.isTrusted) landedOn = e.target;
    };
    document.addEventListener('click', onClick, true);
    const result = await sendTrustedAction({ type: 'trustedClick', x: center.x, y: center.y });
    document.removeEventListener('click', onClick, true);
    if (!result.ok) return false;
    if (landedOn && el.contains(landedOn)) {
        debugLog('Trusted click done in ' + result.ms + ' ms; it reached the button');
        return true;
    }
    debugLog('Trusted click done in ' + result.ms + ' ms but landed on ' + (landedOn ? describeNode(landedOn) : 'nothing') +
        ' instead of the button; pressing Enter on the button');
    return requestTrustedEnter(el);
}

async function clickElement(el) {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
    if (trustedClicks) return requestTrustedClick(el);
    const { x, y } = centerOf(el);
    debugLog('Synthetic click at ' + Math.round(x) + ',' + Math.round(y) + ' on "' + (labelsOf(el)[0] || el.tagName) + '"');
    const opts = { bubbles: true, cancelable: true, view: window, detail: 1, button: 0, clientX: x, clientY: y };
    try {
        el.focus();
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1, pointerType: 'mouse', isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, pointerType: 'mouse', isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    } catch (_) {}
    el.click();
    return true;
}

let clickState = new WeakMap();
let clicking = false;

function isDue(el) {
    const state = clickState.get(el);
    return !state || Date.now() >= state.nextAt;
}

async function findAndClickReconnect(useTextSearch = true) {
    if (clicking) return false;
    let targets = findKnownButtons();
    for (const el of findEndedReconnectButtons()) {
        if (!targets.includes(el)) targets.push(el);
    }
    if (!targets.length && useTextSearch) {
        const el = findReconnectByText();
        if (el) targets = [el];
    }
    if (!targets.length) {
        if (useTextSearch) clickState = new WeakMap();
        return false;
    }
    const due = targets.filter(isDue);
    if (!due.length) {
        debugLogEvery('notDue', 5000, targets.length + ' reconnect target(s) waiting for their retry delay');
        return false;
    }
    debugLog('Reconnect targets: ' + targets.length + ', due now: ' + due.length + ' [' +
        due.map(el => labelsOf(el)[0] || el.tagName).join(', ') + ']');

    clicking = true;
    let clicked = false;
    try {
        logClickTarget(due[0]);
        for (const el of due) {
            const state = clickState.get(el) || { count: 0, nextAt: 0 };
            state.count++;
            const givingUp = state.count >= MAX_SAME_TARGET_CLICKS;
            state.nextAt = Date.now() + (givingUp ? BACKOFF_MS : CLICK_GRACE_MS);
            if (givingUp) state.count = 0;
            clickState.set(el, state);

            if (!(await clickElement(el))) continue;
            clicked = true;
            bumpStat('clicks');
            debugLog('Clicked ' + (labelsOf(el)[0] || 'Reconnect') + ' (' + (trustedClicks ? 'trusted' : 'synthetic') + ')');
            if (givingUp) {
                debugLog('Button still there after ' + MAX_SAME_TARGET_CLICKS + ' clicks; next try in ' + (BACKOFF_MS / 1000) + 's. See "Click target" above.');
            }
        }
    } catch (e) {
        debugLog('Click error: ' + e.message);
    } finally {
        clicking = false;
    }
    return clicked;
}

const WATCHDOG_MS = 5 * 60000;
const MIN_RELOAD_INTERVAL_MS = 15 * 60000;
const RELOAD_KEY = 'ringupReloadedAt';
const RELOAD_REASON_KEY = 'ringupReloadReason';

const ENDED_RETRY_MS = 45000;

const STALL_LOG_MS = 30000;
const STATUS_LOG_MS = 60000;

const STUCK_RELOAD_MS = 60000;
const STUCK_MIN_RELOAD_INTERVAL_MS = 5 * 60000;
const RESUME_KEY = 'ringupResumeLive';
const RESUME_WINDOW_MS = 2 * 60000;
const START_LIVE_SELECTOR = '[data-testid="device-preview-list__start-live-views-button"]';

let endedSince = 0;
let endedRetryAt = 0;
let stuckSince = 0;
let reloadReason = null;
let resumeLiveUntil = 0;

function lastReloadAt() {
    try { return Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (_) { return 0; }
}

function secondsSince(ms) {
    return Math.round((Date.now() - ms) / 1000) + 's';
}

function isLiveViewOpen() {
    return !!document.querySelector('video, [data-testid="video-player-header"], ' + ERROR_MODAL_SELECTOR);
}

function takeResumeFlag() {
    try {
        if (sessionStorage.getItem(RESUME_KEY)) {
            sessionStorage.removeItem(RESUME_KEY);
            resumeLiveUntil = Date.now() + RESUME_WINDOW_MS;
        }
    } catch (_) {}
}

async function resumeLiveView() {
    if (!resumeLiveUntil || clicking) return;
    if (Date.now() > resumeLiveUntil || isLiveViewOpen()) {
        if (!isLiveViewOpen()) debugLog('Live view not restarted: no "start live views" button found after the reload');
        resumeLiveUntil = 0;
        return;
    }
    const button = document.querySelector(START_LIVE_SELECTOR);
    if (!button || !isVisible(button) || isDisabled(button)) return;
    resumeLiveUntil = 0;
    debugLog('Restarting live views after the Ringup reload');
    clicking = true;
    try {
        await clickElement(button);
    } finally {
        clicking = false;
    }
}

function reloadPage(reason) {
    reloadReason = reason;
    try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        sessionStorage.setItem(RELOAD_REASON_KEY, reason);
        if (isLiveViewOpen() || findUnreachableMessages().length) sessionStorage.setItem(RESUME_KEY, '1');
    } catch (_) {}
    debugLog('Reloading the page: ' + reason);
    bumpStat('reloads');
    flushLog();
    location.reload();
}

const ERROR_MODAL_SELECTOR = '[data-testid^="live-view__error-modal"]';
let lastErrorSummary = '';

function describeErrorModals() {
    return [...document.querySelectorAll(ERROR_MODAL_SELECTOR)].filter(isVisible).map(modal => {
        const kind = modal.getAttribute('data-testid').replace('live-view__error-modal__', '');
        const message = modal.querySelector('[data-testid="video-error__message"]');
        return kind + (message ? ' "' + norm(message.textContent).slice(0, 120) + '"' : '');
    });
}

function checkStuckErrors(now) {
    const playing = [...document.querySelectorAll('video')].some(v => !v.paused && !v.ended && v.readyState > 2);
    if (playing || findKnownButtons().length || findEndedReconnectButtons().length) {
        stuckSince = 0;
        return;
    }
    if (!stuckSince) {
        stuckSince = now;
        debugLog('Live view error with no Reconnect button: ' + findUnreachableMessages().map(el => '"' + norm(el.textContent).slice(0, 120) + '"').join(', '));
        return;
    }
    if (now - stuckSince < STUCK_RELOAD_MS) return;
    if (!settings.autoReload) {
        debugLogEvery('stuckNoReload', 60000, 'Live view stuck on an error for ' + secondsSince(stuckSince) + '; auto-reload is off');
        return;
    }
    const lastReload = lastReloadAt();
    if (now - lastReload < STUCK_MIN_RELOAD_INTERVAL_MS) {
        debugLogEvery('stuckReloadWait', 60000, 'Live view stuck on an error; reload skipped, last one was ' + secondsSince(lastReload) + ' ago');
        return;
    }
    reloadPage('live view stuck on an error with no Reconnect button for ' + secondsSince(stuckSince));
}

function checkEndedWatchdog() {
    const errors = describeErrorModals();
    const summary = errors.join(' | ');
    if (summary !== lastErrorSummary) {
        debugLog('Live view errors on screen: ' + (errors.length ? errors.length + ' [' + summary + ']' : 'none'));
        lastErrorSummary = summary;
    }
    if (!errors.length && !findEndedMessages().length && !findUnreachableMessages().length) {
        if (endedSince) debugLog('Live view error gone after ' + secondsSince(endedSince));
        endedSince = 0;
        stuckSince = 0;
        return;
    }
    const now = Date.now();
    if (!endedSince) {
        endedSince = now;
        endedRetryAt = 0;
        return;
    }
    checkStuckErrors(now);
    if (now - Math.max(endedSince, endedRetryAt) < ENDED_RETRY_MS) return;
    endedRetryAt = now;
    clickState = new WeakMap();
    debugLog('Live view error still shown after ' + secondsSince(endedSince) + '; retrying reconnect without waiting for the backoff');
}

const videoTimes = new WeakMap();
let watchedUrl = null;
let lastVideoProgressAt = 0;
let stallLogged = false;
let lastVideoCount = -1;

function checkVideoWatchdog() {
    let progressing = false;
    const videos = document.querySelectorAll('video');
    if (videos.length !== lastVideoCount) {
        debugLog('Video elements in page: ' + Math.max(lastVideoCount, 0) + ' -> ' + videos.length);
        lastVideoCount = videos.length;
    }
    for (const video of videos) {
        const t = video.currentTime;
        if (t > 0 && videoTimes.has(video) && videoTimes.get(video) !== t) progressing = true;
        videoTimes.set(video, t);
    }
    const now = Date.now();
    if (progressing) {
        if (stallLogged) debugLog('Video progress resumed after ' + secondsSince(lastVideoProgressAt));
        else if (watchedUrl !== location.href) debugLog('Video playing; reload watchdog armed for ' + location.href);
        stallLogged = false;
        watchedUrl = location.href;
        lastVideoProgressAt = now;
        return;
    }
    if (watchedUrl !== location.href) {
        if (watchedUrl) debugLog('Reload watchdog disarmed: URL changed from ' + watchedUrl + ' to ' + location.href);
        watchedUrl = null;
        return;
    }
    if (!stallLogged && now - lastVideoProgressAt >= STALL_LOG_MS) {
        stallLogged = true;
        debugLog('No video progress for ' + secondsSince(lastVideoProgressAt) + ' (' + videos.length + ' video element(s))');
    }
    if (now - lastVideoProgressAt < WATCHDOG_MS) return;
    if (!settings.autoReload) {
        debugLogEvery('videoNoReload', 60000, 'No live video for ' + secondsSince(lastVideoProgressAt) + '; auto-reload is off');
        return;
    }
    const lastReload = lastReloadAt();
    if (now - lastReload < MIN_RELOAD_INTERVAL_MS) {
        debugLogEvery('videoReloadWait', 60000, 'No live video; reload skipped, last one was ' + secondsSince(lastReload) + ' ago');
        return;
    }
    reloadPage('no live video for ' + (WATCHDOG_MS / 60000) + ' min');
}

let lastStatusLogAt = 0;

function logStatus() {
    const now = Date.now();
    if (now - lastStatusLogAt < STATUS_LOG_MS) return;
    lastStatusLogAt = now;
    const videos = [...document.querySelectorAll('video')];
    const lastReload = lastReloadAt();
    debugLog('Status: ' + JSON.stringify({
        url: location.href,
        videos: videos.length,
        playing: videos.filter(v => !v.paused && !v.ended && v.readyState > 2).length,
        lastProgress: lastVideoProgressAt ? secondsSince(lastVideoProgressAt) + ' ago' : 'never',
        watchdogArmed: watchedUrl === location.href,
        endedMessageFor: endedSince ? secondsSince(endedSince) : null,
        knownButtons: findKnownButtons().length,
        trustedClicks,
        autoReload: settings.autoReload,
        lastReload: lastReload ? secondsSince(lastReload) + ' ago' : 'never',
        hidden: document.hidden,
        online: navigator.onLine,
        memoryMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
    }));
}

function logPageStart() {
    const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    let reason = null;
    try {
        reason = sessionStorage.getItem(RELOAD_REASON_KEY);
        sessionStorage.removeItem(RELOAD_REASON_KEY);
    } catch (_) {}
    const lastReload = lastReloadAt();
    debugLog('Page start: ' + JSON.stringify({
        url: location.href,
        navigation: nav ? nav.type : 'unknown',
        wasDiscarded: !!document.wasDiscarded,
        referrer: document.referrer || null,
        reloadedByRingup: reason,
        lastRingupReload: lastReload ? new Date(lastReload).toLocaleTimeString() : null,
        hidden: document.hidden
    }));
}

function watchPageLifecycle() {
    window.addEventListener('pagehide', e => {
        debugLog('Page hide: ' + location.href + (e.persisted ? ' (kept in back/forward cache)' : '') +
            ' | ' + (reloadReason ? 'reload by Ringup: ' + reloadReason : 'not triggered by Ringup'));
        flushLog();
    });
    window.addEventListener('pageshow', e => {
        if (e.persisted) debugLog('Page restored from back/forward cache');
    });
    document.addEventListener('freeze', () => {
        debugLog('Page frozen by the browser');
        flushLog();
    });
    document.addEventListener('resume', () => debugLog('Page resumed after being frozen'));
    window.addEventListener('online', () => debugLog('Network online'));
    window.addEventListener('offline', () => debugLog('Network offline'));
    document.addEventListener('ringup-log', e => {
        if (typeof e.detail === 'string') debugLog('Page: ' + e.detail);
    });
    document.addEventListener('click', e => {
        if (!e.isTrusted || !(e.target instanceof Element)) return;
        const el = e.target.closest('button, a, [role="button"], [data-testid]') || e.target;
        debugLog('Click on page at ' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ': ' + JSON.stringify({
            tagName: el.tagName,
            testId: el.getAttribute('data-testid'),
            ariaLabel: el.getAttribute('aria-label'),
            text: norm(el.innerText || el.textContent).slice(0, 80),
            outerHTML: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 400)
        }));
    }, true);
}

const MEDIA_EVENTS = ['loadstart', 'loadeddata', 'playing', 'pause', 'ended', 'emptied', 'stalled', 'waiting', 'error', 'abort'];
const MEDIA_LOG_THROTTLE_MS = 10000;
const mediaLogTimes = new WeakMap();

function videoName(video) {
    const index = [...document.querySelectorAll('video')].indexOf(video);
    const root = playerRootOf(video);
    const header = root && root.querySelector('[data-testid="video-player-header"]');
    const name = header ? norm(header.textContent).slice(0, 40) : '';
    return '#' + index + (name ? ' "' + name + '"' : '');
}

function watchMedia() {
    for (const type of MEDIA_EVENTS) {
        document.addEventListener(type, e => {
            const video = e.target;
            if (!(video instanceof HTMLMediaElement)) return;
            const times = mediaLogTimes.get(video) || {};
            mediaLogTimes.set(video, times);
            const now = Date.now();
            if (type !== 'error' && now - (times[type] || 0) < MEDIA_LOG_THROTTLE_MS) return;
            times[type] = now;
            let detail = ' t=' + video.currentTime.toFixed(1) + ' readyState=' + video.readyState + ' networkState=' + video.networkState;
            if (type === 'error' && video.error) detail += ' error=' + video.error.code + ' ' + (video.error.message || '');
            debugLog('Video ' + type + ': ' + videoName(video) + detail);
        }, true);
    }
}

function inspectReconnectButton() {
    const el = findKnownButtons()[0] || findEndedReconnectButtons()[0] || findReconnectByText();
    if (!el) {
        console.log('[Ringup] Inspect: no Reconnect button found');
        return null;
    }
    const parentChain = [];
    let n = el;
    while (n && n !== document.body) {
        const root = n.getRootNode();
        const inShadow = root instanceof ShadowRoot;
        parentChain.push((inShadow ? '#shadow ' : '') + (n.tagName || '') + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(/\s+/).slice(0, 2).join('.') : ''));
        n = inShadow ? root.host : n.parentElement;
    }
    const rect = el.getBoundingClientRect();
    const info = {
        tagName: el.tagName,
        id: el.id || null,
        className: el.className,
        role: el.getAttribute && el.getAttribute('role'),
        ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
        innerText: (el.innerText || '').slice(0, 80),
        parentChain,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        inModal: isInsideReconnectModal(el)
    };
    console.log('[Ringup] Inspect:', info);
    return el;
}

let lastLoggedTarget = null;
function logClickTarget(el) {
    if (!settings.debug || el === lastLoggedTarget) return;
    lastLoggedTarget = el;
    const rect = el.getBoundingClientRect();
    const html = (el.outerHTML || '').replace(/\s+/g, ' ');
    const parent = el.parentElement ? (el.parentElement.outerHTML || '').replace(/\s+/g, ' ') : '';
    debugLog('Click target: ' + JSON.stringify({
        tagName: el.tagName,
        innerText: (el.innerText || '').slice(0, 80),
        ariaLabel: el.getAttribute('aria-label'),
        disabled: isDisabled(el),
        inModal: isInsideReconnectModal(el),
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        elementAtCenter: (document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) || {}).tagName || null,
        outerHTML: html.slice(0, 600),
        parentHTML: parent.slice(0, 1200)
    }));
}

function exposeManualTrigger() {
    try {
        window.ringupReconnect = async function () {
            const ok = await findAndClickReconnect();
            console.log('[Ringup] Manual trigger:', ok ? 'click made' : 'no Reconnect button to click');
            return ok;
        };
        window.ringupInspect = inspectReconnectButton;
    } catch (_) {}
}

function observeKnownButtons(onFound) {
    const selector = PAUSE_MODAL_SELECTOR + ', ' + CAMERA_RECONNECT_SELECTOR;
    let lastCheck = 0;
    let pending = null;
    const check = () => {
        pending = null;
        lastCheck = Date.now();
        if (document.querySelector(selector)) onFound();
    };
    new MutationObserver(() => {
        if (pending) return;
        const wait = OBSERVER_THROTTLE_MS - (Date.now() - lastCheck);
        if (wait <= 0) check();
        else pending = setTimeout(check, wait);
    }).observe(document.documentElement, { childList: true, subtree: true });
}

function initialize() {
    try {
        const notification = document.createElement('div');
        notification.className = 'ringup-notification';
        notification.title = 'Ringup - Reconnecting...';
        notification.innerHTML = `
            <svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="ringup-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#2196F3;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#90CAF9;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#2196F3;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <circle cx="15" cy="15" r="12" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="56 20"/>
            </svg>
        `;

        function insertNotification() {
            const header = document.querySelector('[data-testid="video-player-header"]');
            if (header) {
                const closeButton = header.querySelector('[class*="CloseButton"]') || header.querySelector('button');
                if (closeButton) {
                    closeButton.parentNode.insertBefore(notification, closeButton);
                    return true;
                }
                header.appendChild(notification);
                return true;
            }
            return false;
        }

        function showReconnectNotification() {
            notification.classList.add('show');
            setTimeout(() => notification.classList.remove('show'), 2000);
        }

        async function reconnect(useTextSearch) {
            if (await findAndClickReconnect(useTextSearch)) showReconnectNotification();
        }

        let pollTimer = null;

        function scheduleNextPoll() {
            if (pollTimer) clearTimeout(pollTimer);
            const interval = findKnownButtons().length || findEndedMessages().length ? POLL_FAST_MS : POLL_MS;
            pollTimer = setTimeout(() => {
                poll();
                scheduleNextPoll();
            }, interval);
        }

        function poll() {
            logScanState();
            resumeLiveView();
            reconnect(true);
            checkVideoWatchdog();
            checkEndedWatchdog();
            logStatus();
        }

        function completeInitialization() {
            if (!injectStyles()) {
                setTimeout(completeInitialization, 50);
                return;
            }
            if (document.body && !insertNotification()) {
                setTimeout(insertNotification, 1000);
            }
            watchDarkMode();
            detectTrustedClicks();
            observeKnownButtons(() => reconnect(false));
            poll();
            scheduleNextPoll();
            exposeManualTrigger();
            document.addEventListener('visibilitychange', () => {
                debugLog('Tab ' + (document.hidden ? 'hidden' : 'visible'));
            });
            debugLog('Initialization complete. Manual: ringupReconnect()');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', completeInitialization);
        } else {
            completeInitialization();
        }
    } catch (error) {
        console.error('[Ringup] Initialization error:', error);
    }
}

loadSettings();
takeResumeFlag();
logPageStart();
watchPageLifecycle();
watchMedia();
initialize();
