# Ringup

**Keeps Ring Live View running.** Ring ends every Live View session after about 12 minutes. Ringup clicks "Reconnect" on every camera as soon as that happens, even when the tab is in the background, so your cameras stay on screen around the clock.

Works on [account.ring.com](https://account.ring.com) in Chrome, Edge and other Chromium browsers.

> Ringup is an unofficial extension. It is not affiliated with or endorsed by Ring or Amazon.

## Features

- **Instant reconnect**: Reconnect buttons are clicked the moment they appear, on all cameras at once.
- **Works in the background**: the Ring tab keeps playing when it is hidden or the window is minimized.
- **Auto-reload when stuck**: if live video stopped for 5 minutes and did not come back (expired session, frozen page), the page is reloaded. At most once every 15 minutes, and never on a page where no video played.
- **Popup**: number of reconnects, time of the last one, page reloads, and switches for auto-reload and debug logs.
- **Private**: runs only on account.ring.com, collects nothing, sends nothing anywhere.

## Install

Ringup is not on the extension stores yet. To install it from source:

1. Download the latest `ringup-chrome.zip` or `ringup-edge.zip` from the [Releases](https://github.com/tyrelire/Ringup/releases) page and unzip it, or build it yourself (see [Development](#development)).
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Open [account.ring.com](https://account.ring.com) and start Live View.

## How it works

- Ring shows a "Live View has ended / Reconnect" button on each camera when it ends a session, and a "Continue Live View" modal when it pauses one. Ringup watches the page for these buttons (by Ring's `data-testid`, with a fallback on their label in about 15 languages) and clicks them.
- Ring ignores clicks made by scripts on these buttons. Ringup's background worker makes a real mouse click through the browser's `debugger` API. While it does, the browser shows a bar saying Ringup "started debugging this browser". This is expected: the bar closes a few seconds after the click, so it appears briefly about every 12 minutes.
- After a click, each button gets 10 seconds to reconnect before it is clicked again. A button that ignores 3 clicks is left alone for a minute.
- A small script makes the tab always look visible and active to Ring, so it does not pause Live View when you switch tabs.

## Permissions

| Permission | Why |
|---|---|
| Access to `account.ring.com` | Find and click the Reconnect buttons |
| `debugger` | Make a real click on those buttons, in the Ring tab only, for a few seconds at a time. Nothing is read through it |
| `storage` | Keep the popup's settings and counters, locally |

Ringup has no access to your Ring credentials, alarm, arm/disarm features, recordings or video.

## Limitations

- **Battery cameras**: continuous Live View drains batteries quickly and can make them heat up. Use Ringup with care on battery-powered devices.
- **Firefox**: Firefox has no equivalent of the `debugger` API, so Ringup cannot click the per-camera Reconnect buttons there. The Firefox build only closes the "Continue Live View" modal.
- **Ring changes**: if Ring redesigns its page, detection may need an update. Please [open an issue](https://github.com/tyrelire/Ringup/issues) with debug logs.

## Troubleshooting

1. Make sure you are on https://account.ring.com and the extension is enabled.
2. Reload the Ring page.
3. Turn on **Debug logs** in the popup, then open the Ring page's console (F12). Lines start with `[Ringup]`.
4. In that console, `await ringupReconnect()` clicks the Reconnect buttons by hand and `ringupInspect()` shows the button Ringup would click.

## Development

```
npm install
npm run build
```

`npm run build` produces `dist/chrome`, `dist/edge` and `dist/firefox` (unpacked folder and zip each), and copies the Chrome and Edge builds to `ext-chrome/` and `ext-edge/`. Load one of those folders unpacked, then reload the extension after each build.

| Script | What it does |
|---|---|
| `npm run build` | Build every browser |
| `npm run validate` | Check the manifests, icons and main script |
| `npm run lint` | Lint the Firefox build with web-ext |
| `npm run dev` | Build and run the Firefox build in a temporary profile |
| `npm run clean` | Remove build output |

```
src/
├── shared/
│   ├── content.js      Finds and clicks the Reconnect buttons, auto-reload
│   ├── popup.html/.js  Counters and settings
│   └── icons/          Source SVG icons
├── chrome/             Chrome and Edge
│   ├── background.js   Real clicks through the debugger API
│   ├── keepalive.js    Makes the tab always look visible to Ring
│   └── manifest.json
└── firefox/
    └── manifest.json
scripts/                Build, validation and icon scripts
```

## Privacy

See the [privacy policy](privacy-policy.md).

## License

[MIT](LICENSE)
