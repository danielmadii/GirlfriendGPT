// src/popup.js

const $ = (id) => document.getElementById(id);

async function init() {
  const data = await storageGet([
    'enabled', 'paused', 'autoSend', 'allowedChat', 'apiKey', 'lastReply', 'lastReplyRisk'
  ]);

  $('toggleEnabled').checked = !!data.enabled;
  $('togglePaused').checked = !!data.paused;
  $('toggleAutoSend').checked = !!data.autoSend;
  $('allowedChatInput').value = data.allowedChat || '';

  if (data.lastReply) {
    setLastReply(data.lastReply, data.lastReplyRisk || '');
  }

  updateAutoSendWarning(!!data.autoSend);
  await updateStatus(data);
}

function setLastReply(reply, risk) {
  const el = $('lastReply');
  el.classList.add('has-reply');
  const badge = risk
    ? `<span class="risk-badge ${risk}">${risk}</span>`
    : '';
  el.innerHTML = escapeHtml(reply) + badge;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function updateStatus(data) {
  const dot = $('statusDot');
  const text = $('statusText');

  if (!data.apiKey) {
    dot.className = 'status-dot error';
    text.textContent = '⚠ Missing API key — open Settings';
    return;
  }
  if (!data.enabled) {
    dot.className = 'status-dot disabled';
    text.textContent = 'Disabled';
    return;
  }
  if (data.paused) {
    dot.className = 'status-dot paused';
    text.textContent = 'Paused';
    return;
  }
  if (!data.allowedChat) {
    dot.className = 'status-dot error';
    text.textContent = '⚠ No allowed chat set';
    return;
  }

  dot.className = 'status-dot active';
  text.textContent = `Active — watching "${data.allowedChat}"`;
}

function updateAutoSendWarning(on) {
  $('autoSendWarning').style.display = on ? 'block' : 'none';
}

$('toggleAutoSend').addEventListener('change', (e) => {
  updateAutoSendWarning(e.target.checked);
});

$('saveBtn').addEventListener('click', async () => {
  const settings = {
    enabled: $('toggleEnabled').checked,
    paused: $('togglePaused').checked,
    autoSend: $('toggleAutoSend').checked,
    allowedChat: $('allowedChatInput').value.trim(),
  };

  await storageSet(settings);

  const btn = $('saveBtn');
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = 'Save'; }, 1500);

  await updateStatus({ ...(await storageGet(['apiKey'])), ...settings });
});

$('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastReply) {
    const reply = changes.lastReply.newValue;
    const risk = changes.lastReplyRisk?.newValue || '';
    if (reply) setLastReply(reply, risk);
  }
});

init();
