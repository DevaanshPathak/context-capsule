from __future__ import annotations

from datetime import datetime
from typing import Optional


FORMAT_MODES = {"markdown", "compact", "prompt"}
CAPTURE_MODES = {"smart", "selection", "clipboard", "metadata", "visible", "readable"}
TEMPLATE_IDS = {"none", "summarize", "debug", "explain", "notes"}


def build_markdown(
    url: str,
    title: str,
    body: str,
    captured_at: Optional[str] = None,
    format_mode: str = "markdown",
    template_id: str = "none",
) -> str:
    mode = normalize_format_mode(format_mode)
    clean_title = (title or "Untitled page").strip() or "Untitled page"
    page_title = _escape_link_text(clean_title)
    page_url = (url or "").strip()
    captured = format_timestamp(captured_at)

    if mode == "compact":
        context = f"Source: {clean_title} - {page_url}\nCaptured: {captured}\n\n{body}"
    elif mode == "prompt":
        context = (
            "Context source:\n"
            f"- Title: {clean_title}\n"
            f"- URL: {page_url}\n"
            f"- Captured: {captured}\n\n"
            f"Relevant content:\n{body}"
        )
    else:
        context = f"> Source: [{page_title}]({page_url})\n> Captured: {captured}\n\n{body}"

    return apply_prompt_template(context, template_id)


def normalize_format_mode(format_mode: str) -> str:
    mode = (format_mode or "markdown").strip().lower()
    return mode if mode in FORMAT_MODES else "markdown"


def normalize_capture_mode(capture_mode: str) -> str:
    mode = (capture_mode or "smart").strip().lower()
    return mode if mode in CAPTURE_MODES else "smart"


def normalize_template_id(template_id: str) -> str:
    candidate = (template_id or "none").strip().lower()
    return candidate if candidate in TEMPLATE_IDS else "none"


def apply_prompt_template(context: str, template_id: str) -> str:
    template = normalize_template_id(template_id)
    if template == "summarize":
        return f"Please summarize the key points from this captured context.\n\n{context}"
    if template == "debug":
        return f"Use this captured context to help debug the issue. Identify likely causes and next steps.\n\n{context}"
    if template == "explain":
        return f"Explain this documentation or page excerpt clearly, including the practical implications.\n\n{context}"
    if template == "notes":
        return f"Turn this captured context into concise, structured notes with action items if relevant.\n\n{context}"
    return context


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
