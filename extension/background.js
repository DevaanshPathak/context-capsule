const HOST_NAME = "com.context_capsule.host"; // Native host name and Chrome storage keys used by Context Capsule
const CAPTURE_MODE_KEY = "captureMode";
const AUTO_PIN_FALLBACK_KEY = "autoPinFallback";
const LAST_STATUS_KEY = "lastCaptureStatus";
const FORMAT_MODE_KEY = "formatMode";
const HISTORY_LIMIT_KEY = "historyLimit";
const TEMPLATE_ID_KEY = "templateId";
const TIMESTAMP_STYLE_KEY = "timestampStyle";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { // Handle messages coming from the extension popup
  if (!message || message.source !== "context-capsule-popup") { // Ignore messages which are not from the extension popup
    return false;
  }

  handlePopupMessage(message.payload) // Process popup requests asynchronously and reply using sendResponse
    .then((response) => sendResponse(response))
    .catch((error) => {
      const status = failureStatus(error);
      saveLastStatus(status).catch(() => {});
      sendResponse({ ok: false, error: status.message });
    });

  return true;
}); // Keep the message channel open for async response

async function handlePopupMessage(payload) { // Route popup actions to correct capture, settings or native host operation
  if (!payload || typeof payload !== "object") { // Validate popup payload before reading action fields
    return { ok: false, error: "Invalid popup request." };
  }

  if (payload.action === "capture-active-tab") {
    return captureActiveTab({
      formatMode: payload.format_mode,
      captureMode: payload.capture_mode,
      templateId: payload.template_id,
      project: payload.project,
      tag: payload.tag, // Start an action using the options selected in popup
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
      capture_mode: await getStoredCaptureMode(), // Return the last saved capture status to popup
      template_id: await getStoredTemplateId(),
      history_limit: await getStoredHistoryLimit(),
      timestamp_style: await getStoredTimestampStyle(),
      auto_pin_fallback: await getStoredAutoPinFallback() // Return all user saved settings to popup
    };
  }

  if (payload.action === "set-format-mode") {
    await setStoredFormatMode(payload.format_mode);
    return { ok: true, format_mode: normalizeFormatMode(payload.format_mode) };
  }

  if (payload.action === "set-capture-mode") {
    await setStoredCaptureMode(payload.capture_mode);
    return { ok: true, capture_mode: normalizeCaptureMode(payload.capture_mode) }; // Update the saved output format mode
  }

  if (payload.action === "set-template-id") {
    await setStoredTemplateId(payload.template_id);
    return { ok: true, template_id: normalizeTemplateId(payload.template_id) }; // Update the saved capture mode
  }

  const response = await sendToNative(payload);
  if (response && response.ok === true && payload.action === "recopy") {
    await saveLastStatus({
      ok: true,
      kind: "recopy",
      message: "Copied history entry back to clipboard.",
      timestamp: new Date().toISOString()
    }); // Forward all other popup actions to the native app
  }
  return response; // If a history item is recopied, update the visible status message
}

async function captureActiveTab(options = {}) { // Capture the active tab, collect page context, send it to native host and update UI status
  const [tab] = await queryTabs({ active: true, currentWindow: true }); // Find the currently active tab in current chrome window
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found."); // Stop if there is no valid tab to capture
  }

  const formatMode = normalizeFormatMode(options.formatMode || (await getStoredFormatMode()));
  const captureMode = normalizeCaptureMode(options.captureMode || (await getStoredCaptureMode())); // Load and normalize capture settings, falling back to saved preferences.
  const templateId = normalizeTemplateId(options.templateId || (await getStoredTemplateId()));
  const timestampStyle = normalizeTimestampStyle(await getStoredTimestampStyle());
  const autoPinFallback = await getStoredAutoPinFallback();
  await setStoredFormatMode(formatMode);
  await setStoredCaptureMode(captureMode);
  await setStoredTemplateId(templateId); // Persist normalized settings so future capture uses the same values

  const pageContext = await getPageContext(tab.id);
  const response = await sendToNative({
    action: "capture",
    payload: { // Read selected, visible, and readable text from active page
      url: tab.url || "", // Send the captured page data to native messaging host
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
      project: String(options.project || "").trim(),
      tag: String(options.tag || "").trim(),
      append_to_capsule: Boolean(options.appendToCapsule)
    }
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Native host capture failed.");
  }

  const status = {
    ok: true,
    kind: "capture", // Stop if native app failed to capture the page context
    id: response.id,
    title: response.title || tab.title || "Untitled page",
    url: response.url || tab.url || "",
    fallback_used: Boolean(response.fallback_used), // Build the success status object saved for the UI popup
    captured_at: response.captured_at || "",
    format_mode: response.format_mode || formatMode,
    capture_mode: response.capture_mode || captureMode,
    template_id: response.template_id || templateId,
    timestamp_style: response.timestamp_style || timestampStyle,
    project: response.project || "",
    tag: response.tag || "",
    message: captureStatusMessage(response.capture_mode || captureMode, Boolean(response.fallback_used)),
    timestamp: new Date().toISOString()
  };
  if (response.capsule) {
    status.message = `Appended to ${response.capsule.title}.`;
  }
  await saveLastStatus(status);
  await flashBadge(response.fallback_used ? "CB" : "OK", "#146c2e");
  return response; // Show a badge indicating whether normal capture or clipboard fallback was used
}

async function getSelection(tabId) {
  const context = await getPageContext(tabId);
  return context.selection;
}

async function getPageContext(tabId) { // Get page context from the content script, injecting it if needed
  try {
    const response = await sendTabMessage(tabId, { type: "get-page-context" }); // Try reading page context from an already loaded content script first
    return normalizePageContext(response);
  } catch (_error) {
    try {
      await executeScript({ target: { tabId }, files: ["content.js"] }); // If content script is missing, inject and retry
      const response = await sendTabMessage(tabId, { type: "get-page-context" });
      return normalizePageContext(response);
    } catch (error) {
      console.warn("Context Capsule could not read page selection:", error);
      return normalizePageContext(null); // Return empty context if the page cannot be accessed
    }
  }
}

function queryTabs(queryInfo) { // Promise wrapper around chrome.tabs.query
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

function sendTabMessage(tabId, message) { // Promise wrapper around chrome.tabs.sendMessage
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

function executeScript(details) { // Promise wrapper around chrome.scripting.executeScript
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

function sendToNative(message) { // Open a native messaging port and send one request
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(HOST_NAME);
    let settled = false;
    // Resolve when the native host sends a response
    port.onMessage.addListener((response) => {
      settled = true;
      resolve(response);
      port.disconnect();
    });
    // Reject if the native host disconnects before sending a response
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (!settled) {
        reject(new Error(error ? error.message : "Native host disconnected before responding."));
      }
    });

    port.postMessage(message);
  });
}

function getLastStatus() { // Read the last capture status from Chrome Local Storage
  return new Promise((resolve) => {
    chrome.storage.local.get([LAST_STATUS_KEY], (items) => {
      resolve(items[LAST_STATUS_KEY] || null);
    });
  });
}

function saveLastStatus(status) { // Save the latest capture status to Chrome Local Storage
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_STATUS_KEY]: status }, () => resolve());
  });
}

function getStoredFormatMode() { // Load the stored format mode and normalize it
  return new Promise((resolve) => {
    chrome.storage.local.get([FORMAT_MODE_KEY], (items) => {
      resolve(normalizeFormatMode(items[FORMAT_MODE_KEY]));
    });
  });
}

function getStoredCaptureMode() { // Load the stored capture mode and normalize it
  return new Promise((resolve) => {
    chrome.storage.local.get([CAPTURE_MODE_KEY], (items) => {
      resolve(normalizeCaptureMode(items[CAPTURE_MODE_KEY]));
    });
  });
}

function getStoredTemplateId() { // Load the stored template preset and normalize it
  return new Promise((resolve) => {
    chrome.storage.local.get([TEMPLATE_ID_KEY], (items) => {
      resolve(normalizeTemplateId(items[TEMPLATE_ID_KEY]));
    });
  });
}

function getStoredHistoryLimit() { // Load the stored history limit and clamp it to a safe range
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_LIMIT_KEY], (items) => {
      resolve(normalizeHistoryLimit(items[HISTORY_LIMIT_KEY]));
    });
  });
}

function getStoredTimestampStyle() { // Load the stored timestamp display style and normalize it
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

function setStoredFormatMode(formatMode) { // Save the normalized format mode to Chrome Local Storage
  return new Promise((resolve) => {
    chrome.storage.local.set({ [FORMAT_MODE_KEY]: normalizeFormatMode(formatMode) }, () => resolve());
  });
}

function setStoredCaptureMode(captureMode) { // Save the normalized capture mode to Chrome Local Storage
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CAPTURE_MODE_KEY]: normalizeCaptureMode(captureMode) }, () => resolve());
  });
}

function setStoredTemplateId(templateId) { // Save the normalized template preset to Chrome Local Storage
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TEMPLATE_ID_KEY]: normalizeTemplateId(templateId) }, () => resolve());
  });
}

function normalizeFormatMode(formatMode) { // Accept only supported format modes
  const mode = String(formatMode || "markdown").toLowerCase();
  return ["markdown", "compact", "prompt"].includes(mode) ? mode : "markdown";
}

function normalizeCaptureMode(captureMode) { // Accept only supported capture modes
  const mode = String(captureMode || "smart").toLowerCase();
  return ["smart", "selection", "clipboard", "metadata", "visible", "readable"].includes(mode) ? mode : "smart";
}

function normalizeTemplateId(templateId) { // Accept only supported template presets
  const candidate = String(templateId || "none").toLowerCase();
  return ["none", "summarize", "debug", "explain", "notes"].includes(candidate) ? candidate : "none";
}

function normalizeTimestampStyle(timestampStyle) { // Accept only supported timestamp display styles
  const candidate = String(timestampStyle || "local").toLowerCase();
  return ["local", "iso", "date"].includes(candidate) ? candidate : "local";
}

function normalizeHistoryLimit(historyLimit) { // Convert history limit into a number between 5 and 100
  const parsed = Number.parseInt(historyLimit, 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.max(5, Math.min(100, parsed));
}

function normalizePageContext(response) { // Normalize the page context response from content script, ensuring all expected fields are present and of correct type
  return {
    selection: response && typeof response.selection === "string" ? response.selection : "",
    visibleText: response && typeof response.visibleText === "string" ? response.visibleText : "",
    readableText: response && typeof response.readableText === "string" ? response.readableText : ""
  };
}

function captureStatusMessage(captureMode, fallbackUsed) {  // Convert capture mode and fallback usage into a user friendly message
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

function failureStatus(error) { // Convert an error into a normalized failure status object
  return {
    ok: false,
    kind: "error",
    message: error && error.message ? error.message : String(error),
    timestamp: new Date().toISOString()
  };
}

async function flashBadge(text, color) { // Temporarily show a badge on the extension icon
  await setBadgeBackgroundColor(color);
  await setBadgeText(text);
  setTimeout(() => {
    setBadgeText("").catch(() => {});
  }, 1400);
}

function setBadgeText(text) { // Promise wrapper around chrome.action.setBadgeText
  return new Promise((resolve) => {
    chrome.action.setBadgeText({ text }, () => resolve());
  });
}

function setBadgeBackgroundColor(color) { // Promise wrapper around chrome.action.setBadgeBackgroundColor
  return new Promise((resolve) => {
    chrome.action.setBadgeBackgroundColor({ color }, () => resolve());
  });
}
