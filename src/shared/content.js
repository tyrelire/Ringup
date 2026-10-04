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

function loadSettings() {
    const storage = extensionStorage();
    if (!storage) return;
    try {
        storage.get(SETTINGS_DEFAULTS, items => {
            void chrome.runtime.lastError;
            if (items) Object.assign(settings, items);
            updateDarkMode();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const key of Object.keys(SETTINGS_DEFAULTS)) {
                if (changes[key]) settings[key] = changes[key].newValue;
            }
            updateDarkMode();
        });
    } catch (_) {}
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
    if (settings.debug) console.log('[Ringup] ' + msg);
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
    let lastCheck = 0;
    let pending = null;
    const check = () => {
        pending = null;
        lastCheck = Date.now();
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
    console.log('[Ringup] Scan' + (changed ? ' (changed)' : ' (heartbeat)') + ':\n' + JSON.stringify({
        time: new Date().toLocaleTimeString(),
        tabHidden: document.hidden,
        knownButtons: known,
        textFallback: picked ? labelsOf(picked).join(' | ') : null,
        matches,
        dialogs: [...new Set(dialogs)]
    }, null, 2));
}

let trustedClicks = false;

function detectTrustedClicks() {
    try {
        chrome.runtime.sendMessage({ type: 'ping' }, response => {
            void chrome.runtime.lastError;
            trustedClicks = !!(response && response.ok);
            debugLog('Trusted clicks ' + (trustedClicks ? 'available' : 'unavailable (synthetic clicks only)'));
        });
    } catch (_) {}
}

function requestTrustedClick(el) {
    return new Promise(resolve => {
        const center = centerOf(el);
        if (!isInViewport(center) || !isOnTop(el)) {
            debugLog('Click skipped: button off screen or covered');
            resolve(false);
            return;
        }
        try {
            chrome.runtime.sendMessage({ type: 'trustedClick', x: center.x, y: center.y }, response => {
                void chrome.runtime.lastError;
                const ok = !!(response && response.ok);
                if (!ok) debugLog('Trusted click failed: ' + (response ? response.error : 'no answer'));
                resolve(ok);
            });
        } catch (e) {
            debugLog('Trusted click failed: ' + e.message);
            resolve(false);
        }
    });
}

async function clickElement(el) {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
    if (trustedClicks) return requestTrustedClick(el);
    const { x, y } = centerOf(el);
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
    if (!due.length) return false;

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

const ENDED_RELOAD_MS = 45000;
const MIN_ENDED_RELOAD_INTERVAL_MS = 3 * 60000;

let endedSince = 0;

function checkEndedWatchdog() {
    if (!findEndedMessages().length) {
        endedSince = 0;
        return;
    }
    const now = Date.now();
    if (!endedSince) {
        endedSince = now;
        debugLog('Live view ended message detected');
        return;
    }
    if (!settings.autoReload || now - endedSince < ENDED_RELOAD_MS) return;
    let lastReload = 0;
    try { lastReload = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (_) {}
    if (now - lastReload < MIN_ENDED_RELOAD_INTERVAL_MS) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (_) {}
    debugLog('Live view ended message still shown after ' + (ENDED_RELOAD_MS / 1000) + 's; reloading the page');
    bumpStat('reloads');
    location.reload();
}

const videoTimes = new WeakMap();
let watchedUrl = null;
let lastVideoProgressAt = 0;

function checkVideoWatchdog() {
    let progressing = false;
    for (const video of document.querySelectorAll('video')) {
        const t = video.currentTime;
        if (t > 0 && videoTimes.has(video) && videoTimes.get(video) !== t) progressing = true;
        videoTimes.set(video, t);
    }
    const now = Date.now();
    if (progressing) {
        watchedUrl = location.href;
        lastVideoProgressAt = now;
        return;
    }
    if (watchedUrl !== location.href) {
        watchedUrl = null;
        return;
    }
    if (!settings.autoReload || now - lastVideoProgressAt < WATCHDOG_MS) return;

    let lastReload = 0;
    try { lastReload = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (_) {}
    if (now - lastReload < MIN_RELOAD_INTERVAL_MS) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch (_) {}
    debugLog('No live video for ' + (WATCHDOG_MS / 60000) + ' min; reloading the page');
    bumpStat('reloads');
    location.reload();
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
    console.log('[Ringup] Click target:\n' + JSON.stringify({
        tagName: el.tagName,
        innerText: (el.innerText || '').slice(0, 80),
        ariaLabel: el.getAttribute('aria-label'),
        disabled: isDisabled(el),
        inModal: isInsideReconnectModal(el),
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        elementAtCenter: (document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) || {}).tagName || null,
        outerHTML: html.slice(0, 600),
        parentHTML: parent.slice(0, 1200)
    }, null, 2));
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
            reconnect(true);
            checkVideoWatchdog();
            checkEndedWatchdog();
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
                debugLog('Tab ' + (document.hidden ? 'hidden' : 'visible') + ' at ' + new Date().toLocaleTimeString());
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
initialize();
