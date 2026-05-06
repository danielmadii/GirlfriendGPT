// src/whatsappDom.js
// WhatsApp Web DOM interaction helpers.
// NOTE: WhatsApp frequently changes class names and data-testid values.
// All selectors are listed with fallbacks. If things break, update here.

// ─── SELECTOR STRATEGIES ─────────────────────────────────────────────────────
// Each function tries multiple selectors in order and returns the first match.

/**
 * Returns the active chat title (contact/group name shown in the header).
 * Update selectors here if WhatsApp changes its DOM.
 */
function getActiveChatTitle() {
  const selectors = [
    // Primary: data-testid based (most stable)
    '[data-testid="conversation-info-header-chat-title"] span',
    '[data-testid="conversation-info-header-chat-title"]',
    // Secondary: header span with dir attribute
    '#main header span[dir="auto"]:first-of-type',
    // Tertiary: generic header title
    'header [title]',
    '#main header [data-testid="chat-title-container"] span',
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.getAttribute('title') || el.textContent;
        if (text && text.trim()) return text.trim();
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Returns the message list container element.
 * Used for MutationObserver attachment.
 */
function getMessageListContainer() {
  const selectors = [
    '[data-testid="conversation-panel-messages"]',
    '#main [data-testid="msg-container"]',
    '#main .copyable-area [role="application"]',
    '#main [role="application"]',
    '#main [data-tab="8"]',
    // Fallback: any scrollable div inside #main
    '#main .message-list',
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      // ignore
    }
  }

  // Last resort: the main panel itself
  return document.querySelector('#main');
}

/**
 * Returns all message bubble elements currently in the DOM.
 * Returns an array of { element, text, isIncoming, messageId } objects.
 */
function getAllMessages() {
  const results = [];

  // Each message row has a data-id attribute
  // data-id format: "true_..." = outgoing, "false_..." = incoming
  // OR use message-in / message-out class
  const selectors = [
    '[data-testid="msg-container"]',
    'div[class*="message-in"]',
    'div[class*="message-out"]',
    // Broader fallback
    '#main .message-in, #main .message-out',
  ];

  let messageElements = [];

  // Try data-testid first
  const byTestId = document.querySelectorAll('[data-testid="msg-container"]');
  if (byTestId.length > 0) {
    messageElements = [...byTestId];
  } else {
    // Fallback to class-based
    const byClass = document.querySelectorAll('#main [class*="message-"]');
    messageElements = [...byClass].filter(el =>
      el.className.includes('message-in') || el.className.includes('message-out')
    );
  }

  for (const el of messageElements) {
    const isIncoming = isIncomingMessage(el);
    const text = extractMessageText(el);
    const messageId = extractMessageId(el);

    if (text) {
      results.push({ element: el, text, isIncoming, messageId });
    }
  }

  return results;
}

/**
 * Determines if a message element is incoming (from the other person).
 */
function isIncomingMessage(el) {
  // Check data-id attribute: "false_..." = incoming
  const dataId = el.getAttribute('data-id') || el.closest('[data-id]')?.getAttribute('data-id');
  if (dataId) {
    return dataId.startsWith('false_');
  }

  // Check class name
  const classStr = el.className || '';
  const parent = el.closest('[class*="message-in"], [class*="message-out"]');
  const parentClass = parent?.className || '';

  if (classStr.includes('message-in') || parentClass.includes('message-in')) return true;
  if (classStr.includes('message-out') || parentClass.includes('message-out')) return false;

  // Check for outgoing indicator (checkmarks, tail-right)
  const hasSentTick = el.querySelector('[data-testid="msg-dblcheck"], [data-testid="msg-check"], [data-testid="msg-time"]');
  // This is unreliable, default to unknown = incoming for safety
  return false;
}

/**
 * Extracts the text content from a message bubble element.
 */
function extractMessageText(el) {
  const textSelectors = [
    // Primary: data-testid
    '[data-testid="msg-text"] span',
    '[data-testid="msg-text"]',
    // Secondary: copyable text
    '.copyable-text span[dir]',
    '.copyable-text',
    // Tertiary: generic span with dir
    'span[dir="ltr"], span[dir="rtl"]',
  ];

  for (const sel of textSelectors) {
    try {
      const textEl = el.querySelector(sel);
      if (textEl) {
        const text = textEl.textContent?.trim();
        if (text && text.length > 0) return text;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Extracts a unique ID for a message element to prevent duplicate replies.
 */
function extractMessageId(el) {
  // Try data-id directly
  const direct = el.getAttribute('data-id');
  if (direct) return direct;

  // Try parent
  const parent = el.closest('[data-id]');
  if (parent) return parent.getAttribute('data-id');

  // Fallback: use text content hash (not ideal but works)
  const text = extractMessageText(el);
  return text ? `hash_${simpleHash(text)}` : null;
}

/**
 * Returns the most recent N messages as context.
 * @param {number} n - number of messages to return
 * @returns {Array<{role:'me'|'them', text:string}>}
 */
function getRecentContext(n = 10) {
  const all = getAllMessages();
  return all
    .slice(-n)
    .map(m => ({ role: m.isIncoming ? 'them' : 'me', text: m.text }));
}

/**
 * Returns the last incoming message element and its info.
 * Returns null if none found.
 */
function getLastIncomingMessage() {
  const all = getAllMessages();
  // Find the last incoming message
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].isIncoming) return all[i];
  }
  return null;
}

/**
 * Inserts text into the WhatsApp message input box.
 * Uses clipboard simulation + input events to properly trigger React's state.
 */
async function insertTextIntoInput(text) {
  const inputEl = getMessageInputElement();
  if (!inputEl) {
    throw new Error('Could not find WhatsApp message input element');
  }

  // Focus the input
  inputEl.focus();

  // Clear existing content
  inputEl.textContent = '';
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));

  await sleep(80);

  // Use execCommand as it properly triggers React synthetic events
  // This is deprecated but still works in Chrome for contenteditable
  document.execCommand('insertText', false, text);

  // Also dispatch input event manually for React
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));

  await sleep(100);
}

/**
 * Clicks the WhatsApp send button.
 */
async function clickSendButton() {
  const selectors = [
    '[data-testid="compose-btn-send"]',
    '[data-testid="send"]',
    'button[aria-label="Send"]',
    'button[aria-label="إرسال"]', // Arabic label
    // Fallback: any button with send icon inside footer
    'footer button span[data-icon="send"]',
    'footer button[type="submit"]',
  ];

  for (const sel of selectors) {
    try {
      const btn = document.querySelector(sel);
      if (btn) {
        // Go up to the actual button element if needed
        const button = btn.closest('button') || btn;
        button.click();
        return true;
      }
    } catch {
      // ignore
    }
  }

  // Fallback: simulate Enter keypress on the input
  const inputEl = getMessageInputElement();
  if (inputEl) {
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    });
    inputEl.dispatchEvent(enterEvent);
    return true;
  }

  return false;
}

/**
 * Returns the WhatsApp message input (contenteditable) element.
 */
function getMessageInputElement() {
  const selectors = [
    '[data-testid="conversation-compose-box-input"]',
    // Fallback 1: contenteditable in footer
    'footer [contenteditable="true"]',
    // Fallback 2: data-tab attribute (WhatsApp uses tab indexes)
    '[contenteditable="true"][data-tab="10"]',
    '[contenteditable="true"][data-tab="6"]',
    // Fallback 3: any contenteditable in the main compose area
    '#main footer [contenteditable]',
    '#main [contenteditable="true"]',
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      // ignore
    }
  }
  return null;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

if (typeof module !== 'undefined') {
  module.exports = {
    getActiveChatTitle,
    getMessageListContainer,
    getAllMessages,
    isIncomingMessage,
    extractMessageText,
    extractMessageId,
    getRecentContext,
    getLastIncomingMessage,
    insertTextIntoInput,
    clickSendButton,
    getMessageInputElement,
    sleep,
  };
}
