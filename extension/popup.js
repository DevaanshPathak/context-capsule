const DEFAULT_LIMIT = 20; // Default number of history shown in the popup

const captureButton = document.querySelector("#capture"); // Cache pop up UI elements used throughout the script
const captureModeSelect = document.querySelector("#capture-mode");
const capsuleAppendButton = document.querySelector("#capsule-append");
const capsuleClearButton = document.querySelector("#capsule-clear");
const capsuleCopyButton = document.querySelector("#capsule-copy");
const capsuleStartButton = document.querySelector("#capsule-start");
const capsuleStatus = document.querySelector("#capsule-status");
const clearButton = document.querySelector("#clear");
const exportAllButton = document.querySelector("#export-all");
const exportCapsuleButton = document.querySelector("#export-capsule");
const exportFormatSelect = document.querySelector("#export-format");
const exportVisibleButton = document.querySelector("#export-visible");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
const formatSelect = document.querySelector("#format-mode");
const diagnosticsList = document.querySelector("#diagnostics");
const dismissOnboardingButton = document.querySelector("#dismiss-onboarding");
const demoPromptButton = document.querySelector("#demo-prompt");
const historyList = document.querySelector("#history");
const latestSource = document.querySelector("#latest-source");
const labelFilterInput = document.querySelector("#label-filter");
const onboardingCard = document.querySelector("#onboarding");
const openDemoButton = document.querySelector("#open-demo");
const openLatestButton = document.querySelector("#open-latest");
const projectInput = document.querySelector("#project");
const refreshButton = document.querySelector("#refresh");
const refreshDiagnosticsButton = document.querySelector("#refresh-diagnostics");
const resultMeta = document.querySelector("#result-meta");
const resultMessage = document.querySelector("#result-message");
const resultPanel = document.querySelector("#last-result");
const searchInput = document.querySelector("#search");
const settingsButton = document.querySelector("#settings");
const statFallback = document.querySelector("#stat-fallback");
const statPinned = document.querySelector("#stat-pinned");
const statTotal = document.querySelector("#stat-total");
const statusText = document.querySelector("#status");
const tagInput = document.querySelector("#tag");
const templateSelect = document.querySelector("#template-id"); // Track current popup state for history, filters and latest source URL

let currentEntries = [];
let currentFilter = "all";
let historyLimit = DEFAULT_LIMIT;
let latestUrl = "";

document.addEventListener("DOMContentLoaded", () => { // Attach popup event listeners after the DOM is ready
  captureButton.addEventListener("click", () => {
    captureCurrentPage().catch(showError);
  });
  capsuleStartButton.addEventListener("click", () => {
    startCapsule().catch(showError);
  });
  dismissOnboardingButton.addEventListener("click", () => {
    dismissOnboarding().catch(showError);
  });
  openDemoButton.addEventListener("click", () => {
    openUrl("http://localhost:8765/demo.html");
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
  exportVisibleButton.addEventListener("click", () => {
    exportCaptures("visible").catch(showError);
  });
  exportAllButton.addEventListener("click", () => {
    exportCaptures("all").catch(showError);
  });
  exportCapsuleButton.addEventListener("click", () => {
    exportCaptures("capsule").catch(showError);
  });
  demoPromptButton.addEventListener("click", () => {
    copyDemoPrompt().catch(showError);
  });
  refreshButton.addEventListener("click", () => {
    refreshPopup().catch(showError);
  });
  refreshDiagnosticsButton.addEventListener("click", () => {
    loadDiagnostics().catch(showError);
  });
  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  formatSelect.addEventListener("change", () => {
    setFormatMode(formatSelect.value).catch(showError);
  });
  captureModeSelect.addEventListener("change", () => {
    setCaptureMode(captureModeSelect.value).catch(showError);
  });
  templateSelect.addEventListener("change", () => {
    setTemplateId(templateSelect.value).catch(showError);
  });
  searchInput.addEventListener("input", () => {
    renderHistory(currentEntries);
  });
  labelFilterInput.addEventListener("input", () => {
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

async function initializePopup() { // Initialize popup settings, onboarding state and captured history
  await loadOnboarding();
  const settings = await sendToBackground({ action: "get-settings" });
  if (settings && settings.ok === true && settings.format_mode) {
    formatSelect.value = settings.format_mode;
  }
  if (settings && settings.ok === true && settings.capture_mode) {
    captureModeSelect.value = settings.capture_mode;
  }
  if (settings && settings.ok === true && settings.template_id) {
    templateSelect.value = settings.template_id;
  }
  if (settings && settings.ok === true && settings.history_limit) {
    historyLimit = settings.history_limit;
  }
  await refreshPopup();
}

async function loadOnboarding() {
  const items = await chromeStorageGet(["onboardingDismissed"]);
  onboardingCard.hidden = Boolean(items.onboardingDismissed);
}

async function dismissOnboarding() {
  await chromeStorageSet({ onboardingDismissed: true });
  onboardingCard.hidden = true;
}

async function refreshPopup() { // Reload all popup data from the background/native host
  await Promise.all([loadLastStatus(), loadSummary(), loadCapsuleStatus(), loadHistory(), loadDiagnostics()]);
}

async function captureCurrentPage() { // Capture the current active page with selected popup options
  setBusy(true);
  setStatus("Capturing active page...");
  try {
    const response = await sendToBackground({
      action: "capture-active-tab",
      format_mode: formatSelect.value,
      capture_mode: captureModeSelect.value,
      template_id: templateSelect.value,
      project: projectInput.value,
      tag: tagInput.value
    });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "Capture failed.");
    }
    await refreshPopup();
  } finally {
    setBusy(false);
  }
}

async function appendCurrentPageToCapsule() { // Capture the active page and append it to the active capsule
  setBusy(true);
  setStatus("Appending current page...");
  try {
    const response = await sendToBackground({
      action: "capture-active-tab",
      format_mode: formatSelect.value,
      capture_mode: captureModeSelect.value,
      template_id: templateSelect.value,
      project: projectInput.value,
      tag: tagInput.value,
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

async function loadHistory() { // Load saved capture history and render it in the popup
  setStatus("Loading history...");
  const response = await sendToBackground({
    action: "history",
    limit: historyLimit
  });

  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not load history.");
  }

  currentEntries = response.entries || [];
  renderHistory(currentEntries);
  setStatus(currentEntries.length ? "History ready." : "No captures yet.");
}

async function loadDiagnostics() {
  const response = await sendToBackground({ action: "diagnostics", limit: 8 });
  if (!response || response.ok !== true) {
    return;
  }
  renderDiagnostics(response.entries || []);
}

function renderSummary(summary) { // Update dashboard stats and latest source link
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

function renderLastStatus(status) { // Render the latest capture result or error message
  resultPanel.classList.toggle("error", Boolean(status && status.ok === false));

  if (!status) {
    resultMessage.textContent = "Ready.";
    resultMeta.textContent = "";
    return;
  }

  resultMessage.textContent = status.message || (status.ok ? "Copied to clipboard." : "Capture failed.");
  resultMeta.textContent = statusMeta(status);
}

function renderCapsule(capsule) { // Update active capsule status and enable/disable capsule actions
  if (!capsule) {
    capsuleStatus.textContent = "No active capsule.";
    capsuleCopyButton.disabled = true;
    capsuleClearButton.disabled = true;
    return;
  }

  const labels = [capsule.project ? `project: ${capsule.project}` : "", capsule.tag ? `tag: ${capsule.tag}` : ""]
    .filter(Boolean)
    .join(" - ");
  capsuleStatus.textContent = `${capsule.title} - ${capsule.item_count || 0} captures${labels ? ` - ${labels}` : ""}`;
  capsuleCopyButton.disabled = !capsule.item_count;
  capsuleClearButton.disabled = false;
}

function renderHistory(entries) { // Render filtered history entries with copy/open/pin/delete actions
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

function renderDiagnostics(entries) { // Render recent diagnostic messages from the native host
  diagnosticsList.replaceChildren();
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No diagnostics yet.";
    diagnosticsList.append(item);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `diagnostic-entry ${entry.level === "error" ? "error" : ""}`;
    item.append(
      textNode("strong", "", `${entry.level || "info"} - ${entry.message || ""}`),
      textNode("span", "", entry.context ? `${entry.created_at} - ${entry.context}` : entry.created_at || "")
    );
    diagnosticsList.append(item);
  }
}

function filterEntries(entries) { // Apply search, label, pinned and fallback filters to the history entries
  const query = searchInput.value.trim().toLowerCase();
  const labelQuery = labelFilterInput.value.trim().toLowerCase();
  return entries.filter((entry) => {
    if (currentFilter === "pinned" && !entry.pinned) {
      return false;
    }
    if (currentFilter === "fallback" && !entry.fallback_used) {
      return false;
    }
    if (!query) {
      return matchesLabelFilter(entry, labelQuery);
    }
    const matchesQuery = [entry.title, entry.url, entry.preview, entry.format_mode, entry.capture_mode, entry.template_id]
      .join(" ")
      .toLowerCase()
      .includes(query);
    return matchesQuery && matchesLabelFilter(entry, labelQuery);
  });
}

function matchesLabelFilter(entry, labelQuery) {
  if (!labelQuery) {
    return true;
  }
  return [entry.project, entry.tag].join(" ").toLowerCase().includes(labelQuery);
}

async function recopyEntry(entryId) { // Copy a saved history entry back to the clipboard
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

async function startCapsule() { // Start a new capsule using current project/tag values
  const response = await sendToBackground({
    action: "capsule_start",
    project: projectInput.value,
    tag: tagInput.value
  });
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

async function pinEntry(entryId, pinned) { // Pin or unpin a saved capture entry
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

async function clearHistory() { // Clear all saved captures after user confirmation
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

async function exportCaptures(target) { // Export captures based on the selected target and format
  const response = await sendToBackground({
    action: "export",
    target,
    format: exportFormatSelect.value,
    ids: target === "visible" ? filterEntries(currentEntries).map((entry) => entry.id) : []
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not export captures.");
  }
  setStatus(`Exported ${response.count || 0} item${response.count === 1 ? "" : "s"} as ${response.format}.`);
}

async function copyDemoPrompt() { // Copy a demo prompt generated from saved captures
  const response = await sendToBackground({ action: "demo_prompt" });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not copy demo prompt.");
  }
  setStatus(`Copied demo prompt from ${response.source} (${response.count || 0} items).`);
  await loadDiagnostics();
}

async function setFormatMode(formatMode) { // Save the selected output format mode
  const response = await sendToBackground({
    action: "set-format-mode",
    format_mode: formatMode
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not save format.");
  }
}

async function setCaptureMode(captureMode) { // Save the selected capture mode
  const response = await sendToBackground({
    action: "set-capture-mode",
    capture_mode: captureMode
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not save capture mode.");
  }
}

async function setTemplateId(templateId) { // Save the selected template preset
  const response = await sendToBackground({
    action: "set-template-id",
    template_id: templateId
  });
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : "Could not save template.");
  }
}

function sendToBackground(payload) { // Send popup actions to the background script
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

function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items || {}));
  });
}

function chromeStorageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

function actionButton(label, onClick) { // Create an action button that safely handles async errors
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

function entryMeta(entry) { // Build metadata text shown under each history entry
  const parts = [entry.captured_at || "Unknown time", entry.capture_mode || "smart", entry.format_mode || "markdown"];
  if (entry.template_id && entry.template_id !== "none") {
    parts.push(entry.template_id);
  }
  if (entry.project) {
    parts.push(`project: ${entry.project}`);
  }
  if (entry.tag) {
    parts.push(`tag: ${entry.tag}`);
  }
  if (entry.fallback_used) {
    parts.push("clipboard fallback");
  }
  return parts.join(" - ");
}

function statusMeta(status) { // Build metadata text for the latest capture status panel
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
  if (status.template_id && status.template_id !== "none") {
    parts.push(status.template_id);
  }
  if (status.project) {
    parts.push(`project: ${status.project}`);
  }
  if (status.tag) {
    parts.push(`tag: ${status.tag}`);
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

function setBusy(isBusy) { // Disable capture actions while a capture is running
  captureButton.disabled = isBusy;
  capsuleAppendButton.disabled = isBusy;
}

function showError(error) { // Show results in the result panel and status bar
  console.error(error);
  renderLastStatus({
    ok: false,
    message: error.message || String(error),
    timestamp: new Date().toISOString()
  });
  setStatus("Action failed.");
}
