# Troubleshooting

Use `python install.py --doctor` first. It gives the fastest signal for native host, clipboard, and registration problems.

## Native Host Not Found

Symptoms:

- Popup says the native host disconnected or cannot be found.
- Captures do not reach Python.

Fixes:

1. Run `python install.py`.
2. Run `python install.py --doctor`.
3. Restart the browser after registration.
4. Confirm the loaded unpacked extension is `context-capsule/extension`.
5. Confirm the extension ID in the browser is:

   ```text
   oaaidckgoilmkbkclbibiibofjdffkjo
   ```

## Hotkey Does Not Fire

Fixes:

1. Open the browser's extension keyboard shortcuts page.
2. Confirm `Capture page context` is assigned.
3. Try the popup's `Capture Current Page` button.
4. Check whether another extension or browser command already owns `Ctrl+Shift+C`.

## Selection Is Empty

Some pages block content scripts, and Chrome pages like `chrome://extensions` do not allow normal page scripts.

Fixes:

- Test on `http://localhost:8765/demo.html`.
- Try a normal web page instead of a browser settings page.
- If no selection is available, Context Capsule intentionally uses the current clipboard as fallback.

## Clipboard Fails

Windows and macOS usually work through `pyperclip` directly.

Linux needs a system helper:

```bash
sudo apt install xclip
# or
sudo apt install xsel
```

Then rerun:

```bash
python install.py --doctor
```

## History Looks Empty

Fixes:

1. Capture once from a normal page.
2. Open the popup and click Refresh.
3. Check that `data/history.sqlite3` exists after a successful capture.
4. If testing with `CONTEXT_CAPSULE_DB`, make sure it points to the database you expect.

## Format Looks Wrong

The popup remembers the last selected preset.

Available presets:

- Markdown
- Compact
- Prompt

Switch back to Markdown in the popup for the original blockquote format.

