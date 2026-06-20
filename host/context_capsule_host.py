#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import sys
import traceback
from typing import Any, BinaryIO, Dict, Optional

import clipboard
from formatter import build_markdown, format_timestamp, normalize_format_mode
from storage import (
    CaptureEntry,
    clear_entries,
    delete_entry,
    get_entry,
    history_summary,
    init_db,
    insert_entry,
    list_entries,
    set_pinned,
)


MAX_INCOMING_BYTES = 64 * 1024 * 1024


class ProtocolError(RuntimeError):
    """Raised when a native messaging packet is malformed."""


def main() -> int:
    init_db()
    while True:
        try:
            message = read_message(sys.stdin.buffer)
            if message is None:
                return 0
            response = handle_message(message)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            response = {"ok": False, "error": str(exc)}

        write_message(response, sys.stdout.buffer)


def handle_message(message: Dict[str, Any]) -> Dict[str, Any]:
    action = str(message.get("action") or "capture")
    if action == "capture":
        return capture_context(_dict_value(message.get("payload"), message))
    if action == "history":
        return history(message)
    if action == "summary":
        return summary()
    if action == "recopy":
        return recopy(message)
    if action == "delete":
        return delete_capture(message)
    if action == "clear":
        return clear_history()
    if action == "pin":
        return pin_capture(message)
    return {"ok": False, "error": f"Unknown action: {action}"}


def capture_context(payload: Dict[str, Any]) -> Dict[str, Any]:
    selection = str(payload.get("selection") or "")
    fallback_used = not bool(selection.strip())
    content = clipboard.read_text() if fallback_used else selection
    captured_at = format_timestamp(_optional_str(payload.get("timestamp")))
    format_mode = normalize_format_mode(str(payload.get("format_mode") or payload.get("format") or "markdown"))
    markdown = build_markdown(
        url=str(payload.get("url") or ""),
        title=str(payload.get("title") or "Untitled page"),
        body=content,
        captured_at=captured_at,
        format_mode=format_mode,
    )

    clipboard.write_text(markdown)
    entry_id = insert_entry(
        CaptureEntry(
            url=str(payload.get("url") or ""),
            title=str(payload.get("title") or "Untitled page"),
            content=content,
            markdown=markdown,
            captured_at=captured_at,
            fallback_used=fallback_used,
            format_mode=format_mode,
        )
    )
    return {
        "ok": True,
        "id": entry_id,
        "fallback_used": fallback_used,
        "captured_at": captured_at,
        "format_mode": format_mode,
        "title": str(payload.get("title") or "Untitled page"),
        "url": str(payload.get("url") or ""),
    }


def history(message: Dict[str, Any]) -> Dict[str, Any]:
    limit = _int_value(message.get("limit"), 20)
    return {"ok": True, "entries": list_entries(limit)}


def summary() -> Dict[str, Any]:
    return {"ok": True, "summary": history_summary()}


def recopy(message: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = _int_value(message.get("id"), 0)
    if entry_id <= 0:
        return {"ok": False, "error": "Missing capture id."}

    entry = get_entry(entry_id)
    if not entry:
        return {"ok": False, "error": f"Capture {entry_id} was not found."}

    clipboard.write_text(str(entry["markdown"]))
    return {"ok": True, "id": entry_id}


def delete_capture(message: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = _int_value(message.get("id"), 0)
    if entry_id <= 0:
        return {"ok": False, "error": "Missing capture id."}
    deleted = delete_entry(entry_id)
    if not deleted:
        return {"ok": False, "error": f"Capture {entry_id} was not found."}
    return {"ok": True, "id": entry_id}


def clear_history() -> Dict[str, Any]:
    deleted_count = clear_entries()
    return {"ok": True, "deleted": deleted_count}


def pin_capture(message: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = _int_value(message.get("id"), 0)
    if entry_id <= 0:
        return {"ok": False, "error": "Missing capture id."}
    pinned = bool(message.get("pinned"))
    updated = set_pinned(entry_id, pinned)
    if not updated:
        return {"ok": False, "error": f"Capture {entry_id} was not found."}
    return {"ok": True, "id": entry_id, "pinned": pinned}


def read_message(stream: BinaryIO) -> Optional[Dict[str, Any]]:
    raw_length = stream.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise ProtocolError("Incomplete native messaging length header.")

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length > MAX_INCOMING_BYTES:
        raise ProtocolError("Incoming native messaging payload is too large.")

    payload = _read_exact(stream, message_length)
    if payload is None:
        raise ProtocolError("Incomplete native messaging payload.")

    decoded = json.loads(payload.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ProtocolError("Native messaging payload must be a JSON object.")
    return decoded


def write_message(message: Dict[str, Any], stream: BinaryIO) -> None:
    encoded = json.dumps(message, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("<I", len(encoded)))
    stream.write(encoded)
    stream.flush()


def _read_exact(stream: BinaryIO, byte_count: int) -> Optional[bytes]:
    buffer = bytearray()
    while len(buffer) < byte_count:
        chunk = stream.read(byte_count - len(buffer))
        if not chunk:
            return None
        buffer.extend(chunk)
    return bytes(buffer)


def _dict_value(value: Any, fallback: Dict[str, Any]) -> Dict[str, Any]:
    return value if isinstance(value, dict) else fallback


def _int_value(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _optional_str(value: Any) -> Optional[str]:
    return str(value) if value is not None else None


if __name__ == "__main__":
    raise SystemExit(main())
