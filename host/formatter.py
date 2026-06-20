from __future__ import annotations

from datetime import datetime
from typing import Optional


FORMAT_MODES = {"markdown", "compact", "prompt"}


def build_markdown(
    url: str,
    title: str,
    body: str,
    captured_at: Optional[str] = None,
    format_mode: str = "markdown",
) -> str:
    mode = normalize_format_mode(format_mode)
    clean_title = (title or "Untitled page").strip() or "Untitled page"
    page_title = _escape_link_text(clean_title)
    page_url = (url or "").strip()
    captured = format_timestamp(captured_at)

    if mode == "compact":
        return f"Source: {clean_title} - {page_url}\nCaptured: {captured}\n\n{body}"
    if mode == "prompt":
        return (
            "Context source:\n"
            f"- Title: {clean_title}\n"
            f"- URL: {page_url}\n"
            f"- Captured: {captured}\n\n"
            f"Relevant content:\n{body}"
        )

    return f"> Source: [{page_title}]({page_url})\n> Captured: {captured}\n\n{body}"


def normalize_format_mode(format_mode: str) -> str:
    mode = (format_mode or "markdown").strip().lower()
    return mode if mode in FORMAT_MODES else "markdown"


def format_timestamp(raw_timestamp: Optional[str]) -> str:
    if not raw_timestamp:
        return datetime.now().strftime("%Y-%m-%d %H:%M")

    text = raw_timestamp.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now().strftime("%Y-%m-%d %H:%M")

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone()

    return parsed.strftime("%Y-%m-%d %H:%M")


def _escape_link_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("]", "\\]")
