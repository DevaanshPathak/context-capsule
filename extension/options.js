const DEFAULTS = { // Default settings used when no saved prefrences exist
  captureMode: "smart",
  formatMode: "markdown",
  templateId: "none",
  historyLimit: 20,
  timestampStyle: "local",
  autoPinFallback: false
};

const captureMode = document.querySelector("#capture-mode"); // Get references to all settings form fields
const formatMode = document.querySelector("#format-mode");
const templateId = document.querySelector("#template-id");
const historyLimit = document.querySelector("#history-limit");
const timestampStyle = document.querySelector("#timestamp-style");
const autoPinFallback = document.querySelector("#auto-pin-fallback");
const form = document.querySelector("#settings-form"); // Get the settings form element
const resetButton = document.querySelector("#reset"); // Get the reset button element
const statusText = document.querySelector("#status"); // Get the status text element used for success or error messages

document.addEventListener("DOMContentLoaded", () => { // Wait until the settings DOM is ready before attaching logic
  loadSettings().catch(showError); // Load saved settings when the settings page opens
  form.addEventListener("submit", (event) => { // Save the form settings when the user submits the form
    event.preventDefault(); // Prevent the form from refreshing the page
    saveSettings(readForm()).catch(showError); // Read current form values and save then to Chrome local storage
  });
  resetButton.addEventListener("click", () => { // Reset all settings back to default values when the reset button is clicked
    saveSettings(DEFAULTS).catch(showError);
  });
});

async function loadSettings() { // Load settings from Chrome settings and apply them to form
  const settings = await chromeStorageGet(Object.keys(DEFAULTS)); // Read saved setting values using DEFAULTS keys
  writeForm({ ...DEFAULTS, ...settings }); // Merge saved settings with DEFAULTS and update the form fields
}

async function saveSettings(settings) { // Save settings to Chrome storage and refresh the form UI
  await chromeStorageSet(settings);
  writeForm(settings);
  statusText.textContent = "Settings saved.";
}

function readForm() { // Read and normalize current values from the settings form
  return {
    captureMode: captureMode.value,
    formatMode: formatMode.value,
    templateId: templateId.value,
    historyLimit: clampNumber(historyLimit.value, 5, 100, DEFAULTS.historyLimit), // Clamp history limit to a number between 5 and 100
    timestampStyle: timestampStyle.value,
    autoPinFallback: autoPinFallback.checked
  };
}

function writeForm(settings) { // Write a settings object in the form field
  captureMode.value = settings.captureMode || DEFAULTS.captureMode;
  formatMode.value = settings.formatMode || DEFAULTS.formatMode;
  templateId.value = settings.templateId || DEFAULTS.templateId;
  historyLimit.value = String(settings.historyLimit || DEFAULTS.historyLimit);
  timestampStyle.value = settings.timestampStyle || DEFAULTS.timestampStyle;
  autoPinFallback.checked = Boolean(settings.autoPinFallback);
}

function clampNumber(value, min, max, fallback) { // Parse a number and clamp it within a safe min/max range.
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function chromeStorageGet(keys) { // Promise wrapper for chrome.storage.local.get
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items || {}));
  });
}

function chromeStorageSet(values) { // Promise wrapper for chrome.storage.local.set
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

function showError(error) { // Display errors both in console and UI
  console.error(error);
  statusText.textContent = error.message || String(error);
}
