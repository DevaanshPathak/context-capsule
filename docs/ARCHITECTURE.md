# Architecture

Context Capsule is intentionally split so the browser extension stays thin and the Python host owns the durable behavior.

## Runtime Flow

1. The user presses `Ctrl+Shift+C` or clicks `Capture Current Page` in the popup.
2. `extension/background.js` finds the active tab and asks `extension/content.js` for selection, visible text, and readable page text.
3. The background service worker opens the Python host with `chrome.runtime.connectNative`.
4. `host/context_capsule_host.py` receives a length-prefixed JSON message.
5. The host falls back to the current clipboard if the page selection is empty.
6. `host/formatter.py` builds the requested output preset.
7. `host/clipboard.py` copies the final text to the system clipboard.
8. `host/storage.py` saves the capture in SQLite history.
9. The popup reads history through the same native host and can re-copy, pin, delete, or clear entries.

## Boundaries

- `extension/` contains browser-only code: active tab lookup, selection collection, popup UI, and native host calls.
- `host/` contains core logic: protocol loop, formatting, clipboard access, and SQLite storage.
- `install.py` is the only place with OS-specific native host registration logic.
- `demo.html` is a local manual test page and is not required at runtime.

## Native Messaging Contract

Every native messaging packet uses Chrome's required framing:

```text
4-byte little-endian unsigned length
UTF-8 JSON payload
```

Main actions:

- `capture`: format and store a new capture.
- `history`: return recent history entries.
- `summary`: return total, pinned, fallback, format, and latest-source counts for the popup dashboard.
- `recopy`: copy a saved markdown block back to the clipboard.
- `pin`: pin or unpin a history entry.
- `delete`: remove one history entry.
- `clear`: remove all history entries.

## Data Model

SQLite table: `captures`

Important fields:

- `url`, `title`, `content`, `markdown`
- `captured_at`
- `fallback_used`
- `format_mode`
- `capture_mode`
- `pinned`

Pinned entries float to the top and are protected from automatic pruning. The popup's explicit Clear action removes all entries.
