# Windows Packaging Prototype

This folder is a prototype path for turning Context Capsule into a Windows installer.

Important browser policy note: normal Chrome, Edge, and Brave installs do not allow a local installer to silently install and enable an unpacked extension for consumer users. The installer can install the native host and open the extension setup flow, but users still load/install the browser extension themselves unless the device is enterprise-managed or the extension is published through a browser store.

## Build Host EXE

From the repository root:

```powershell
python -m pip install pyinstaller pyperclip
pyinstaller --onefile --name context_capsule_host --paths host host/context_capsule_host.py
```

Expected output:

```text
dist/context_capsule_host.exe
```

## Build Installer

Install Inno Setup, then compile:

```powershell
iscc packaging/windows/context-capsule.iss
```

The prototype installer:

- installs the compiled host EXE
- installs the extension folder for unpacked loading
- writes the Chrome Native Messaging host manifest
- registers Chrome, Edge, and Brave native messaging registry keys under `HKCU`
- opens the installed extension folder at the end

## Post-Install User Step

The user still needs to load or install the extension:

1. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the installed `extension` folder.

For public distribution, publish the extension to browser stores and keep the installer focused on the native host.

