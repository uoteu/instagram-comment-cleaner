# Instagram Comment Deleter: delete all your comments made

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
   - **Comments per batch** (default `8`);
   - **Interval between batches** in seconds (default `3`).
5. Click "Start".

While the extension is running, the popup shows a live countdown to the next batch.

## Tuning for stability

The defaults are intentionally conservative, but Instagram can still throttle the page or return errors when you delete a lot of comments in a short time. If that happens:

- **First**, reduce **Comments per batch** — this is the setting that affects the page the most. Each batch does a full select-all → delete → confirm cycle on the page, so smaller batches are more reliable.
- **Then**, if you still see errors, **increase** **Interval between batches** to give Instagram more breathing room (and reduce the risk of temporary account restrictions).

Anecdotal reference values that have worked for the project author:

| Comments per batch | Interval (s) | Notes |
| --- | --- | --- |
| `12` | `3` | ❌ Unstable — sometimes fails to select / confirm |
| `8`  | `3` | ✅ Default — works most of the time |
| `4`  | `3` | ✅ Safest — what the author currently uses |

Start with the defaults, and only push batch size up if your account tolerates it.

## Adding more languages

If your Instagram UI is in another language, edit the `TEXT` object at the top of `content.js` and add the translated button labels to the appropriate arrays (`select`, `cancel`, `delete`, `deleteWithComment`, `toggleCheckbox`). The matcher normalizes text (lowercase, no accents) before comparing, so just add the lowercased, accent-free form of each label.
