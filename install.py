#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
import platform
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


HOST_NAME = "com.context_capsule.host"
PROJECT_ROOT = Path(__file__).resolve().parent
EXTENSION_MANIFEST = PROJECT_ROOT / "extension" / "manifest.json"
HOST_SCRIPT = PROJECT_ROOT / "host" / "context_capsule_host.py"
HOST_MANIFEST_DIR = PROJECT_ROOT / "native-hosts"
HOST_MANIFEST_FILE = f"{HOST_NAME}.json"


@dataclass(frozen=True)
class BrowserTarget:
    name: str
    manifest_dir: Optional[Path] = None
    registry_subkey: Optional[str] = None


@dataclass(frozen=True)
class DoctorCheck:
    name: str
    ok: bool
    detail: str


def main() -> int:
    args = parse_args()
    system = platform.system()
    extension_id = args.extension_id or derive_extension_id(EXTENSION_MANIFEST)
    validate_extension_id(extension_id)

    if args.doctor:
        return run_doctor(system, extension_id, args.browser)

    launcher_path = launcher_for(system)
    manifest = native_host_manifest(extension_id, launcher_path)
    targets = selected_targets(system, args.browser)

    print("Context Capsule native host installer")
    print(f"Host name: {HOST_NAME}")
    print(f"Extension ID: {extension_id}")
    print(f"Host launcher: {launcher_path}")

    if args.dry_run:
        print("Dry run only; no files or registry keys will be changed.")
    else:
        write_launcher(system, launcher_path)

    if system == "Windows":
        install_windows(manifest, targets, args.dry_run)
    elif system in {"Darwin", "Linux"}:
        install_unix(manifest, targets, args.dry_run)
    else:
        raise SystemExit(f"Unsupported OS: {system}")

    print("Done.")
    print(f"Load this unpacked extension folder: {PROJECT_ROOT / 'extension'}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register the Context Capsule native messaging host.")
    parser.add_argument(
        "--browser",
        choices=["all", "chrome", "edge", "brave"],
        default="all",
        help="Browser registration target. Defaults to all supported Chromium browsers.",
    )
    parser.add_argument(
        "--extension-id",
        help="Override the extension ID. By default it is derived from extension/manifest.json key.",
    )
    parser.add_argument("--doctor", action="store_true", help="Check native messaging, clipboard, and host setup.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without changing files.")
    return parser.parse_args()


def derive_extension_id(manifest_path: Path) -> str:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    public_key = str(manifest.get("key") or "").strip()
    if not public_key:
        raise SystemExit("extension/manifest.json must include a key or --extension-id must be provided.")

    digest = hashlib.sha256(base64.b64decode(public_key)).hexdigest()[:32]
    return "".join(chr(ord("a") + int(char, 16)) for char in digest)


def validate_extension_id(extension_id: str) -> None:
    if len(extension_id) != 32 or any(char < "a" or char > "p" for char in extension_id):
        raise SystemExit(f"Invalid Chromium extension ID: {extension_id}")


def native_host_manifest(extension_id: str, launcher_path: Path) -> Dict[str, Any]:
    return {
        "name": HOST_NAME,
        "description": "Context Capsule native messaging host",
        "path": str(launcher_path),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }


def launcher_for(system: str) -> Path:
    suffix = ".cmd" if system == "Windows" else ""
    return PROJECT_ROOT / "bin" / f"context_capsule_host{suffix}"


def write_launcher(system: str, launcher_path: Path) -> None:
    launcher_path.parent.mkdir(parents=True, exist_ok=True)
    if system == "Windows":
        content = f'@echo off\r\n"{sys.executable}" -u "{HOST_SCRIPT}" %*\r\n'
    else:
        content = f'#!/bin/sh\nexec "{sys.executable}" -u "{HOST_SCRIPT}" "$@"\n'

    write_text_if_changed(launcher_path, content)
    if system != "Windows":
        chmod_executable(launcher_path)
        chmod_executable(HOST_SCRIPT)


def selected_targets(system: str, browser: str) -> List[BrowserTarget]:
    targets = browser_targets(system)
    if browser == "all":
        return list(targets.values())
    return [targets[browser]]


def browser_targets(system: str) -> Dict[str, BrowserTarget]:
    if system == "Windows":
        return {
            "chrome": BrowserTarget(
                "Google Chrome",
                registry_subkey=rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}",
            ),
            "edge": BrowserTarget(
                "Microsoft Edge",
                registry_subkey=rf"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}",
            ),
            "brave": BrowserTarget(
                "Brave",
                registry_subkey=rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}",
            ),
        }

    home = Path.home()
    if system == "Darwin":
        return {
            "chrome": BrowserTarget(
                "Google Chrome",
                home / "Library/Application Support/Google/Chrome/NativeMessagingHosts",
            ),
            "edge": BrowserTarget(
                "Microsoft Edge",
                home / "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
            ),
            "brave": BrowserTarget(
                "Brave",
                home / "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
            ),
        }

    if system == "Linux":
        return {
            "chrome": BrowserTarget(
                "Google Chrome",
                home / ".config/google-chrome/NativeMessagingHosts",
            ),
            "edge": BrowserTarget(
                "Microsoft Edge",
                home / ".config/microsoft-edge/NativeMessagingHosts",
            ),
            "brave": BrowserTarget(
                "Brave",
                home / ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
            ),
        }

    raise SystemExit(f"Unsupported OS: {system}")


def install_windows(manifest: Dict[str, Any], targets: Iterable[BrowserTarget], dry_run: bool) -> None:
    manifest_path = HOST_MANIFEST_DIR / HOST_MANIFEST_FILE
    if dry_run:
        print(f"Would write host manifest: {manifest_path}")
    else:
        HOST_MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
        write_json_if_changed(manifest_path, manifest)

    for target in targets:
        if not target.registry_subkey:
            continue
        if dry_run:
            print(f"Would set HKCU\\{target.registry_subkey} -> {manifest_path}")
        else:
            set_windows_registry_value(target.registry_subkey, manifest_path)
            print(f"Registered {target.name}: HKCU\\{target.registry_subkey}")


def install_unix(manifest: Dict[str, Any], targets: Iterable[BrowserTarget], dry_run: bool) -> None:
    for target in targets:
        if not target.manifest_dir:
            continue
        manifest_path = target.manifest_dir / HOST_MANIFEST_FILE
        if dry_run:
            print(f"Would write {target.name} host manifest: {manifest_path}")
            continue
        target.manifest_dir.mkdir(parents=True, exist_ok=True)
        write_json_if_changed(manifest_path, manifest)
        print(f"Registered {target.name}: {manifest_path}")


def run_doctor(system: str, extension_id: str, browser: str) -> int:
    launcher_path = launcher_for(system)
    targets = selected_targets(system, browser)
    checks: List[DoctorCheck] = [
        DoctorCheck("Supported OS", system in {"Windows", "Darwin", "Linux"}, system),
        DoctorCheck("Extension ID", True, extension_id),
        DoctorCheck("pyperclip dependency", importlib.util.find_spec("pyperclip") is not None, "required by clipboard.py"),
        clipboard_doctor_check(),
        DoctorCheck("Host script", HOST_SCRIPT.exists(), str(HOST_SCRIPT)),
        DoctorCheck("Host launcher", launcher_path.exists(), str(launcher_path)),
        host_launch_check([sys.executable, "-u", str(HOST_SCRIPT)], "Host script launch"),
    ]

    if launcher_path.exists():
        checks.append(launcher_launch_check(system, launcher_path))

    checks.extend(registration_checks(system, extension_id, targets))

    print("Context Capsule doctor")
    for check in checks:
        marker = "PASS" if check.ok else "FAIL"
        print(f"[{marker}] {check.name}: {check.detail}")

    if all(check.ok for check in checks):
        print("Doctor passed.")
        return 0

    print("Doctor found issues. Run python install.py after fixing failed checks.")
    return 1


def clipboard_doctor_check() -> DoctorCheck:
    if importlib.util.find_spec("pyperclip") is None:
        return DoctorCheck("Clipboard access", False, "pyperclip is not installed")

    import pyperclip

    token = "context-capsule-doctor"
    original = ""
    try:
        original = str(pyperclip.paste() or "")
        pyperclip.copy(token)
        copied = str(pyperclip.paste() or "")
    except Exception as exc:
        return DoctorCheck("Clipboard access", False, str(exc))
    finally:
        try:
            pyperclip.copy(original)
        except Exception:
            pass

    return DoctorCheck("Clipboard access", copied == token, "copy/paste round trip")


def host_launch_check(command: List[str], name: str) -> DoctorCheck:
    with tempfile.TemporaryDirectory(prefix="context-capsule-doctor-") as temp_dir:
        env = host_launch_env(Path(temp_dir))
        try:
            completed = subprocess.run(
                command,
                input=b"",
                capture_output=True,
                timeout=5,
                check=False,
                env=env,
            )
        except Exception as exc:
            return DoctorCheck(name, False, str(exc))

    detail = f"exit {completed.returncode}"
    if completed.stderr:
        detail = f"{detail}; stderr: {completed.stderr.decode(errors='replace').strip()}"
    return DoctorCheck(name, completed.returncode == 0, detail)


def launcher_launch_check(system: str, launcher_path: Path) -> DoctorCheck:
    if system == "Windows":
        with tempfile.TemporaryDirectory(prefix="context-capsule-doctor-") as temp_dir:
            env = host_launch_env(Path(temp_dir))
            try:
                completed = subprocess.run(
                    str(launcher_path),
                    input=b"",
                    capture_output=True,
                    timeout=5,
                    shell=True,
                    check=False,
                    env=env,
                )
            except Exception as exc:
                return DoctorCheck("Host launcher launch", False, str(exc))
        detail = f"exit {completed.returncode}"
        if completed.stderr:
            detail = f"{detail}; stderr: {completed.stderr.decode(errors='replace').strip()}"
        return DoctorCheck("Host launcher launch", completed.returncode == 0, detail)

    return host_launch_check([str(launcher_path)], "Host launcher launch")


def host_launch_env(temp_dir: Path) -> Dict[str, str]:
    env = dict(os.environ)
    env["CONTEXT_CAPSULE_DB"] = str(temp_dir / "doctor.sqlite3")
    return env


def registration_checks(system: str, extension_id: str, targets: Iterable[BrowserTarget]) -> List[DoctorCheck]:
    if system == "Windows":
        return windows_registration_checks(extension_id, targets)
    return unix_registration_checks(extension_id, targets)


def windows_registration_checks(extension_id: str, targets: Iterable[BrowserTarget]) -> List[DoctorCheck]:
    manifest_path = HOST_MANIFEST_DIR / HOST_MANIFEST_FILE
    checks = [manifest_file_check(manifest_path, extension_id)]
    for target in targets:
        if not target.registry_subkey:
            continue
        value, error = get_windows_registry_value(target.registry_subkey)
        ok = value == str(manifest_path)
        detail = value or error or f"expected {manifest_path}"
        checks.append(DoctorCheck(f"{target.name} registry", ok, detail))
    return checks


def unix_registration_checks(extension_id: str, targets: Iterable[BrowserTarget]) -> List[DoctorCheck]:
    checks: List[DoctorCheck] = []
    for target in targets:
        if target.manifest_dir:
            checks.append(manifest_file_check(target.manifest_dir / HOST_MANIFEST_FILE, extension_id, target.name))
    return checks


def manifest_file_check(path: Path, extension_id: str, label: str = "Native host manifest") -> DoctorCheck:
    if not path.exists():
        return DoctorCheck(label, False, f"missing: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return DoctorCheck(label, False, f"invalid JSON: {exc}")

    ok, detail = validate_native_manifest(data, extension_id)
    return DoctorCheck(label, ok, f"{path}; {detail}")


def validate_native_manifest(data: Dict[str, Any], extension_id: str) -> Tuple[bool, str]:
    expected_origin = f"chrome-extension://{extension_id}/"
    if data.get("name") != HOST_NAME:
        return False, "wrong host name"
    if data.get("type") != "stdio":
        return False, "type must be stdio"
    if expected_origin not in list(data.get("allowed_origins") or []):
        return False, "extension ID is not in allowed_origins"

    path = Path(str(data.get("path") or ""))
    if not path.exists():
        return False, f"host path missing: {path}"

    return True, "valid"


def set_windows_registry_value(subkey: str, manifest_path: Path) -> None:
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, subkey) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))


def get_windows_registry_value(subkey: str) -> Tuple[str, str]:
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            value, _value_type = winreg.QueryValueEx(key, "")
            return str(value), ""
    except FileNotFoundError:
        return "", "missing registry key"
    except OSError as exc:
        return "", str(exc)


def write_json_if_changed(path: Path, data: Dict[str, Any]) -> None:
    content = json.dumps(data, indent=2, sort_keys=True) + "\n"
    write_text_if_changed(path, content)


def write_text_if_changed(path: Path, content: str) -> None:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return
    path.write_text(content, encoding="utf-8")


def chmod_executable(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


if __name__ == "__main__":
    raise SystemExit(main())
