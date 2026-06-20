# Demo Checklist

Use this checklist for a reliable hackathon demo.

## One-Time Setup

1. Install Python dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. Register native messaging:

   ```powershell
   python install.py
   ```

3. Verify setup:

   ```powershell
   python install.py --doctor
   ```

4. Load `extension/` as an unpacked extension in Chrome, Edge, or Brave.

## Controlled Demo Page

Run:

```powershell
python -m http.server 8765
```

Open:

```text
http://localhost:8765/demo.html
```

Using localhost avoids Chrome's file URL extension restrictions.

## Main Demo Script

1. Select part of the sample paragraph on `demo.html`.
2. Press `Ctrl+Shift+C`.
3. Paste into a text editor or LLM chat.
4. Confirm the pasted output includes source title, URL, timestamp, and selected text.
5. Clear the selection.
6. Copy a short fallback phrase manually.
7. Press `Ctrl+Shift+C` again.
8. Paste and confirm the fallback phrase appears in the formatted block.
9. Open the popup with `Ctrl+Shift+H` or the toolbar icon.
10. Confirm the popup shows total, pinned, fallback counts, last status, search, filters, and recent captures.
11. Re-copy an older entry and paste it.
12. Search history, filter pinned/fallback captures, and open a saved source URL.
13. Pin, unpin, delete, and clear history entries.
14. Switch between Markdown, Compact, and Prompt formats and capture once per preset.
15. Switch between Smart, Selection, Clipboard, Page only, Visible text, and Readable text capture modes.

## Expected Output

Default Markdown format:

```markdown
> Source: [Context Capsule Demo Page](http://localhost:8765/demo.html)
> Captured: 2026-06-20 14:32

Selected text from the page.
```

## Demo Talking Points

- One hotkey replaces selecting, copying, switching apps, pasting, grabbing the URL, and cleanup.
- Clipboard fallback means a capture still works when nothing is selected.
- Local history means a capture is not lost if the clipboard changes before paste.
- The browser extension is only a shim; Python owns formatting, clipboard, and storage.
