from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add the host folder to Python's import path so tests can import local modules
ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / "host"
sys.path.insert(0, str(HOST))
# Test suite for the context capsule native host and formatter behavior
import context_capsule_host as host  # noqa: E402
from formatter import build_markdown, format_timestamp  # noqa: E402


class ContextCapsuleTest(unittest.TestCase):
    def setUp(self) -> None: # Replace real clipboard reads/writes with safe test doubles
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["CONTEXT_CAPSULE_DB"] = str(Path(self.temp_dir.name) / "history.sqlite3")
        self.writes: list[str] = [] # Restore clipboard functions and clean up temp files after each test
        self.original_read = host.clipboard.read_text
        self.original_write = host.clipboard.write_text
        host.clipboard.read_text = lambda: "clipboard text"
        host.clipboard.write_text = self.writes.append
    # Verify markdown, compact, template formatting, and timestamp styles
    def tearDown(self) -> None:
        host.clipboard.read_text = self.original_read
        host.clipboard.write_text = self.original_write
        self.temp_dir.cleanup()

    def test_formatter_presets_and_templates(self) -> None:
        markdown = build_markdown("https://example.com", "Example", "Body", "2026-06-20T09:02:00Z")
        self.assertIn("> Source: [Example](https://example.com)", markdown)

        compact = build_markdown("https://example.com", "Example", "Body", "2026-06-20T09:02:00Z", "compact")
        self.assertTrue(compact.startswith("Source: Example - https://example.com"))

        templated = build_markdown(
            "https://example.com",
            "Example",
            "Body",
            "2026-06-20T09:02:00Z",
            "markdown",
            "debug",
        )
        self.assertTrue(templated.startswith("Use this captured context"))
        self.assertEqual(format_timestamp("2026-06-20T09:02:00Z", "date"), "2026-06-20") # Verify Chrome native messaging length prefixed framing works correctly

    def test_native_messaging_framing(self) -> None:
        stream = io.BytesIO()
        host.write_message({"ok": True, "value": "framed"}, stream)
        stream.seek(0)
        self.assertEqual(host.read_message(stream), {"ok": True, "value": "framed"})
    # Verify smart capture falls back to clipboard text and auto pins fallback captures
    def test_capture_modes_and_fallback_pin(self) -> None:
        response = host.handle_message(
            {
                "action": "capture",
                "payload": {
                    "url": "https://example.com",
                    "title": "Capture",
                    "selection": " ",
                    "timestamp": "2026-06-20T09:02:00Z",
                    "capture_mode": "smart",
                    "auto_pin_fallback": True,
                },
            }
        )
        self.assertTrue(response["ok"])
        self.assertTrue(response["fallback_used"])
        self.assertTrue(response["pinned"])
        self.assertIn("clipboard text", self.writes[-1])

        history = host.handle_message({"action": "history", "limit": 5})["entries"]
        self.assertTrue(history[0]["pinned"])

    def test_capsule_export_and_demo_prompt(self) -> None:
        started = host.handle_message({"action": "capsule_start", "project": "Research", "tag": "docs"})
        self.assertTrue(started["ok"]) # Verify capsule creation, append, export, and demo prompt behaviour

        capture = host.handle_message(
            {
                "action": "capture",
                "payload": {
                    "url": "https://example.com/docs",
                    "title": "Docs",
                    "selection": "documentation text",
                    "timestamp": "2026-06-20T09:02:00Z",
                    "project": "Research",
                    "tag": "docs",
                    "append_to_capsule": True,
                },
            }
        )
        self.assertEqual(capture["capsule"]["item_count"], 1)

        exported = host.handle_message({"action": "export", "target": "capsule", "format": "markdown"})
        self.assertTrue(exported["ok"])
        self.assertIn("documentation text", self.writes[-1])

        demo = host.handle_message({"action": "demo_prompt"})
        self.assertTrue(demo["ok"])
        self.assertIn("I captured this context with Context Capsule", self.writes[-1])

    def test_diagnostics_are_recorded(self) -> None:
        host.handle_message(
            {
                "action": "capture",
                "payload": {
                    "url": "https://example.com",
                    "title": "Diagnostics",
                    "selection": "body",
                    "timestamp": "2026-06-20T09:02:00Z",
                },
            }
        )
        diagnostics = host.handle_message({"action": "diagnostics", "limit": 5})["entries"] # Verify capture activity is written to diagnostics history
        self.assertGreaterEqual(len(diagnostics), 1)
        self.assertEqual(diagnostics[0]["message"], "capture")


if __name__ == "__main__":
    unittest.main()

