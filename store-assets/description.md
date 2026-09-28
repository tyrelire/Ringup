# Store Listing

## Name
Ringup - Always-On Live View for Ring

## Short description (132 characters max)
Your Ring cameras, live, nonstop. Ringup brings every feed back the second it drops, in any language, even in a hidden tab.

## Detailed description

Your cameras should stay live as long as you are watching. Ringup makes that happen.

Every few minutes, Ring stops the Live View and waits for you to press a button. Ringup presses it for you, on every camera, the instant it shows up. Leave account.ring.com open on a wall display, a spare monitor or a corner of your screen, and your feeds simply keep going.

WHAT MAKES RINGUP DIFFERENT

Speaks your language
Ringup recognises Ring's buttons by their internal identifiers first, so it does not depend on the text on screen. If Ring changes something, it falls back on the button label and understands it in English, French, Spanish, Portuguese, German, Italian, Dutch, Turkish, Czech, Polish, Hungarian, Chinese and Japanese. Your Ring account can be in any of these languages without changing a thing.

All cameras, all at once
Whether one feed drops or ten, each one is brought back on its own, as soon as it stops.

Both kinds of interruption
Ringup handles the "Live View has ended" message on each camera and the "Continue Live View?" pause window that covers the whole page.

Keeps running out of sight
Switch tabs, minimise the window, work on something else: Ring still thinks you are watching, so the video does not pause.

Recovers from a frozen page
If no live video has played for 5 minutes, because the session expired or the page got stuck, Ringup reloads it for you. It never does this more than once every 15 minutes, and you can switch it off in one click.

Polite by design
After each click, a camera gets time to reconnect before Ringup tries again. If a button keeps ignoring it, Ringup backs off for a minute instead of hammering Ring.

See what it is doing
The popup shows how many times your cameras were brought back, when it last happened and how many reloads were needed.

Nothing to set up
Install it, open account.ring.com, start Live View. That is all.

YOUR DATA STAYS YOURS
Ringup is only active on account.ring.com. It does not collect, store or transmit anything, has no analytics, and cannot see your Ring password, your alarm, your recordings or your video.

WHY YOU MAY SEE A "DEBUGGING" NOTICE
Ring's page refuses clicks that come from an extension. To press the button like a real mouse would, Ringup briefly uses Chrome's debugger interface on the Ring tab only. While it does, Chrome shows a notice that Ringup "started debugging this browser". It disappears by itself a few seconds later. Nothing is read or recorded.

A WORD ABOUT BATTERY CAMERAS
Watching a camera nonstop keeps its radio and sensor running. On battery-powered Ring devices this empties the battery much faster and can warm the camera up. Prefer wired cameras for round-the-clock viewing.

Privacy policy: https://github.com/tyrelire/Ringup/blob/main/privacy-policy.md

Ringup is an independent project. It is not made, endorsed or supported by Ring or Amazon.

## Single purpose (Chrome Web Store)
Ringup keeps Ring Live View running on account.ring.com: when Ring ends or pauses a camera's live stream, the extension automatically clicks Ring's own reconnect button so the video resumes without user action.

## Permission justifications (Chrome Web Store)
- debugger: Ring's Reconnect buttons ignore script clicks. The debugger API is attached to the Ring tab only for a few seconds to dispatch one mouse click on the button, then detached. No data is read.
- storage: stores the extension's settings and reconnect counters locally.
- Host permission account.ring.com: the content script finds the Reconnect buttons on Ring's Live View page.
