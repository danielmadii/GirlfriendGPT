// src/content.js
// Injected into WhatsApp Web.

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  lastProcessedId: null,
  isProcessing: false,
  observer: null,
  chatObserver: null,
  currentChat: null,
  lastReplyTime: 0,
};

const COOLDOWN_MS = 4000;
const CONTEXT_MESSAGES = 10;
const REINIT_DELAY_MS = 2500;

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  log('WhatsApp AI Assistant initializing...');
  attachChatSwitchObserver();
  attachMessageObserver();

  chrome.storage.local.get(null, (data) => {
    log('Current settings:', {
      enabled: data.enabled,
      paused: data.paused,
      allowedChat: data.allowedChat,
      hasApiKey: !!data.apiKey,
    });
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (!isContextValid()) return;
  log('Settings changed:', Object.fromEntries(
    Object.entries(changes).map(([k, v]) => [k, v.newValue])
  ));
});

// ─── CHAT SWITCH OBSERVER ─────────────────────────────────────────────────────

function attachChatSwitchObserver() {
  const target = document.querySelector('#app') || document.body;

  state.chatObserver = new MutationObserver(debounce(() => {
    const newTitle = getActiveChatTitle();
    if (newTitle && newTitle !== state.currentChat) {
      log('Chat switched to:', newTitle);
      state.currentChat = newTitle;
      state.lastProcessedId = null;
      setTimeout(attachMessageObserver, REINIT_DELAY_MS);
    }
  }, 500));

  state.chatObserver.observe(target, { childList: true, subtree: true });
}

// ─── MESSAGE OBSERVER ─────────────────────────────────────────────────────────

function attachMessageObserver() {
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }

  const container = getMessageListContainer();
  if (!container) {
    log('Message container not found, retrying in 3s...');
    setTimeout(attachMessageObserver, 3000);
    return;
  }

  state.observer = new MutationObserver(debounce(onMessagesMutated, 800));
  state.observer.observe(container, { childList: true, subtree: true });
  log('Message observer attached to:', container);
}

async function onMessagesMutated() {
  // Always fetch fresh settings from storage
  const settings = await storageGet([
    'enabled', 'paused', 'allowedChat', 'autoSend', 'safetyMode'
  ]);

  if (!settings.enabled) { log('Assistant disabled.'); return; }
  if (settings.paused) { log('Assistant paused.'); return; }
  if (state.isProcessing) { log('Already processing.'); return; }

  const now = Date.now();
  if (now - state.lastReplyTime < COOLDOWN_MS) return;

  const currentTitle = getActiveChatTitle();
  if (!currentTitle) { log('Could not read chat title.'); return; }

  const allowedChat = (settings.allowedChat || '').trim().toLowerCase();
  if (!allowedChat) { log('No allowed chat configured.'); return; }

  const titleLower = currentTitle.toLowerCase();
  if (!titleLower.includes(allowedChat) && !allowedChat.includes(titleLower)) {
    log(`Chat mismatch: "${currentTitle}" != "${settings.allowedChat}"`);
    return;
  }

  const lastIncoming = getLastIncomingMessage();
  if (!lastIncoming) { log('No incoming message found.'); return; }

  const { messageId, text } = lastIncoming;

  if (messageId && messageId === state.lastProcessedId) {
    log('Already processed:', messageId);
    return;
  }

  log('▶ Incoming message:', text, '| id:', messageId);

  state.isProcessing = true;
  state.lastProcessedId = messageId;
  state.lastReplyTime = now;

  try {
    const recentContext = getRecentContext(CONTEXT_MESSAGES);

    const result = await sendMessage({
      type: 'GENERATE_REPLY',
      payload: { incomingMessage: text, recentContext, chatTitle: currentTitle },
    });

    if (result?.error) { logError('Reply error:', result.error); return; }
    if (!result?.reply) { log('Empty reply. Result:', result); return; }

    log('✅ Reply:', result.reply, '| risk:', result.risk_level);

    if (isContextValid()) {
      chrome.storage.local.set({ lastReply: result.reply, lastReplyRisk: result.risk_level });
    }

    await insertTextIntoInput(result.reply);

    if (result.can_auto_send) {
      await sleep(400);
      await clickSendButton();
      log('Auto-sent.');
    } else {
      log('Draft inserted. Not auto-sending. Reason:', result.reason);
    }
  } catch (err) {
    logError('Error:', err.message || err);
  } finally {
    state.isProcessing = false;
  }
}

// ─── WHATSAPP DOM ─────────────────────────────────────────────────────────────

function getActiveChatTitle() {
  const selectors = [
    '[data-testid="conversation-info-header-chat-title"] span[dir]',
    '[data-testid="conversation-info-header-chat-title"] span',
    '[data-testid="conversation-info-header-chat-title"]',
    '#main header span[dir="auto"]:not(:empty)',
    '#main header [data-testid="chat-title-container"] span',
    '#main header span[dir]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.getAttribute('title') || el.textContent || '').trim();
        if (text) return text;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function getMessageListContainer() {
  const selectors = [
    '[data-testid="conversation-panel-messages"]',
    '#main [role="application"]',
    '#main [data-tab="8"]',
    '#main .copyable-area',
    '#main',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Detect if a message element is outgoing by checking for send-status icons.
 * Outgoing messages ALWAYS have a status icon (clock/single tick/double tick).
 * Incoming messages NEVER have them. Works on all WhatsApp versions.
 */
function hasStatusIcon(el) {
  return !!el.querySelector(
    '[data-icon="msg-check"],[data-icon="msg-dblcheck"],[data-icon="msg-time"],' +
    '[data-icon="msg-read"],[data-icon="msg-missed-check"],' +
    '[data-testid="msg-dblcheck"],[data-testid="msg-check"],[data-testid="msg-time"]'
  );
}

/**
 * Determine if a message row is incoming.
 * Uses data-id prefix first (old WA), then status icons (all versions).
 */
function detectIsIncoming(el) {
  const dataId = el.getAttribute('data-id') || el.closest('[data-id]')?.getAttribute('data-id') || '';
  if (dataId.startsWith('false_')) return true;
  if (dataId.startsWith('true_')) return false;
  // Modern WA: outgoing = has status icon, incoming = no status icon
  return !hasStatusIcon(el);
}

function getAllMessages() {
  const results = [];

  // Primary: [data-id] rows with combined detection
  const rows = [...document.querySelectorAll('[data-id]')];
  if (rows.length > 0) {
    for (const row of rows) {
      const dataId = row.getAttribute('data-id') || '';
      const isIncoming = detectIsIncoming(row);
      const text = extractText(row);
      if (text) results.push({ element: row, text, isIncoming, messageId: dataId || `hash_${simpleHash(text)}` });
    }
    if (results.length > 0) {
      log(`getAllMessages: ${results.length} total, ${results.filter(m => m.isIncoming).length} incoming`);
      return results;
    }
  }

  // Fallback 1: data-pre-plain-text bubbles
  const bubbles = [...document.querySelectorAll('[data-pre-plain-text]')];
  if (bubbles.length > 0) {
    for (const el of bubbles) {
      const text = extractText(el);
      if (!text) continue;
      const id = `pre_${simpleHash(text + (el.getAttribute('data-pre-plain-text') || ''))}`;
      results.push({ element: el, text, isIncoming: !hasStatusIcon(el), messageId: id });
    }
    if (results.length > 0) {
      log(`getAllMessages: ${results.length} via data-pre-plain-text`);
      return results;
    }
  }

  // Fallback 2: msg-container
  const containers = [...document.querySelectorAll('[data-testid="msg-container"]')];
  for (const el of containers) {
    const row = el.closest('[data-id]') || el;
    const dataId = row.getAttribute('data-id') || '';
    const text = extractText(el);
    if (text) {
      results.push({ element: el, text, isIncoming: detectIsIncoming(row), messageId: dataId || `hash_${simpleHash(text)}` });
    }
  }

  log(`getAllMessages: ${results.length} via msg-container fallback`);
  return results;
}


function extractText(el) {
  const selectors = [
    '[data-testid="msg-text"] span[dir]',
    '[data-testid="msg-text"] span',
    '[data-testid="msg-text"]',
    'span.selectable-text span[dir]',
    'span.selectable-text',
    '.copyable-text span[dir]',
    '.copyable-text',
    'span[dir="ltr"]:not(:empty)',
    'span[dir="rtl"]:not(:empty)',
    'span[dir="auto"]:not(:empty)',
  ];
  for (const sel of selectors) {
    try {
      const t = el.querySelector(sel);
      const text = t?.textContent?.trim();
      if (text && text.length > 0 && text.length < 2000) return text;
    } catch { /* ignore */ }
  }
  return null;
}

function getLastIncomingMessage() {
  const all = getAllMessages();
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].isIncoming && all[i].text) return all[i];
  }
  return null;
}

function getRecentContext(n) {
  return getAllMessages().slice(-n).map(m => ({
    role: m.isIncoming ? 'them' : 'me',
    text: m.text,
  }));
}

function getMessageInputElement() {
  const selectors = [
    '[data-testid="conversation-compose-box-input"]',
    'footer [contenteditable="true"]',
    '[contenteditable="true"][data-tab="10"]',
    '[contenteditable="true"][data-tab="6"]',
    '#main footer [contenteditable]',
    '#main [contenteditable="true"]',
    '[contenteditable="true"][spellcheck]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* ignore */ }
  }
  return null;
}

async function insertTextIntoInput(text) {
  const inputEl = getMessageInputElement();
  if (!inputEl) throw new Error('WhatsApp input box not found.');

  inputEl.focus();
  await sleep(60);

  // Clear
  inputEl.textContent = '';
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(80);

  // Insert via execCommand (works for React contenteditable in Chrome)
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    // Manual fallback
    inputEl.textContent = text;
    inputEl.dispatchEvent(new InputEvent('input', {
      bubbles: true, data: text, inputType: 'insertText',
    }));
  }
  await sleep(150);
}

async function clickSendButton() {
  const selectors = [
    '[data-testid="compose-btn-send"]',
    '[data-testid="send"]',
    'button[aria-label="Send"]',
    'button[aria-label="إرسال"]',
    'footer [data-icon="send"]',
    '[data-icon="send"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) { (el.closest('button') || el).click(); return true; }
    } catch { /* ignore */ }
  }
  // Enter fallback
  const input = getMessageInputElement();
  if (input) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
    }));
    return true;
  }
  return false;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// Check if the extension context is still valid before any chrome API call.
// When the extension is reloaded, the old content script becomes a zombie —
// chrome.storage throws "Extension context invalidated". We detect this and
// cleanly shut down the observers so no more errors flood the console.
function isContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function shutdownGracefully() {
  try { state.observer?.disconnect(); } catch { /* ignore */ }
  try { state.chatObserver?.disconnect(); } catch { /* ignore */ }
  state.observer = null;
  state.chatObserver = null;
  console.warn('[WA AI Assistant] Extension context invalidated — observers stopped. Reload the WhatsApp tab to restart.');
}

function storageGet(keys) {
  if (!isContextValid()) { shutdownGracefully(); return Promise.resolve({}); }
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          shutdownGracefully();
          resolve({});
        } else {
          resolve(result);
        }
      });
    } catch (e) {
      shutdownGracefully();
      resolve({});
    }
  });
}

function sendMessage(msg) {
  if (!isContextValid()) { shutdownGracefully(); return Promise.reject(new Error('Context invalidated')); }
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    } catch (e) {
      shutdownGracefully();
      reject(e);
    }
  });
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function log(...args) {
  if (!isContextValid()) return;
  chrome.storage.local.get('debugMode', ({ debugMode }) => {
    if (debugMode) console.log('[WA AI Assistant]', ...args);
  });
}

function logError(...args) { console.error('[WA AI Assistant]', ...args); }

// ─── BOOT ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2500));
} else {
  setTimeout(init, 2500);
}
