# Store Listing

## Name
Ringup - Ring Live View Auto-Reconnect

## Short description (132 characters max)
Keeps Ring Live View running: reconnects every camera as soon as Ring ends the stream, even in a background tab.

## Detailed description

Ring ends every Live View session after about 12 minutes. Ringup reconnects it for you, instantly, on every camera, so your cameras stay on screen around the clock.

FEATURES
• Instant reconnect: the Reconnect button of each camera is clicked the moment it appears
• Works in the background: Live View keeps playing when the tab is hidden or the window is minimized
• Auto-reload when stuck: if live video stopped for 5 minutes, the page is reloaded (can be turned off)
• Popup with a reconnect counter and settings
• No configuration: open account.ring.com, start Live View, done

PRIVACY
• Runs only on account.ring.com
• Collects nothing, sends nothing, no analytics
• No access to your Ring credentials, alarm, recordings or video

ABOUT THE "DEBUGGING" BAR
Ring ignores clicks made by scripts on its Reconnect buttons. To make a real click, Ringup uses the browser's debugger API for a few seconds. During that time, the browser shows a bar saying Ringup "started debugging this browser". This is expected and the bar closes on its own.

BATTERY WARNING
Continuous Live View drains the batteries of battery-powered Ring cameras quickly and can make them heat up. Use with care on battery devices.

Open source (MIT): https://github.com/tyrelire/Ringup
Privacy policy: https://github.com/tyrelire/Ringup/blob/main/privacy-policy.md

Ringup is an unofficial extension, not affiliated with or endorsed by Ring or Amazon.

## Permission justifications (Chrome Web Store)
- debugger: Ring's Reconnect buttons ignore script clicks. The debugger API is attached to the Ring tab only for a few seconds to dispatch one mouse click on the button, then detached. No data is read.
- storage: stores the extension's settings and reconnect counters locally.
- Host permission account.ring.com: the content script finds the Reconnect buttons on Ring's Live View page.
