const DEFAULTS = {
  captureMode: "smart",
  formatMode: "markdown",
  templateId: "none",
  historyLimit: 20,
  timestampStyle: "local",
  autoPinFallback: false
};

const captureMode = document.querySelector("#capture-mode");
const formatMode = document.querySelector("#format-mode");
const templateId = document.querySelector("#template-id");
const historyLimit = document.querySelector("#history-limit");
const timestampStyle = document.querySelector("#timestamp-style");
const autoPinFallback = document.querySelector("#auto-pin-fallback");
const form = document.querySelector("#settings-form");
const resetButton = document.querySelector("#reset");
const statusText = document.querySelector("#status");

document.addEventListener("DOMContentLoaded", () => {
  loadSettings().catch(showError);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings(readForm()).catch(showError);
  });
  resetButton.addEventListener("click", () => {
    saveSettings(DEFAULTS).catch(showError);
  });
});

async function loadSettings() {
  const settings = await chromeStorageGet(Object.keys(DEFAULTS));
  writeForm({ ...DEFAULTS, ...settings });
}

async function saveSettings(settings) {
  await chromeStorageSet(settings);
  writeForm(settings);
  statusText.textContent = "Settings saved.";
}

function readForm() {
  return {
    captureMode: captureMode.value,
    formatMode: formatMode.value,
    templateId: templateId.value,
    historyLimit: clampNumber(historyLimit.value, 5, 100, DEFAULTS.historyLimit),
    timestampStyle: timestampStyle.value,
    autoPinFallback: autoPinFallback.checked
  };
}

function writeForm(settings) {
  captureMode.value = settings.captureMode || DEFAULTS.captureMode;
  formatMode.value = settings.formatMode || DEFAULTS.formatMode;
  templateId.value = settings.templateId || DEFAULTS.templateId;
  historyLimit.value = String(settings.historyLimit || DEFAULTS.historyLimit);
  timestampStyle.value = settings.timestampStyle || DEFAULTS.timestampStyle;
  autoPinFallback.checked = Boolean(settings.autoPinFallback);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
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

function showError(error) {
  console.error(error);
  statusText.textContent = error.message || String(error);
}
