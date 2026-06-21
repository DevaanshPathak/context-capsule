from __future__ import annotations

from typing import Any, Optional


class ClipboardAccessError(RuntimeError): # Custom error used when clipboard operations fail
    """Raised when the system clipboard cannot be read or written."""


try: # Try importing pyperclip, but allow the app to show a clear error if it is missing
    import pyperclip
except ImportError as import_error:  # pragma: no cover - exercised only without deps.
    pyperclip = None  # type: ignore[assignment]
    _IMPORT_ERROR: Optional[Exception] = import_error
else:
    _IMPORT_ERROR = None


def read_text() -> str: # Read text from system clipboard
    module = _require_pyperclip()
    try:
        return str(module.paste() or "")
    except Exception as exc:  # pyperclip raises platform-specific exceptions.
        raise ClipboardAccessError(f"Could not read clipboard: {exc}") from exc


def write_text(text: str) -> None: # Write text to the system clipboard
    module = _require_pyperclip()
    try:
        module.copy(text)
    except Exception as exc:
        raise ClipboardAccessError(f"Could not write clipboard: {exc}") from exc


def _require_pyperclip() -> Any: # Ensure pyperclip is available before any clipboard operation
    if pyperclip is None:
        raise ClipboardAccessError(
            "pyperclip is not installed. Run: python -m pip install -r requirements.txt"
        ) from _IMPORT_ERROR
    return pyperclip
