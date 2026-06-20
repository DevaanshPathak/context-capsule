#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import sys
import traceback
from typing import Any, BinaryIO, Dict, Optional

import clipboard
from formatter import (
    build_markdown,
    format_timestamp,
    normalize_capture_mode,
    normalize_format_mode,
    normalize_template_id,
    normalize_timestamp_style,
)
from storage import (
    CaptureEntry,
    append_entry_to_active_capsule,
    append_existing_capture_to_active_capsule,
    capsule_markdown,
    clear_active_capsule,
    clear_entries,
    delete_entry,
    get_active_capsule,
    get_entries_by_ids,
    get_entry,
    history_summary,
    init_db,
    insert_entry,
    list_diagnostics,
    list_entries_for_export,
    list_entries,
    log_diagnostic,
    set_pinned,
    start_capsule,
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
            trace = traceback.format_exc()
            print(trace, file=sys.stderr)
            _safe_log("error", str(exc), trace)
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
    if action == "capsule_start":
        return capsule_start(message)
    if action == "capsule_append":
        return capsule_append(message)
    if action == "capsule_copy":
        return capsule_copy()
    if action == "capsule_clear":
        return capsule_clear()
    if action == "capsule_status":
        return capsule_status()
    if action == "export":
        return export_context(message)
    if action == "diagnostics":
        return diagnostics(message)
    return {"ok": False, "error": f"Unknown action: {action}"}


def capture_context(payload: Dict[str, Any]) -> Dict[str, Any]:
    selection = str(payload.get("selection") or "")
    capture_mode = normalize_capture_mode(str(payload.get("capture_mode") or "smart"))
    content, fallback_used = _content_for_capture_mode(capture_mode, payload, selection)
    raw_timestamp = _optional_str(payload.get("timestamp"))
    timestamp_style = normalize_timestamp_style(str(payload.get("timestamp_style") or "local"))
    captured_at = format_timestamp(raw_timestamp, timestamp_style)
    format_mode = normalize_format_mode(str(payload.get("format_mode") or payload.get("format") or "markdown"))
    template_id = normalize_template_id(str(payload.get("template_id") or "none"))
    project = _clean_label(payload.get("project"))
    tag = _clean_label(payload.get("tag"))
    markdown = build_markdown(
        url=str(payload.get("url") or ""),
        title=str(payload.get("title") or "Untitled page"),
        body=content,
        captured_at=raw_timestamp,
        format_mode=format_mode,
        template_id=template_id,
        timestamp_style=timestamp_style,
    )

    clipboard.write_text(markdown)
    entry = CaptureEntry(
        url=str(payload.get("url") or ""),
        title=str(payload.get("title") or "Untitled page"),
        content=content,
        markdown=markdown,
        captured_at=captured_at,
        fallback_used=fallback_used,
        format_mode=format_mode,
        capture_mode=capture_mode,
        template_id=template_id,
        timestamp_style=timestamp_style,
        project=project,
        tag=tag,
    )
    entry_id = insert_entry(entry)
    auto_pinned = bool(payload.get("auto_pin_fallback")) and fallback_used
    if auto_pinned:
        set_pinned(entry_id, True)
    capsule = append_entry_to_active_capsule(entry_id, entry) if bool(payload.get("append_to_capsule")) else None
    _safe_log("info", "capture", f"{entry.title} | {capture_mode} | {format_mode} | {template_id}")
    return {
        "ok": True,
        "id": entry_id,
        "fallback_used": fallback_used,
        "captured_at": captured_at,
        "format_mode": format_mode,
        "capture_mode": capture_mode,
        "template_id": template_id,
        "timestamp_style": timestamp_style,
        "pinned": auto_pinned,
        "project": project,
        "tag": tag,
        "title": str(payload.get("title") or "Untitled page"),
        "url": str(payload.get("url") or ""),
        "capsule": _capsule_summary(capsule) if capsule else None,
    }


def _content_for_capture_mode(capture_mode: str, payload: Dict[str, Any], selection: str) -> tuple[str, bool]:
    if capture_mode == "selection":
        return selection, False
    if capture_mode == "clipboard":
        return clipboard.read_text(), True
    if capture_mode == "metadata":
        return "", False
    if capture_mode == "visible":
        return str(payload.get("visible_text") or ""), False
    if capture_mode == "readable":
        return str(payload.get("readable_text") or payload.get("visible_text") or ""), False

    fallback_used = not bool(selection.strip())
    return (clipboard.read_text(), True) if fallback_used else (selection, False)


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


def capsule_start(message: Dict[str, Any]) -> Dict[str, Any]:
    title = str(message.get("title") or "").strip() or None
    project = _clean_label(message.get("project"))
    tag = _clean_label(message.get("tag"))
    capsule = start_capsule(title, project=project, tag=tag)
    _safe_log("info", "capsule_start", str(capsule.get("title", "")))
    return {"ok": True, "capsule": _capsule_summary(capsule)}


def capsule_append(message: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = _int_value(message.get("id"), 0)
    if entry_id <= 0:
        return {"ok": False, "error": "Missing capture id."}
    capsule = append_existing_capture_to_active_capsule(entry_id)
    if not capsule:
        return {"ok": False, "error": f"Capture {entry_id} was not found."}
    return {"ok": True, "capsule": _capsule_summary(capsule)}


def capsule_copy() -> Dict[str, Any]:
    capsule = get_active_capsule()
    if not capsule or not capsule.get("item_count"):
        return {"ok": False, "error": "No active capsule with captures."}
    markdown = capsule_markdown(capsule)
    clipboard.write_text(markdown)
    _safe_log("info", "capsule_copy", str(capsule.get("title", "")))
    return {"ok": True, "capsule": _capsule_summary(capsule)}


def capsule_clear() -> Dict[str, Any]:
    deleted = clear_active_capsule()
    _safe_log("info", "capsule_clear", f"deleted={deleted}")
    return {"ok": True, "deleted": deleted}


def capsule_status() -> Dict[str, Any]:
    capsule = get_active_capsule()
    return {"ok": True, "capsule": _capsule_summary(capsule) if capsule else None}


def export_context(message: Dict[str, Any]) -> Dict[str, Any]:
    target = str(message.get("target") or "visible").lower()
    export_format = str(message.get("format") or "markdown").lower()

    if target == "capsule":
        capsule = get_active_capsule()
        if not capsule or not capsule.get("item_count"):
            return {"ok": False, "error": "No active capsule with captures."}
        text = _export_json(capsule) if export_format == "json" else capsule_markdown(capsule)
        clipboard.write_text(text)
        _safe_log("info", "export", f"{target} | {export_format} | count={int(capsule['item_count'])}")
        return {"ok": True, "target": target, "format": export_format, "count": int(capsule["item_count"])}

    entries = list_entries_for_export() if target == "all" else get_entries_by_ids(_int_list(message.get("ids")))
    if not entries:
        return {"ok": False, "error": "No captures to export."}

    text = _export_json(entries) if export_format == "json" else _entries_markdown(entries)
    clipboard.write_text(text)
    _safe_log("info", "export", f"{target} | {export_format} | count={len(entries)}")
    return {"ok": True, "target": target, "format": export_format, "count": len(entries)}


def diagnostics(message: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "entries": list_diagnostics(_int_value(message.get("limit"), 12))}


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


def _int_list(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    output: list[int] = []
    for item in value:
        try:
            output.append(int(item))
        except (TypeError, ValueError):
            continue
    return output


def _optional_str(value: Any) -> Optional[str]:
    return str(value) if value is not None else None


def _clean_label(value: Any) -> str:
    return " ".join(str(value or "").strip().split())[:80]


def _capsule_summary(capsule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not capsule:
        return None
    return {
        "id": capsule["id"],
        "title": capsule["title"],
        "active": capsule["active"],
        "item_count": capsule["item_count"],
        "preview": capsule.get("preview", ""),
        "project": capsule.get("project", ""),
        "tag": capsule.get("tag", ""),
        "updated_at": capsule.get("updated_at", ""),
    }


def _entries_markdown(entries: list[Dict[str, Any]]) -> str:
    parts = ["# Context Capsule Export"]
    for index, entry in enumerate(entries, start=1):
        parts.append(f"## {index}. {entry.get('title') or 'Untitled page'}")
        labels = _entry_labels(entry)
        if labels:
            parts.append(labels)
        parts.append(str(entry.get("markdown") or "").strip())
    return "\n\n".join(parts).strip() + "\n"


def _entry_labels(entry: Dict[str, Any]) -> str:
    labels = []
    if entry.get("project"):
        labels.append(f"Project: {entry['project']}")
    if entry.get("tag"):
        labels.append(f"Tag: {entry['tag']}")
    return "\n".join(labels)


def _export_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def _safe_log(level: str, message: str, context: str = "") -> None:
    try:
        log_diagnostic(level, message, context)
    except Exception:
        pass


if __name__ == "__main__":
    raise SystemExit(main())
