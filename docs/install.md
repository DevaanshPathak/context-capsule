# Context Capsule v1.0.0 Install Guide

This guide is written for GitHub release users installing Context Capsule from a release zip or a cloned repository.

Context Capsule supports Chromium-based browsers only: Google Chrome, Microsoft Edge, and Brave. Firefox is not part of v1.0.0.

## What Gets Installed

Context Capsule has two pieces:

- A Chromium extension in `extension/`
- A local Python native messaging host in `host/`

`install.py` registers the Python host with your browser. It does not silently install the browser extension, because Chromium requires users to load unpacked extensions manually unless they are distributed through a browser store or enterprise policy.

After installation, capture is driven from the extension popup:

1. Select text on a web page, or leave nothing selected to use clipboard fallback.
2. Click the Context Capsule toolbar icon.
3. Click `Capture Current Page`.
4. Paste the generated markdown block into your AI chat or editor.

## Requirements

- Python 3.9 or newer
- A Chromium-based browser: Chrome, Edge, or Brave
- `pyperclip`, installed from `requirements.txt`
- Linux only: `xclip` or `xsel` for clipboard access

## Download

For a GitHub release:

1. Download the release source zip or tarball.
2. Extract it somewhere stable, such as:
   - Windows: `%LOCALAPPDATA%\ContextCapsule`
   - macOS: `~/Applications/context-capsule`
   - Linux: `~/.local/share/context-capsule`
3. Open a terminal in the extracted `context-capsule` folder.

Do not delete or move this folder after running `install.py`; the native messaging registration points to files inside it.

## Windows

Open PowerShell in the extracted project folder:

```powershell
python -m pip install -r requirements.txt
python install.py
python install.py --doctor
```

What `install.py` does on Windows:

- Writes `bin/context_capsule_host.cmd`
- Writes `native-hosts/com.context_capsule.host.json`
- Registers the native host under `HKCU` for Chrome, Edge, and Brave

Load the extension:

1. Open one of:
   - `chrome://extensions`
   - `edge://extensions`
   - `brave://extensions`
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select the `extension/` folder inside the extracted Context Capsule folder.
5. Pin the Context Capsule toolbar icon if you want quick access.

If `python` is not found, try:

```powershell
py -3 -m pip install -r requirements.txt
py -3 install.py
py -3 install.py --doctor
```

## macOS

Open Terminal in the extracted project folder:

```bash
python3 -m pip install -r requirements.txt
python3 install.py
python3 install.py --doctor
```

What `install.py` does on macOS:

- Writes `bin/context_capsule_host`
- Marks the host launcher executable
- Writes the native host manifest into the current user's browser config directory for Chrome, Edge, and Brave

Load the extension:

1. Open one of:
   - `chrome://extensions`
   - `edge://extensions`
   - `brave://extensions`
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select the `extension/` folder inside the extracted Context Capsule folder.
5. Pin the Context Capsule toolbar icon if you want quick access.

If macOS prompts about downloaded files, allow Terminal or your browser to access the extracted folder and rerun `python3 install.py --doctor`.

## Linux

Install a clipboard helper first:

```bash
sudo apt install xclip
# or
sudo apt install xsel
```

Then run from the extracted project folder:

```bash
python3 -m pip install -r requirements.txt
python3 install.py
python3 install.py --doctor
```

What `install.py` does on Linux:

- Writes `bin/context_capsule_host`
- Marks the host launcher executable
- Writes the native host manifest into the current user's browser config directory for Chrome, Edge, and Brave

Load the extension:

1. Open one of:
   - `chrome://extensions`
   - `edge://extensions`
   - `brave://extensions`
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select the `extension/` folder inside the extracted Context Capsule folder.
5. Pin the Context Capsule toolbar icon if you want quick access.

For non-Debian distributions, install the equivalent `xclip` or `xsel` package through your system package manager.

## Browser-Specific Install

By default, `install.py` registers all supported Chromium browsers. To register only one browser:

```bash
python install.py --browser chrome
python install.py --browser edge
python install.py --browser brave
```

Use `python3` instead of `python` on macOS or Linux if that is how Python is installed on your machine.

## Verify

Run:

```bash
python install.py --doctor
```

On macOS or Linux, use:

```bash
python3 install.py --doctor
```

Expected result:

- `Supported OS` is `PASS`
- `pyperclip dependency` is `PASS`
- `Clipboard access` is `PASS`
- `Host script launch` is `PASS`
- Native host manifest or browser registration checks are `PASS`

The stable extension ID for v1.0.0 is:

```text
oaaidckgoilmkbkclbibiibofjdffkjo
```

## Test Capture

Serve the demo page:

```bash
python -m http.server 8765
```

On macOS or Linux, use `python3` if needed:

```bash
python3 -m http.server 8765
```

Open:

```text
http://localhost:8765/demo.html
```

Then:

1. Click `Select sample text`.
2. Click the Context Capsule toolbar icon.
3. Click `Capture Current Page`.
4. Paste into a text editor.

You should see a markdown block with this page title, URL, timestamp, and selected text.

## Common Fixes

- If the popup says the host is missing, rerun `python install.py`, restart the browser, and reload the unpacked extension.
- If clipboard access fails on Linux, install `xclip` or `xsel`, then rerun `python install.py --doctor`.
- If history is empty, capture once from a normal `http://` or `https://` page, not a browser settings page.
- If you move the project folder, rerun `python install.py` from the new location.

## Updating

1. Download and extract the new release.
2. Run dependency install again:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. Run:
   ```bash
   python install.py
   python install.py --doctor
   ```
4. Reload the unpacked extension from the browser extensions page.

Use `python3` instead of `python` on macOS or Linux when needed.

## Uninstall

1. Remove the unpacked extension from `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
2. Delete the extracted Context Capsule folder.
3. Remove native messaging registration:
   - Windows: remove `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.context_capsule.host`, `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.context_capsule.host`, and `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.context_capsule.host`.
   - macOS: remove `com.context_capsule.host.json` from each browser's `NativeMessagingHosts` folder under `~/Library/Application Support/`.
   - Linux: remove `com.context_capsule.host.json` from each browser's `NativeMessagingHosts` folder under `~/.config/`.

History is stored in `data/history.sqlite3` inside the project folder, so deleting the folder removes local history.

## Release Maintainer Checklist

Before publishing a v1.0.0 GitHub release:

```bash
python -m unittest
python install.py --dry-run
python install.py --doctor
```

Also verify:

- `extension/manifest.json` version is `1.0.0`
- `packaging/windows/context-capsule.iss` `AppVersion` is `1.0.0`
- The release notes link to this file: `docs/install.md`
