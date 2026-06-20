(() => {
  if (window.__contextCapsuleContentLoaded) {
    return;
  }

  window.__contextCapsuleContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !["get-selection", "get-page-context"].includes(message.type)) {
      return false;
    }

    if (message.type === "get-page-context") {
      sendResponse({
        selection: getSelectionText(),
        visibleText: getVisibleText(),
        readableText: getReadableText()
      });
      return true;
    }

    sendResponse({ selection: getSelectionText() });
    return true;
  });

  function getSelectionText() {
    const pageSelection = window.getSelection ? window.getSelection().toString() : "";
    if (pageSelection) {
      return pageSelection;
    }

    const activeElement = document.activeElement;
    if (!isTextInput(activeElement)) {
      return "";
    }

    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number" || end <= start) {
      return "";
    }

    return activeElement.value.slice(start, end);
  }

  function isTextInput(element) {
    if (!element) {
      return false;
    }

    const tagName = element.tagName;
    if (tagName === "TEXTAREA") {
      return true;
    }

    if (tagName !== "INPUT") {
      return false;
    }

    const type = (element.getAttribute("type") || "text").toLowerCase();
    return ["email", "search", "text", "url", "tel", "password"].includes(type);
  }

  function getVisibleText() {
    const blocks = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const element = walker.currentNode;
      if (!isReadableElement(element) || !isInViewport(element)) {
        continue;
      }
      const text = normalizeText(element.innerText || element.textContent || "");
      if (text) {
        blocks.push(text);
      }
    }
    return uniqueLines(blocks).join("\n\n").slice(0, 20000);
  }

  function getReadableText() {
    const root = document.querySelector("main, article") || document.body || document.documentElement;
    return normalizeText(root.innerText || root.textContent || "").slice(0, 60000);
  }

  function isReadableElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"].includes(element.tagName)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    return ["P", "LI", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH"].includes(element.tagName);
  }

  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  }

  function normalizeText(text) {
    return String(text).replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/[ \t]+/g, " ").trim();
  }

  function uniqueLines(lines) {
    const seen = new Set();
    const output = [];
    for (const line of lines) {
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
      output.push(line);
    }
    return output;
  }
})();
