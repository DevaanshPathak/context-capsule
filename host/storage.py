from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
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
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        _ensure_column(connection, "captures", "format_mode", "TEXT NOT NULL DEFAULT 'markdown'")
        _ensure_column(connection, "captures", "pinned", "INTEGER NOT NULL DEFAULT 0")


def insert_entry(entry: CaptureEntry, db_path: Optional[Path] = None) -> int:
    path = db_path or default_db_path()
    init_db(path)
    with _connect(path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO captures (url, title, content, markdown, captured_at, fallback_used, format_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.url,
                entry.title,
                entry.content,
                entry.markdown,
                entry.captured_at,
                int(entry.fallback_used),
                entry.format_mode,
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
            SELECT id, url, title, content, captured_at, fallback_used, pinned, format_mode
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
            SELECT id, url, title, content, markdown, captured_at, fallback_used, pinned, format_mode
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
        "preview": _preview(content),
    }


def _entry_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    data = _history_row_to_dict(row)
    data["markdown"] = str(row["markdown"] or "")
    return data


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
