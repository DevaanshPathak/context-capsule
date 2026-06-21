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

1. Click `Select sample text` on `demo.html`, or manually select part of the sample paragraph.
2. Click the extension icon, then click `Capture Current Page`.
3. Paste into a text editor or LLM chat.
4. Confirm the pasted output includes source title, URL, timestamp, and selected text.
5. Clear the selection.
6. Copy a short fallback phrase manually.
7. Click `Capture Current Page` again.
8. Paste and confirm the fallback phrase appears in the formatted block.
9. Reopen the popup with the toolbar icon.
10. Confirm the popup shows total, pinned, fallback counts, last status, search, filters, and recent captures.
11. Re-copy an older entry and paste it.
12. Search history, filter pinned/fallback captures, and open a saved source URL.
13. Start a capsule, append two pages, copy the capsule, and paste it into an editor.
14. Pin, unpin, delete, and clear history entries.
15. Switch between Markdown, Compact, and Prompt formats and capture once per preset.
16. Switch between Smart, Selection, Clipboard, Page only, Visible text, and Readable text capture modes.
17. Switch between None, Summarize, Debug, Explain docs, and Notes templates.
18. Open Settings, change defaults, close and reopen the popup, and verify the saved defaults are applied.
19. Add a project/tag, capture a page, and filter history by that label.
20. Export visible history, all history, and active capsule in Markdown and JSON.

## Expected Output

Default Markdown format:

```markdown
> Source: [Context Capsule Demo Page](http://localhost:8765/demo.html)
> Captured: 2026-06-20 14:32

Selected text from the page.
```

## Demo Talking Points

- One popup click replaces selecting, copying, switching apps, pasting, grabbing the URL, and cleanup.
- Clipboard fallback means a capture still works when nothing is selected.
- Local history means a capture is not lost if the clipboard changes before paste.
- Capsules collect multiple sources into one AI-ready prompt.
- The browser extension is only a shim; Python owns formatting, clipboard, and storage.
