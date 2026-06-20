const HOST_NAME = "com.context_capsule.host";
const CAPTURE_MODE_KEY = "captureMode";
const AUTO_PIN_FALLBACK_KEY = "autoPinFallback";
const LAST_STATUS_KEY = "lastCaptureStatus";
const FORMAT_MODE_KEY = "formatMode";
const HISTORY_LIMIT_KEY = "historyLimit";
const TEMPLATE_ID_KEY = "templateId";
const TIMESTAMP_STYLE_KEY = "timestampStyle";

chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-context") {
    captureActiveTab().catch((error) => {
      console.error("Context Capsule capture failed:", error);
      saveLastStatus(failureStatus(error)).catch(() => {});
      flashBadge("!", "#b3261e");
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== "context-capsule-popup") {
    return false;
  }

  handlePopupMessage(message.payload)
    .then((response) => sendResponse(response))
    .catch((error) => {
      const status = failureStatus(error);
      saveLastStatus(status).catch(() => {});
      sendResponse({ ok: false, error: status.message });
    });

  return true;
});

async function handlePopupMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid popup request." };
  }

  if (payload.action === "capture-active-tab") {
    return captureActiveTab({
      formatMode: payload.format_mode,
      captureMode: payload.capture_mode,
      templateId: payload.template_id,
      appendToCapsule: Boolean(payload.append_to_capsule)
    });
  }

  if (payload.action === "last-status") {
    return { ok: true, status: await getLastStatus() };
  }

  if (payload.action === "get-settings") {
    return {
      ok: true,
      format_mode: await getStoredFormatMode(),
      capture_mode: await getStoredCaptureMode(),
      template_id: await getStoredTemplateId(),
      history_limit: await getStoredHistoryLimit(),
      timestamp_style: await getStoredTimestampStyle(),
      auto_pin_fallback: await getStoredAutoPinFallback()
    };
  }

  if (payload.action === "set-format-mode") {
    await setStoredFormatMode(payload.format_mode);
    return { ok: true, format_mode: normalizeFormatMode(payload.format_mode) };
  }

  if (payload.action === "set-capture-mode") {
    await setStoredCaptureMode(payload.capture_mode);
    return { ok: true, capture_mode: normalizeCaptureMode(payload.capture_mode) };
  }

  if (payload.action === "set-template-id") {
    await setStoredTemplateId(payload.template_id);
    return { ok: true, template_id: normalizeTemplateId(payload.template_id) };
  }

  const response = await sendToNative(payload);
  if (response && response.ok === true && payload.action === "recopy") {
    await saveLastStatus({
      ok: true,
      kind: "recopy",
      message: "Copied history entry back to clipboard.",
      timestamp: new Date().toISOString()
    });
  }
  return response;
}

async function captureActiveTab(options = {}) {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found.");
  }

  const formatMode = normalizeFormatMode(options.formatMode || (await getStoredFormatMode()));
  const captureMode = normalizeCaptureMode(options.captureMode || (await getStoredCaptureMode()));
  const templateId = normalizeTemplateId(options.templateId || (await getStoredTemplateId()));
  const timestampStyle = normalizeTimestampStyle(await getStoredTimestampStyle());
  const autoPinFallback = await getStoredAutoPinFallback();
  await setStoredFormatMode(formatMode);
  await setStoredCaptureMode(captureMode);
  await setStoredTemplateId(templateId);

  const pageContext = await getPageContext(tab.id);
  const response = await sendToNative({
    action: "capture",
    payload: {
      url: tab.url || "",
      title: tab.title || "Untitled page",
      selection: pageContext.selection,
      visible_text: pageContext.visibleText,
      readable_text: pageContext.readableText,
      timestamp: new Date().toISOString(),
      format_mode: formatMode,
      capture_mode: captureMode,
      template_id: templateId,
      timestamp_style: timestampStyle,
      auto_pin_fallback: autoPinFallback,
      append_to_capsule: Boolean(options.appendToCapsule)
    }
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Native host capture failed.");
  }

  const status = {
    ok: true,
    kind: "capture",
    id: response.id,
    title: response.title || tab.title || "Untitled page",
    url: response.url || tab.url || "",
    fallback_used: Boolean(response.fallback_used),
    captured_at: response.captured_at || "",
    format_mode: response.format_mode || formatMode,
    capture_mode: response.capture_mode || captureMode,
    template_id: response.template_id || templateId,
    timestamp_style: response.timestamp_style || timestampStyle,
    message: captureStatusMessage(response.capture_mode || captureMode, Boolean(response.fallback_used)),
    timestamp: new Date().toISOString()
  };
  if (response.capsule) {
    status.message = `Appended to ${response.capsule.title}.`;
  }
  await saveLastStatus(status);
  await flashBadge(response.fallback_used ? "CB" : "OK", "#146c2e");
  return response;
}

async function getSelection(tabId) {
  const context = await getPageContext(tabId);
  return context.selection;
}

async function getPageContext(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "get-page-context" });
    return normalizePageContext(response);
  } catch (_error) {
    try {
      await executeScript({ target: { tabId }, files: ["content.js"] });
      const response = await sendTabMessage(tabId, { type: "get-page-context" });
      return normalizePageContext(response);
    } catch (error) {
      console.warn("Context Capsule could not read page selection:", error);
      return normalizePageContext(null);
    }
  }
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function executeScript(details) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, (results) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(results);
    });
  });
}

function sendToNative(message) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(HOST_NAME);
    let settled = false;

    port.onMessage.addListener((response) => {
      settled = true;
      resolve(response);
      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (!settled) {
        reject(new Error(error ? error.message : "Native host disconnected before responding."));
      }
    });

    port.postMessage(message);
  });
}

function getLastStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get([LAST_STATUS_KEY], (items) => {
      resolve(items[LAST_STATUS_KEY] || null);
    });
  });
}

function saveLastStatus(status) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_STATUS_KEY]: status }, () => resolve());
  });
}

function getStoredFormatMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get([FORMAT_MODE_KEY], (items) => {
      resolve(normalizeFormatMode(items[FORMAT_MODE_KEY]));
    });
  });
}

function getStoredCaptureMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CAPTURE_MODE_KEY], (items) => {
      resolve(normalizeCaptureMode(items[CAPTURE_MODE_KEY]));
    });
  });
}

function getStoredTemplateId() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TEMPLATE_ID_KEY], (items) => {
      resolve(normalizeTemplateId(items[TEMPLATE_ID_KEY]));
    });
  });
}

function getStoredHistoryLimit() {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_LIMIT_KEY], (items) => {
      resolve(normalizeHistoryLimit(items[HISTORY_LIMIT_KEY]));
    });
  });
}

function getStoredTimestampStyle() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TIMESTAMP_STYLE_KEY], (items) => {
      resolve(normalizeTimestampStyle(items[TIMESTAMP_STYLE_KEY]));
    });
  });
}

function getStoredAutoPinFallback() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTO_PIN_FALLBACK_KEY], (items) => {
      resolve(Boolean(items[AUTO_PIN_FALLBACK_KEY]));
    });
  });
}

function setStoredFormatMode(formatMode) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [FORMAT_MODE_KEY]: normalizeFormatMode(formatMode) }, () => resolve());
  });
}

function setStoredCaptureMode(captureMode) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CAPTURE_MODE_KEY]: normalizeCaptureMode(captureMode) }, () => resolve());
  });
}

function setStoredTemplateId(templateId) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TEMPLATE_ID_KEY]: normalizeTemplateId(templateId) }, () => resolve());
  });
}

function normalizeFormatMode(formatMode) {
  const mode = String(formatMode || "markdown").toLowerCase();
  return ["markdown", "compact", "prompt"].includes(mode) ? mode : "markdown";
}

function normalizeCaptureMode(captureMode) {
  const mode = String(captureMode || "smart").toLowerCase();
  return ["smart", "selection", "clipboard", "metadata", "visible", "readable"].includes(mode) ? mode : "smart";
}

function normalizeTemplateId(templateId) {
  const candidate = String(templateId || "none").toLowerCase();
  return ["none", "summarize", "debug", "explain", "notes"].includes(candidate) ? candidate : "none";
}

function normalizeTimestampStyle(timestampStyle) {
  const candidate = String(timestampStyle || "local").toLowerCase();
  return ["local", "iso", "date"].includes(candidate) ? candidate : "local";
}

function normalizeHistoryLimit(historyLimit) {
  const parsed = Number.parseInt(historyLimit, 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.max(5, Math.min(100, parsed));
}

function normalizePageContext(response) {
  return {
    selection: response && typeof response.selection === "string" ? response.selection : "",
    visibleText: response && typeof response.visibleText === "string" ? response.visibleText : "",
    readableText: response && typeof response.readableText === "string" ? response.readableText : ""
  };
}

function captureStatusMessage(captureMode, fallbackUsed) {
  if (fallbackUsed) {
    return "Copied with clipboard fallback.";
  }
  const labels = {
    smart: "Copied selected page text.",
    selection: "Copied selected text only.",
    clipboard: "Copied clipboard content with page source.",
    metadata: "Copied page title and URL.",
    visible: "Copied visible page text.",
    readable: "Copied readable page text."
  };
  return labels[captureMode] || labels.smart;
}

function failureStatus(error) {
  return {
    ok: false,
    kind: "error",
    message: error && error.message ? error.message : String(error),
    timestamp: new Date().toISOString()
  };
}

async function flashBadge(text, color) {
  await setBadgeBackgroundColor(color);
  await setBadgeText(text);
  setTimeout(() => {
    setBadgeText("").catch(() => {});
  }, 1400);
}

function setBadgeText(text) {
  return new Promise((resolve) => {
    chrome.action.setBadgeText({ text }, () => resolve());
  });
}

function setBadgeBackgroundColor(color) {
  return new Promise((resolve) => {
    chrome.action.setBadgeBackgroundColor({ color }, () => resolve());
  });
}
