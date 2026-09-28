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

    console.log('[Ringup] Keep-alive active (tab always reported visible)');
})();
