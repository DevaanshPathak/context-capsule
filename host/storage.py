from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_HISTORY_LIMIT = 20
MAX_HISTORY_ENTRIES = 200


@dataclass(frozen=True)
class CaptureEntry:
    url: str
    title: str
    content: str
    markdown: str
    captured_at: str
    fallback_used: bool
    format_mode: str = "markdown"
    capture_mode: str = "smart"


def default_db_path() -> Path:
    override = os.environ.get("CONTEXT_CAPSULE_DB")
    if override:
        return Path(override).expanduser()
    return Path(__file__).resolve().parents[1] / "data" / "history.sqlite3"


def init_db(db_path: Optional[Path] = None) -> None:
    path = db_path or default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                markdown TEXT NOT NULL,
                captured_at TEXT NOT NULL,
                fallback_used INTEGER NOT NULL,
                format_mode TEXT NOT NULL DEFAULT 'markdown',
                capture_mode TEXT NOT NULL DEFAULT 'smart',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        _ensure_column(connection, "captures", "format_mode", "TEXT NOT NULL DEFAULT 'markdown'")
        _ensure_column(connection, "captures", "capture_mode", "TEXT NOT NULL DEFAULT 'smart'")
        _ensure_column(connection, "captures", "pinned", "INTEGER NOT NULL DEFAULT 0")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS capsules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS capsule_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                capsule_id INTEGER NOT NULL,
                capture_id INTEGER,
                position INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                markdown TEXT NOT NULL,
                captured_at TEXT NOT NULL,
                format_mode TEXT NOT NULL DEFAULT 'markdown',
                capture_mode TEXT NOT NULL DEFAULT 'smart',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def insert_entry(entry: CaptureEntry, db_path: Optional[Path] = None) -> int:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO captures (url, title, content, markdown, captured_at, fallback_used, format_mode, capture_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.url,
                entry.title,
                entry.content,
                entry.markdown,
                entry.captured_at,
                int(entry.fallback_used),
                entry.format_mode,
                entry.capture_mode,
            ),
        )
        _prune_history(connection, MAX_HISTORY_ENTRIES)
        return int(cursor.lastrowid)


def list_entries(limit: int = DEFAULT_HISTORY_LIMIT, db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    path = db_path or default_db_path()
    init_db(path)
    normalized_limit = max(1, min(int(limit), 100))
    with _connect(path) as connection:
        rows = connection.execute(
            """
            SELECT id, url, title, content, captured_at, fallback_used, pinned, format_mode, capture_mode
            FROM captures
            ORDER BY pinned DESC, id DESC
            LIMIT ?
            """,
            (normalized_limit,),
        ).fetchall()
    return [_history_row_to_dict(row) for row in rows]


def history_summary(db_path: Optional[Path] = None) -> Dict[str, Any]:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        row = connection.execute(
            """
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(pinned), 0) AS pinned,
                COALESCE(SUM(fallback_used), 0) AS fallback_used,
                COALESCE(SUM(CASE WHEN format_mode = 'markdown' THEN 1 ELSE 0 END), 0) AS markdown,
                COALESCE(SUM(CASE WHEN format_mode = 'compact' THEN 1 ELSE 0 END), 0) AS compact,
                COALESCE(SUM(CASE WHEN format_mode = 'prompt' THEN 1 ELSE 0 END), 0) AS prompt
            FROM captures
            """
        ).fetchone()
        latest = connection.execute(
            """
            SELECT title, url, captured_at
            FROM captures
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    return {
        "total": int(row["total"] or 0),
        "pinned": int(row["pinned"] or 0),
        "fallback_used": int(row["fallback_used"] or 0),
        "formats": {
            "markdown": int(row["markdown"] or 0),
            "compact": int(row["compact"] or 0),
            "prompt": int(row["prompt"] or 0),
        },
        "latest": _latest_row_to_dict(latest) if latest else None,
    }


def get_entry(entry_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        row = connection.execute(
            """
            SELECT id, url, title, content, markdown, captured_at, fallback_used, pinned, format_mode, capture_mode
            FROM captures
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
    return _entry_row_to_dict(row) if row else None


def delete_entry(entry_id: int, db_path: Optional[Path] = None) -> bool:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        cursor = connection.execute("DELETE FROM captures WHERE id = ?", (entry_id,))
        return cursor.rowcount > 0


def clear_entries(db_path: Optional[Path] = None) -> int:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        cursor = connection.execute("DELETE FROM captures")
        return int(cursor.rowcount)


def set_pinned(entry_id: int, pinned: bool, db_path: Optional[Path] = None) -> bool:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        cursor = connection.execute(
            "UPDATE captures SET pinned = ? WHERE id = ?",
            (int(pinned), entry_id),
        )
        return cursor.rowcount > 0


def start_capsule(title: Optional[str] = None, db_path: Optional[Path] = None) -> Dict[str, Any]:
    path = db_path or default_db_path()
    init_db(path)
    capsule_title = title or f"Capsule {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    with _connect(path) as connection:
        connection.execute("UPDATE capsules SET active = 0 WHERE active = 1")
        cursor = connection.execute(
            "INSERT INTO capsules (title, active) VALUES (?, 1)",
            (capsule_title,),
        )
        capsule_id = int(cursor.lastrowid)
    capsule = get_capsule(capsule_id, path)
    return capsule or {"id": capsule_id, "title": capsule_title, "item_count": 0, "items": []}


def get_active_capsule(db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        row = connection.execute(
            "SELECT id FROM capsules WHERE active = 1 ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return get_capsule(int(row["id"]), path) if row else None


def append_entry_to_active_capsule(
    capture_id: int,
    entry: CaptureEntry,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    path = db_path or default_db_path()
    init_db(path)
    capsule = get_active_capsule(path) or start_capsule(db_path=path)
    capsule_id = int(capsule["id"])
    with _connect(path) as connection:
        position = int(
            connection.execute(
                "SELECT COUNT(*) AS count FROM capsule_items WHERE capsule_id = ?",
                (capsule_id,),
            ).fetchone()["count"]
            or 0
        ) + 1
        connection.execute(
            """
            INSERT INTO capsule_items (
                capsule_id, capture_id, position, url, title, content, markdown,
                captured_at, format_mode, capture_mode
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                capsule_id,
                capture_id,
                position,
                entry.url,
                entry.title,
                entry.content,
                entry.markdown,
                entry.captured_at,
                entry.format_mode,
                entry.capture_mode,
            ),
        )
        connection.execute(
            "UPDATE capsules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (capsule_id,),
        )
    return get_capsule(capsule_id, path) or capsule


def append_existing_capture_to_active_capsule(entry_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    entry = get_entry(entry_id, db_path)
    if not entry:
        return None
    capture_entry = CaptureEntry(
        url=str(entry["url"]),
        title=str(entry["title"]),
        content=str(entry.get("content") or entry.get("preview") or ""),
        markdown=str(entry["markdown"]),
        captured_at=str(entry["captured_at"]),
        fallback_used=bool(entry["fallback_used"]),
        format_mode=str(entry["format_mode"]),
        capture_mode=str(entry["capture_mode"]),
    )
    return append_entry_to_active_capsule(entry_id, capture_entry, db_path)


def get_capsule(capsule_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        capsule = connection.execute(
            """
            SELECT id, title, active, created_at, updated_at
            FROM capsules
            WHERE id = ?
            """,
            (capsule_id,),
        ).fetchone()
        if not capsule:
            return None
        items = connection.execute(
            """
            SELECT id, capture_id, position, url, title, content, markdown,
                   captured_at, format_mode, capture_mode
            FROM capsule_items
            WHERE capsule_id = ?
            ORDER BY position ASC, id ASC
            """,
            (capsule_id,),
        ).fetchall()
    return _capsule_to_dict(capsule, items)


def clear_active_capsule(db_path: Optional[Path] = None) -> int:
    path = db_path or default_db_path()
    init_db(path)
    capsule = get_active_capsule(path)
    if not capsule:
        return 0
    capsule_id = int(capsule["id"])
    with _connect(path) as connection:
        item_count = int(
            connection.execute(
                "SELECT COUNT(*) AS count FROM capsule_items WHERE capsule_id = ?",
                (capsule_id,),
            ).fetchone()["count"]
            or 0
        )
        connection.execute("DELETE FROM capsule_items WHERE capsule_id = ?", (capsule_id,))
        connection.execute("DELETE FROM capsules WHERE id = ?", (capsule_id,))
    return item_count


def capsule_markdown(capsule: Dict[str, Any]) -> str:
    items = list(capsule.get("items") or [])
    title = str(capsule.get("title") or "Context Capsule")
    parts = [f"# {title}"]
    for item in items:
        parts.append(f"## {int(item['position'])}. {item['title'] or 'Untitled page'}")
        parts.append(str(item["markdown"]).strip())
    return "\n\n".join(parts).strip() + "\n"


def _connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {str(row["name"]) for row in connection.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _prune_history(connection: sqlite3.Connection, max_entries: int) -> None:
    connection.execute(
        """
        DELETE FROM captures
        WHERE pinned = 0
        AND id NOT IN (
            SELECT id FROM captures WHERE pinned = 0 ORDER BY id DESC LIMIT ?
        )
        """,
        (max_entries,),
    )


def _row_bool(row: sqlite3.Row, key: str) -> bool:
    return bool(row[key]) if key in row.keys() else False


def _row_text(row: sqlite3.Row, key: str, fallback: str = "") -> str:
    if key not in row.keys():
        return fallback
    return str(row[key] or fallback)


def _history_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    content = str(row["content"] or "")
    return {
        "id": int(row["id"]),
        "url": str(row["url"] or ""),
        "title": str(row["title"] or ""),
        "captured_at": str(row["captured_at"] or ""),
        "fallback_used": bool(row["fallback_used"]),
        "pinned": _row_bool(row, "pinned"),
        "format_mode": _row_text(row, "format_mode", "markdown"),
        "capture_mode": _row_text(row, "capture_mode", "smart"),
        "preview": _preview(content),
    }


def _entry_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    data = _history_row_to_dict(row)
    data["content"] = str(row["content"] or "")
    data["markdown"] = str(row["markdown"] or "")
    return data


def _capsule_to_dict(capsule: sqlite3.Row, items: List[sqlite3.Row]) -> Dict[str, Any]:
    mapped_items = [_capsule_item_to_dict(item) for item in items]
    return {
        "id": int(capsule["id"]),
        "title": str(capsule["title"] or ""),
        "active": bool(capsule["active"]),
        "created_at": str(capsule["created_at"] or ""),
        "updated_at": str(capsule["updated_at"] or ""),
        "item_count": len(mapped_items),
        "preview": _preview(" ".join(item["content"] for item in mapped_items)),
        "items": mapped_items,
    }


def _capsule_item_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "capture_id": int(row["capture_id"]) if row["capture_id"] is not None else None,
        "position": int(row["position"]),
        "url": str(row["url"] or ""),
        "title": str(row["title"] or ""),
        "content": str(row["content"] or ""),
        "markdown": str(row["markdown"] or ""),
        "captured_at": str(row["captured_at"] or ""),
        "format_mode": str(row["format_mode"] or "markdown"),
        "capture_mode": str(row["capture_mode"] or "smart"),
    }


def _latest_row_to_dict(row: sqlite3.Row) -> Dict[str, str]:
    return {
        "title": str(row["title"] or ""),
        "url": str(row["url"] or ""),
        "captured_at": str(row["captured_at"] or ""),
    }


def _preview(content: str, limit: int = 180) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 3]}..."
