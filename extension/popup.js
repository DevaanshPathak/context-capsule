const DEFAULT_LIMIT = 20;

const captureButton = document.querySelector("#capture");
const captureModeSelect = document.querySelector("#capture-mode");
const capsuleAppendButton = document.querySelector("#capsule-append");
const capsuleClearButton = document.querySelector("#capsule-clear");
const capsuleCopyButton = document.querySelector("#capsule-copy");
const capsuleStartButton = document.querySelector("#capsule-start");
const capsuleStatus = document.querySelector("#capsule-status");
const clearButton = document.querySelector("#clear");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
const formatSelect = document.querySelector("#format-mode");
const historyList = document.querySelector("#history");
const latestSource = document.querySelector("#latest-source");
const openLatestButton = document.querySelector("#open-latest");
const refreshButton = document.querySelector("#refresh");
const resultMeta = document.querySelector("#result-meta");
const resultMessage = document.querySelector("#result-message");
const resultPanel = document.querySelector("#last-result");
const searchInput = document.querySelector("#search");
const statFallback = document.querySelector("#stat-fallback");
const statPinned = document.querySelector("#stat-pinned");
const statTotal = document.querySelector("#stat-total");
const statusText = document.querySelector("#status");

let currentEntries = [];
let currentFilter = "all";
let latestUrl = "";

document.addEventListener("DOMContentLoaded", () => {
  captureButton.addEventListener("click", () => {
    captureCurrentPage().catch(showError);
  });
  capsuleStartButton.addEventListener("click", () => {
    startCapsule().catch(showError);
  });
  capsuleAppendButton.addEventListener("click", () => {
    appendCurrentPageToCapsule().catch(showError);
  });
  capsuleCopyButton.addEventListener("click", () => {
    copyCapsule().catch(showError);
  });
  capsuleClearButton.addEventListener("click", () => {
    clearCapsule().catch(showError);
  });
  clearButton.addEventListener("click", () => {
    clearHistory().catch(showError);
  });
  refreshButton.addEventListener("click", () => {
    refreshPopup().catch(showError);
  });
  formatSelect.addEventListener("change", () => {
    setFormatMode(formatSelect.value).catch(showError);
  });
  captureModeSelect.addEventListener("change", () => {
    setCaptureMode(captureModeSelect.value).catch(showError);
  });
  searchInput.addEventListener("input", () => {
    renderHistory(currentEntries);
  });
  openLatestButton.addEventListener("click", () => {
    openUrl(latestUrl);
  });
  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";
      updateActiveFilter();
      renderHistory(currentEntries);
    });
  }

  initializePopup().catch(showError);
});

async function initializePopup() {
  const settings = await sendToBackground({ action: "get-settings" });
  if (settings && settings.ok === true && settings.format_mode) {
    formatSelect.value = settings.format_mode;
  }
  if (settings && settings.ok === true && settings.capture_mode) {
    captureModeSelect.value = settings.capture_mode;
  }
  await refreshPopup();
}

async function refreshPopup() {
  await Promise.all([loadLastStatus(), loadSummary(), loadCapsuleStatus(), loadHistory()]);
}

async function captureCurrentPage() {
  setBusy(true);
  setStatus("Capturing active page...");
  try {
    const response = await sendToBackground({
      action: "capture-active-tab",
      format_mode: formatSelect.value,
      capture_mode: captureModeSelect.value
    });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "Capture failed.");
    }
    await refreshPopup();
  } finally {
    setBusy(false);
  }
}

async function appendCurrentPageToCapsule() {
  setBusy(true);
  setStatus("Appending current page...");
  try {
    const response = await sendToBackground({
      action: "capture-active-tab",
      format_mode: formatSelect.value,
      capture_mode: captureModeSelect.value,
      append_to_capsule: true
    });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "Append failed.");
    }
    await refreshPopup();
  } finally {
    setBusy(false);
  }
}

async function loadLastStatus() {
  const response = await sendToBackground({ action: "last-status" });
  if (!response || response.ok !== true) {
    return;
  }
  renderLastStatus(response.status);
}

async function loadCapsuleStatus() {
  const response = await sendToBackground({ action: "capsule_status" });
  if (!response || response.ok !== true) {
    return;
  }
  renderCapsule(response.capsule);
}

async function loadSummary() {
  const response = await sendToBackground({ action: "summary" });
  if (!response || response.ok !== true) {
    return;
  }
  renderSummary(response.summary || {});
}

async function loadHistory() {
  setStatus("Loading history...");
  const response = await sendToBackground({
    action: "history",
    limit: DEFAULT_LIMIT
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not load history.");
  }

  currentEntries = response.entries || [];
  renderHistory(currentEntries);
  setStatus(currentEntries.length ? "History ready." : "No captures yet.");
}

function renderSummary(summary) {
  statTotal.textContent = String(summary.total || 0);
  statPinned.textContent = String(summary.pinned || 0);
  statFallback.textContent = String(summary.fallback_used || 0);

  const latest = summary.latest || null;
  latestUrl = latest && latest.url ? latest.url : "";
  latestSource.hidden = !latestUrl;
  if (latestUrl) {
    const label = latest.title || hostFromUrl(latestUrl) || "Latest source";
    latestSource.querySelector("span").textContent = `${label} - ${latest.captured_at || "recent"}`;
  }
}

function renderLastStatus(status) {
  resultPanel.classList.toggle("error", Boolean(status && status.ok === false));

  if (!status) {
    resultMessage.textContent = "Ready.";
    resultMeta.textContent = "";
    return;
  }

  resultMessage.textContent = status.message || (status.ok ? "Copied to clipboard." : "Capture failed.");
  resultMeta.textContent = statusMeta(status);
}

function renderCapsule(capsule) {
  if (!capsule) {
    capsuleStatus.textContent = "No active capsule.";
    capsuleCopyButton.disabled = true;
    capsuleClearButton.disabled = true;
    return;
  }

  capsuleStatus.textContent = `${capsule.title} - ${capsule.item_count || 0} captures`;
  capsuleCopyButton.disabled = !capsule.item_count;
  capsuleClearButton.disabled = false;
}

function renderHistory(entries) {
  historyList.replaceChildren();
  const visibleEntries = filterEntries(entries);

  if (!visibleEntries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty";
    emptyItem.textContent = entries.length ? "No matching captures." : "No captures yet.";
    historyList.append(emptyItem);
    return;
  }

  for (const entry of visibleEntries) {
    const item = document.createElement("li");
    item.className = "history-item";
    if (entry.pinned) {
      item.dataset.pinned = "true";
    }

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "entry-copy";
    copyButton.title = "Copy this capture";
    copyButton.addEventListener("click", () => {
      recopyEntry(entry.id).catch(showError);
    });
    copyButton.append(
      textNode("span", "entry-title", `${entry.pinned ? "Pinned - " : ""}${entry.title || hostFromUrl(entry.url) || "Untitled page"}`),
      textNode("span", "entry-meta", entryMeta(entry)),
      textNode("span", "entry-preview", entry.preview || "(empty capture)")
    );

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    actions.append(
      actionButton("Copy", () => recopyEntry(entry.id)),
      actionButton("Open", () => openUrl(entry.url)),
      actionButton(entry.pinned ? "Unpin" : "Pin", () => pinEntry(entry.id, !entry.pinned)),
      actionButton("Delete", () => deleteEntry(entry.id))
    );

    item.append(copyButton, actions);
    historyList.append(item);
  }
}

function filterEntries(entries) {
  const query = searchInput.value.trim().toLowerCase();
  return entries.filter((entry) => {
    if (currentFilter === "pinned" && !entry.pinned) {
      return false;
    }
    if (currentFilter === "fallback" && !entry.fallback_used) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [entry.title, entry.url, entry.preview, entry.format_mode]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

async function recopyEntry(entryId) {
  const response = await sendToBackground({
    action: "recopy",
    id: entryId
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not copy capture.");
  }

  await loadLastStatus();
  setStatus("Copied history entry.");
}

async function startCapsule() {
  const response = await sendToBackground({ action: "capsule_start" });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not start capsule.");
  }
  renderCapsule(response.capsule);
  setStatus("Started a new capsule.");
}

async function copyCapsule() {
  const response = await sendToBackground({ action: "capsule_copy" });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not copy capsule.");
  }
  renderCapsule(response.capsule);
  setStatus("Copied active capsule.");
}

async function clearCapsule() {
  const response = await sendToBackground({ action: "capsule_clear" });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not clear capsule.");
  }
  renderCapsule(null);
  setStatus(`Cleared ${response.deleted || 0} capsule items.`);
}

async function pinEntry(entryId, pinned) {
  const response = await sendToBackground({
    action: "pin",
    id: entryId,
    pinned
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not update pin.");
  }

  await Promise.all([loadSummary(), loadHistory()]);
}

async function deleteEntry(entryId) {
  const response = await sendToBackground({
    action: "delete",
    id: entryId
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not delete capture.");
  }

  await Promise.all([loadSummary(), loadHistory()]);
}

async function clearHistory() {
  if (!window.confirm("Clear all saved captures?")) {
    return;
  }

  const response = await sendToBackground({ action: "clear" });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not clear history.");
  }

  currentEntries = [];
  renderHistory([]);
  renderSummary({ total: 0, pinned: 0, fallback_used: 0 });
  setStatus(`Cleared ${response.deleted || 0} captures.`);
}

async function setFormatMode(formatMode) {
  const response = await sendToBackground({
    action: "set-format-mode",
    format_mode: formatMode
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not save format.");
  }
}

async function setCaptureMode(captureMode) {
  const response = await sendToBackground({
    action: "set-capture-mode",
    capture_mode: captureMode
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not save capture mode.");
  }
}

function sendToBackground(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ source: "context-capsule-popup", payload }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function actionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick().catch(showError);
  });
  return button;
}

function openUrl(url) {
  if (!url) {
    setStatus("No source URL saved.");
    return;
  }
  chrome.tabs.create({ url });
}

function updateActiveFilter() {
  for (const button of filterButtons) {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  }
}

function textNode(tagName, className, value) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = value;
  return element;
}

function entryMeta(entry) {
  const parts = [entry.captured_at || "Unknown time", entry.capture_mode || "smart", entry.format_mode || "markdown"];
  if (entry.fallback_used) {
    parts.push("clipboard fallback");
  }
  return parts.join(" - ");
}

function statusMeta(status) {
  const parts = [];
  if (status.captured_at) {
    parts.push(status.captured_at);
  }
  if (status.format_mode) {
    parts.push(status.format_mode);
  }
  if (status.capture_mode) {
    parts.push(status.capture_mode);
  }
  if (status.fallback_used) {
    parts.push("clipboard fallback");
  }
  if (!parts.length && status.timestamp) {
    parts.push(new Date(status.timestamp).toLocaleString());
  }
  return parts.join(" - ");
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch (_error) {
    return "";
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function setBusy(isBusy) {
  captureButton.disabled = isBusy;
  capsuleAppendButton.disabled = isBusy;
}

function showError(error) {
  console.error(error);
  renderLastStatus({
    ok: false,
    message: error.message || String(error),
    timestamp: new Date().toISOString()
  });
  setStatus("Action failed.");
}
