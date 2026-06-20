# Install and Native Messaging

This project uses Chrome Native Messaging to bridge a Manifest V3 extension to a local Python process.

## Install Commands

From the project root:

```powershell
python -m pip install -r requirements.txt
python install.py
python install.py --doctor
```

Then load the unpacked extension folder:

```text
context-capsule/extension
```

## Extension ID

The extension manifest includes a stable `key`, so `install.py` can derive the extension ID without manual copy/paste.

Expected ID:

```text
oaaidckgoilmkbkclbibiibofjdffkjo
```

The native host manifest must include:

```json
"allowed_origins": ["chrome-extension://oaaidckgoilmkbkclbibiibofjdffkjo/"]
```

## Host Name

```text
com.context_capsule.host
```

The same name appears in:

- `extension/background.js`
- `install.py`
- the generated native host manifest

## Windows Registration

`install.py` creates:

```text
context-capsule/bin/context_capsule_host.cmd
context-capsule/native-hosts/com.context_capsule.host.json
```

It then writes per-user registry keys under `HKCU` for Chrome, Edge, and Brave:

```text
Software\Google\Chrome\NativeMessagingHosts\com.context_capsule.host
Software\Microsoft\Edge\NativeMessagingHosts\com.context_capsule.host
Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.context_capsule.host
```

Each registry value points to the generated native host manifest JSON.

## macOS and Linux Registration

`install.py` writes the native host manifest into the current user's browser config directory and marks the host launcher executable.

Linux clipboard note: `pyperclip` requires `xclip` or `xsel`.

## Doctor Checks

```powershell
python install.py --doctor
```

The doctor checks:

- supported OS
- derived extension ID
- `pyperclip`
- clipboard copy/paste round trip
- host script existence
- host launcher existence
- host launchability
- native host manifest validity
- browser registration

If the doctor reports missing launcher, manifest, or registry keys before installation, run `python install.py`.

