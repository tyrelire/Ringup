const DETACH_AFTER_MS = 3000;
const CLICK_TIMEOUT_MS = 10000;
const detachTimers = new Map();
let queue = Promise.resolve();

function call(fn, ...args) {
    return new Promise((resolve, reject) => {
        fn(...args, result => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(result);
        });
    });
}

async function attach(tabId) {
    const target = { tabId };
    if (detachTimers.has(tabId)) {
        clearTimeout(detachTimers.get(tabId));
    } else {
        try {
            await call(chrome.debugger.attach, target, '1.3');
        } catch (e) {
            if (!/already attached/i.test(e.message)) throw e;
        }
    }
    detachTimers.set(tabId, null);
    return target;
}

function scheduleDetach(tabId) {
    if (!detachTimers.has(tabId)) return;
    clearTimeout(detachTimers.get(tabId));
    detachTimers.set(tabId, setTimeout(() => {
        detachTimers.delete(tabId);
        chrome.debugger.detach({ tabId }, () => void chrome.runtime.lastError);
    }, DETACH_AFTER_MS));
}

chrome.debugger.onDetach.addListener(source => {
    clearTimeout(detachTimers.get(source.tabId));
    detachTimers.delete(source.tabId);
});

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out after ' + ms + ' ms')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function trustedClick(tabId, x, y) {
    const target = await attach(tabId);
    const send = params => call(chrome.debugger.sendCommand, target, 'Input.dispatchMouseEvent', params);
    const base = { x, y, button: 'left', clickCount: 1 };
    try {
        await withTimeout((async () => {
            await send({ type: 'mouseMoved', x, y });
            await send({ ...base, type: 'mousePressed', buttons: 1 });
            await send({ ...base, type: 'mouseReleased', buttons: 0 });
        })(), CLICK_TIMEOUT_MS);
    } finally {
        scheduleDetach(tabId);
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!sender.tab) return false;
    if (msg.type === 'ping') {
        sendResponse({ ok: true });
        return false;
    }
    if (msg.type !== 'trustedClick') return false;
    queue = queue
        .then(() => trustedClick(sender.tab.id, msg.x, msg.y))
        .then(() => sendResponse({ ok: true }), e => sendResponse({ ok: false, error: e.message }));
    return true;
});
