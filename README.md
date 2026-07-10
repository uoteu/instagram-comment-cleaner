# Instagram Comment Cleaner

Local Chrome extension that deletes Instagram comments in configurable batches.

## Features

- Configurable batch size and interval between batches.
- Live countdown to the next batch in the popup.
- Works with both **Portuguese** and **English** Instagram UI (and easy to extend to more languages — see `TEXT` in `content.js`).
- Robust confirmation-modal handling with automatic fallback close (Escape / Cancel / click-outside).

## How to load

1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select this folder: `instagram-comment-cleaner`.

## How to use

1. Open `https://www.instagram.com/your_activity/interactions/comments`.
2. Log in if needed.
3. Click the extension icon to open the popup.
4. Adjust:
   - **Comments per batch** (default `12`);
   - **Interval between batches** in seconds (default `10`).
5. Click "Start".

While the extension is running, the popup shows a live countdown to the next batch.

Use a larger interval if Instagram starts throttling the page or showing errors.

## Adding more languages

If your Instagram UI is in another language, edit the `TEXT` object at the top of `content.js` and add the translated button labels to the appropriate arrays (`select`, `cancel`, `delete`, `deleteWithComment`, `toggleCheckbox`). The matcher normalizes text (lowercase, no accents) before comparing, so just add the lowercased, accent-free form of each label.
