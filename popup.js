const DEFAULTS = {
  batchSize: 8,
  delaySeconds: 10,
  running: false
};

const fields = {
  batchSize: document.querySelector("#batchSize"),
  delaySeconds: document.querySelector("#delaySeconds"),
  state: document.querySelector("#state"),
  status: document.querySelector("#status"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  countdown: document.querySelector("#countdown"),
  countdownValue: document.querySelector("#countdownValue")
};

let countdownInterval = null;
let currentNextActionAt = null;

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function saveOptions(running) {
  const options = {
    batchSize: clampNumber(fields.batchSize.value, 1, 20, DEFAULTS.batchSize),
    delaySeconds: clampNumber(fields.delaySeconds.value, 4, 600, DEFAULTS.delaySeconds),
    running
  };
  await chrome.storage.local.set(options);
  return options;
}

async function sendToPage(message) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.startsWith("https://www.instagram.com/your_activity/interactions/comments")) {
    throw new Error("Open the Instagram comments page.");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

function renderState(options) {
  fields.batchSize.value = options.batchSize;
  fields.delaySeconds.value = options.delaySeconds;
  fields.state.textContent = options.running ? "running" : "stopped";
  fields.state.classList.toggle("running", options.running);
}

function showCountdown(show) {
  fields.countdown.classList.toggle("hidden", !show);
}

function updateCountdownDisplay() {
  if (!currentNextActionAt) {
    fields.countdownValue.textContent = "--";
    return;
  }
  const remainingMs = currentNextActionAt - Date.now();
  const remaining = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  fields.countdownValue.textContent = remaining;
}

async function refreshStateFromPage() {
  try {
    const response = await sendToPage({ type: "ICC_GET_STATE" });
    if (response?.running && response.nextActionAt) {
      currentNextActionAt = response.nextActionAt;
      showCountdown(true);
      updateCountdownDisplay();
      return true;
    }
  } catch (error) {
    // Tab not ready (not the comments page, content script not loaded, etc.)
  }
  currentNextActionAt = null;
  showCountdown(false);
  return false;
}

function startCountdownLoop() {
  stopCountdownLoop();
  refreshStateFromPage();
  countdownInterval = setInterval(async () => {
    updateCountdownDisplay();
    // Re-sync with the content script every ~5s or when the countdown
    // hits zero, so we pick up the next batch's nextActionAt.
    if (!currentNextActionAt || Date.now() >= currentNextActionAt) {
      await refreshStateFromPage();
    }
  }, 1000);
}

function stopCountdownLoop() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  currentNextActionAt = null;
  showCountdown(false);
}

async function refresh() {
  const options = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  renderState(options);
  if (options.running) {
    startCountdownLoop();
  } else {
    stopCountdownLoop();
  }
}

fields.start.addEventListener("click", async () => {
  fields.status.textContent = "Starting...";
  try {
    const options = await saveOptions(true);
    renderState(options);
    await sendToPage({ type: "ICC_START", options });
    fields.status.textContent = "Running on this tab. Keep the page open.";
    startCountdownLoop();
  } catch (error) {
    await chrome.storage.local.set({ running: false });
    await refresh();
    fields.status.textContent = error.message;
  }
});

fields.stop.addEventListener("click", async () => {
  fields.status.textContent = "Stopping...";
  const options = await saveOptions(false);
  renderState(options);
  try {
    await sendToPage({ type: "ICC_STOP" });
    fields.status.textContent = "Automation stopped.";
  } catch (error) {
    fields.status.textContent = "Automation stopped for next cycles.";
  }
  stopCountdownLoop();
});

refresh();
