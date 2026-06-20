(() => {
  if (window.__contextCapsuleContentLoaded) {
    return;
  }

  window.__contextCapsuleContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "get-selection") {
      return false;
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
})();
