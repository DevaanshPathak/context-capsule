# Context Capsule Docs

This folder holds the practical docs needed to understand, demo, install, and debug Context Capsule.

## Start Here

- [Architecture](ARCHITECTURE.md): how the extension, native host, formatter, clipboard, and SQLite history fit together.
- [Install and Native Messaging](INSTALL_AND_NATIVE_MESSAGING.md): what `install.py` writes and how to verify registration.
- [Demo Checklist](DEMO_CHECKLIST.md): a reliable hackathon demo script and definition-of-done checks.
- [Troubleshooting](TROUBLESHOOTING.md): common native messaging, clipboard, hotkey, and popup issues.

## Current Scope

- Browser: Chromium-based browsers only, using Manifest V3.
- Host: Python native messaging process over stdio.
- Dependencies: `pyperclip` only; everything else is Python stdlib.
- Storage: local SQLite history at `data/history.sqlite3`.
- Formats: Markdown, Compact, and Prompt presets.

