from __future__ import annotations

from datetime import datetime
from typing import Optional

# Supported formatter, capture, template and timestamp options
FORMAT_MODES = {"markdown", "compact", "prompt"}
CAPTURE_MODES = {"smart", "selection", "clipboard", "metadata", "visible", "readable"}
TEMPLATE_IDS = {"none", "summarize", "debug", "explain", "notes"}
TIMESTAMP_STYLES = {"local", "iso", "date"}

# Build the final captured context text in markdown, compact or prompt format
def build_markdown(
    url: str,
    title: str,
    body: str,
    captured_at: Optional[str] = None,
    format_mode: str = "markdown",
    template_id: str = "none",
    timestamp_style: str = "local",
) -> str:
    mode = normalize_format_mode(format_mode)
    clean_title = (title or "Untitled page").strip() or "Untitled page" # Normalize formatting inputs and prepare safe title, URL and timestamp values
    page_title = _escape_link_text(clean_title)
    page_url = (url or "").strip()
    captured = format_timestamp(captured_at, timestamp_style)

    if mode == "compact":
        context = f"Source: {clean_title} - {page_url}\nCaptured: {captured}\n\n{body}" # Generate compact one line source metadata format
    elif mode == "prompt":
        context = ( # Generate prompt friendly structured context format
            "Context source:\n"
            f"- Title: {clean_title}\n"
            f"- URL: {page_url}\n"
            f"- Captured: {captured}\n\n"
            f"Relevant content:\n{body}"
        )
    else:
        context = f"> Source: [{page_title}]({page_url})\n> Captured: {captured}\n\n{body}"
    # Generate default markdown blockquote source format
    return apply_prompt_template(context, template_id)

# Optionally wrap the captured context in a prompt template
def normalize_format_mode(format_mode: str) -> str:
    mode = (format_mode or "markdown").strip().lower()
    return mode if mode in FORMAT_MODES else "markdown"


def normalize_capture_mode(capture_mode: str) -> str:
    mode = (capture_mode or "smart").strip().lower()
    return mode if mode in CAPTURE_MODES else "smart" # Validate capture mode and fall back to smart mode


def normalize_template_id(template_id: str) -> str:
    candidate = (template_id or "none").strip().lower()
    return candidate if candidate in TEMPLATE_IDS else "none" # Validate prompt template ID and fall back to none

def apply_prompt_template(context: str, template_id: str) -> str:
    template = normalize_template_id(template_id)
    if template == "summarize":
        return f"Please summarize the key points from this captured context.\n\n{context}" # Add task specific instructions around the captured context
    if template == "debug":
        return f"Use this captured context to help debug the issue. Identify likely causes and next steps.\n\n{context}"
    if template == "explain":
        return f"Explain this documentation or page excerpt clearly, including the practical implications.\n\n{context}"
    if template == "notes":
        return f"Turn this captured context into concise, structured notes with action items if relevant.\n\n{context}"
    return context


def normalize_timestamp_style(timestamp_style: str) -> str:
    candidate = (timestamp_style or "local").strip().lower()
    return candidate if candidate in TIMESTAMP_STYLES else "local"
# Validate timestamp style and fall back to local format

def format_timestamp(raw_timestamp: Optional[str], timestamp_style: str = "local") -> str:
    style = normalize_timestamp_style(timestamp_style)
    if not raw_timestamp:
        parsed = datetime.now() # Format captured timestamp, using current time if missing or invalid
        return _format_datetime(parsed, style)

    text = raw_timestamp.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return _format_datetime(datetime.now(), style)
    # Parse ISO timestamps, inluding Zulu/UTC timestamps
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone()

    return _format_datetime(parsed, style) # Convert timezone aware timestamps into local time


def _format_datetime(parsed: datetime, timestamp_style: str) -> str:
    if timestamp_style == "iso":
        return parsed.isoformat(timespec="minutes")
    if timestamp_style == "date": # Convert datetime objects into ISO, date only or local display strings
        return parsed.strftime("%Y-%m-%d")
    return parsed.strftime("%Y-%m-%d %H:%M")


def _escape_link_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("]", "\\]")
