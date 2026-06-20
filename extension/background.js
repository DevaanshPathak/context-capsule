const HOST_NAME = "com.context_capsule.host";
const LAST_STATUS_KEY = "lastCaptureStatus";
const FORMAT_MODE_KEY = "formatMode";

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
    return captureActiveTab({ formatMode: payload.format_mode });
  }

  if (payload.action === "last-status") {
    return { ok: true, status: await getLastStatus() };
  }

  if (payload.action === "get-settings") {
    return { ok: true, format_mode: await getStoredFormatMode() };
  }

  if (payload.action === "set-format-mode") {
    await setStoredFormatMode(payload.format_mode);
    return { ok: true, format_mode: normalizeFormatMode(payload.format_mode) };
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
  await setStoredFormatMode(formatMode);

  const selection = await getSelection(tab.id);
  const response = await sendToNative({
    action: "capture",
    payload: {
      url: tab.url || "",
      title: tab.title || "Untitled page",
      selection,
      timestamp: new Date().toISOString(),
      format_mode: formatMode
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
    message: response.fallback_used ? "Copied with clipboard fallback." : "Copied selected page text.",
    timestamp: new Date().toISOString()
  };
  await saveLastStatus(status);
  await flashBadge(response.fallback_used ? "CB" : "OK", "#146c2e");
  return response;
}

async function getSelection(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "get-selection" });
    return response && typeof response.selection === "string" ? response.selection : "";
  } catch (_error) {
    try {
      await executeScript({ target: { tabId }, files: ["content.js"] });
      const response = await sendTabMessage(tabId, { type: "get-selection" });
      return response && typeof response.selection === "string" ? response.selection : "";
    } catch (error) {
      console.warn("Context Capsule could not read page selection:", error);
      return "";
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

function setStoredFormatMode(formatMode) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [FORMAT_MODE_KEY]: normalizeFormatMode(formatMode) }, () => resolve());
  });
}

function normalizeFormatMode(formatMode) {
  const mode = String(formatMode || "markdown").toLowerCase();
  return ["markdown", "compact", "prompt"].includes(mode) ? mode : "markdown";
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
