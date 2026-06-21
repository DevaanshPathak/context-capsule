(() => { // Immidiately Invoked Function Expression to isolate content script scope
  if (window.__contextCapsuleContentLoaded) { // Prevent the content script from being registered multiple times on the script page
    return;
  }

  window.__contextCapsuleContentLoaded = true; // Mark this page as already having content script loaded

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { // Listen for messages from the extension popup or background script
    if (!message || !["get-selection", "get-page-context"].includes(message.type)) { // Ignore unsupported or invalid message types
      return false;
    }

    if (message.type === "get-page-context") { // Return full page context when the background script requests it
      sendResponse({
        selection: getSelectionText(), // Capture the currently selected text from the page or focused input
        visibleText: getVisibleText(), // Capture readable visible text from elements currently in the viewport
        readableText: getReadableText() // Capture the broader readable text from the main content area of the page, currently in the viewport
      });
      return true;
    }

    sendResponse({ selection: getSelectionText() }); // Fallback response for older requests that only needed selected text
    return true;
  });

  function getSelectionText() { // Get selected text from the page, including text selected inside input fields
    const pageSelection = window.getSelection ? window.getSelection().toString() : ""; // First try to read normal browser text selection
    if (pageSelection) {
      return pageSelection;
    }

    const activeElement = document.activeElement; // If normal selection is empty, check the currently focused input element
    if (!isTextInput(activeElement)) {
      return "";
    }

    const start = activeElement.selectionStart; // Read the selected range inside the focused input or text area
    const end = activeElement.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number" || end <= start) {
      return "";
    }

    return activeElement.value.slice(start, end); // Return the selected substring from the input field
  }

  function isTextInput(element) { // Check whether an element is a text based input that can contain selected text
    if (!element) {
      return false;
    }

    const tagName = element.tagName; // Read the element tag name to distinguish textarea and other input elements
    if (tagName === "TEXTAREA") {
      return true;
    }

    if (tagName !== "INPUT") {
      return false;
    }

    const type = (element.getAttribute("type") || "text").toLowerCase(); // Normalize the text input type before checking whether it supports text selection
    return ["email", "search", "text", "url", "tel", "password"].includes(type);
  }

  function getVisibleText() { // Collect readable text from visible page elements
    const blocks = []; // Store visible readable text blocks before deduping and joining them
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT); // Walk through page elements so readable blocks can be inspected
    while (walker.nextNode()) {
      const element = walker.currentNode;
      if (!isReadableElement(element) || !isInViewport(element)) { // Skip elements that are either unreadable or outside the current viewport
        continue;
      }
      const text = normalizeText(element.innerText || element.textContent || ""); // Normalize the element text before storing it
      if (text) {
        blocks.push(text);
      }
    }
    return uniqueLines(blocks).join("\n\n").slice(0, 20000); // Remove duplicate text blocks, join them and limit output size
  }

  function getReadableText() { // Extract broader readable text from the main page content
    const root = document.querySelector("main, article") || document.body || document.documentElement; // Prefer semantic content containers before falling back to body/html
    return normalizeText(root.innerText || root.textContent || "").slice(0, 60000); // Normalize readable page text and cap it to avoid oversized captures
  }

  function isReadableElement(element) { // Decide whether an element is useful reading content
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS"].includes(element.tagName)) { // Ignore script, style, graphics, and other non readable elements
      return false;
    }
    const style = window.getComputedStyle(element); // Check computed CSS so that hidden elements are not captured
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    return ["P", "LI", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH"].includes(element.tagName); // Only capture common text/content elements
  }

  function isInViewport(element) { // Check whether an element is currently visible inside the browser viewport
    const rect = element.getBoundingClientRect(); // Get the element position relative to the viewport
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  }

  function normalizeText(text) { // Clean whitespace while preserving meaningful line breaks
    return String(text).replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/[ \t]+/g, " ").trim();
  }

  function uniqueLines(lines) { // Remove duplicate text blocks while keeping the orignal order
    const seen = new Set(); // Track text blocks that have already been added
    const output = [];
    for (const line of lines) { // Loop through captured lines and keep only the first copy of each
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
      output.push(line);
    }
    return output; // Return the deduplicated list of text blocks
  }
})();
