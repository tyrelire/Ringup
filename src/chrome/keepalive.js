(() => {
    const ACTIVITY_MS = 30000;

    const visible = {
        hidden: false,
        webkitHidden: false,
        visibilityState: 'visible',
        webkitVisibilityState: 'visible'
    };
    for (const [prop, value] of Object.entries(visible)) {
        try {
            Object.defineProperty(Document.prototype, prop, { configurable: true, get: () => value });
        } catch (_) { }
    }
    try {
        Document.prototype.hasFocus = () => true;
    } catch (_) { }

    setInterval(() => {
        for (const type of ['pointermove', 'mousemove']) {
            const EventType = type === 'pointermove' ? PointerEvent : MouseEvent;
            document.dispatchEvent(new EventType(type, { bubbles: true, clientX: 1, clientY: 1 }));
        }
    }, ACTIVITY_MS);

    let reporting = false;
    const report = msg => {
        if (reporting) return;
        reporting = true;
        try {
            document.dispatchEvent(new CustomEvent('ringup-log', { detail: String(msg).slice(0, 600) }));
        } catch (_) {
        } finally {
            reporting = false;
        }
    };

    const shortUrl = url => {
        try {
            const u = new URL(url, location.href);
            return (u.origin === location.origin ? '' : u.host) + u.pathname;
        } catch (_) {
            return String(url).split('?')[0];
        }
    };

    const describe = value => {
        if (value instanceof Error) return value.name + ': ' + value.message;
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    };

    const INTERESTING_URL = /auth|token|session|login|logout|oauth|sign/i;

    try {
        const originalFetch = window.fetch;
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || String(input);
            const method = (init && init.method) || (input && input.method) || 'GET';
            return originalFetch.apply(this, arguments).then(res => {
                if (res.status >= 400 || res.redirected || INTERESTING_URL.test(url)) {
                    report('fetch ' + method + ' ' + shortUrl(url) + ' -> ' + res.status +
                        (res.redirected ? ' redirected to ' + shortUrl(res.url) : ''));
                }
                return res;
            }, err => {
                if (!err || err.name !== 'AbortError') report('fetch ' + method + ' ' + shortUrl(url) + ' failed: ' + describe(err));
                throw err;
            });
        };
    } catch (_) { }

    try {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.addEventListener('loadend', () => {
                if (this.status >= 400 || this.status === 0 || INTERESTING_URL.test(url)) {
                    report('xhr ' + method + ' ' + shortUrl(url) + ' -> ' + this.status);
                }
            });
            return originalOpen.apply(this, arguments);
        };
    } catch (_) { }

    try {
        for (const name of ['pushState', 'replaceState']) {
            const original = history[name];
            history[name] = function (...args) {
                const url = args[2];
                if (url !== undefined && url !== null) report('history.' + name + ' -> ' + url);
                return original.apply(this, args);
            };
        }
        window.addEventListener('popstate', () => report('popstate -> ' + location.href));
    } catch (_) { }

    try {
        if (window.navigation) {
            window.navigation.addEventListener('navigate', e => {
                report('navigate (' + e.navigationType + (e.userInitiated ? ', by user' : '') + ') -> ' + e.destination.url);
            });
        }
    } catch (_) { }

    try {
        for (const level of ['error', 'warn']) {
            const original = console[level];
            console[level] = function (...args) {
                report('console.' + level + ': ' + args.map(describe).join(' '));
                return original.apply(this, args);
            };
        }
    } catch (_) { }

    window.addEventListener('error', e => {
        report('uncaught error: ' + (e.message || describe(e.error)) + (e.filename ? ' at ' + shortUrl(e.filename) + ':' + e.lineno : ''));
    });
    window.addEventListener('unhandledrejection', e => report('unhandled rejection: ' + describe(e.reason)));
    window.addEventListener('beforeunload', () => report('beforeunload at ' + location.href));

    console.log('[Ringup] Keep-alive active (tab always reported visible)');
})();
