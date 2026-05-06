# 💬 GirlfriendGPT

> An AI-powered Chrome extension that reads WhatsApp Web and replies in **your** natural texting style using OpenAI — so you never have to overthink a message again. Works in any language.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- **One chat only** — you pick exactly one contact. It does nothing in any other chat.
- **Learns your style** — upload a WhatsApp chat export (.txt) and it analyzes how you write.
- **Any language** — built for casual, natural texting in whatever language you use (not corporate AI speak).
- **Safety Mode** — automatically blocks auto-send for sensitive topics (jealousy, money, "we need to talk", etc.)
- **Auto-Send toggle** — OFF by default. Turn on only when you trust it.
- **Draft mode** — when Auto-Send is off, it just writes the reply in the input box. You decide.
- **Risk scoring** — every reply gets a `low / medium / high` risk score before sending.
- **No backend** — everything runs locally. Only the reply prompt goes to OpenAI.
- **Privacy first** — your chat export never leaves the browser. API key stored locally only.

---

## 📸 Screenshot

> *(Add screenshots here once loaded in Chrome)*

---

## 🚀 Installation

### Step 1 — Download

Clone or download this repo:
```bash
git clone https://github.com/danielmadii/GirlfriendGPT.git
```

### Step 2 — Load in Chrome

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `GirlfriendGPT/` folder

The extension icon will appear in your toolbar.

---

## ⚙️ Configuration

### 1. Add your OpenAI API Key
- Click the extension icon → **⚙️ Settings**
- Paste your key in the **API Key** field
- Get a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Select model (GPT-4o recommended)
- Click **Save Settings**

> Your key is stored only in `chrome.storage.local` — it never touches any server except `api.openai.com`.

### 2. Set the Allowed Chat
- Open [web.whatsapp.com](https://web.whatsapp.com) and note the **exact name** shown at the top of the chat
- In the popup or settings, enter that name in **Allowed Chat**
- The extension does absolutely nothing in any other chat

### 3. Upload Your Chat Export (Recommended)

This teaches the AI how you actually write.

**Export from phone:**
- **iOS:** Chat → tap contact name → scroll down → Export Chat → Without Media
- **Android:** Chat → ⋮ → More → Export Chat → Without Media

**In Settings → Chat Export:**
1. Click the upload area and select your `.txt` file
2. Select which sender is you from the dropdown
3. Click **✨ Build Style Profile**

The extension extracts your style locally — only a short summary and ~15 example messages get sent to OpenAI per reply.

---

## 🧪 Testing Safely

1. **Keep Auto-Send OFF** (this is the default)
2. Open WhatsApp Web and go to the allowed chat
3. Have someone send you a message
4. Watch the extension draft a reply in the input box
5. Review it, edit if needed, send manually
6. Only enable Auto-Send after you're confident in the quality

---

## 🛡️ Safety Mode

When Safety Mode is ON, the extension will **never auto-send** if the incoming message contains sensitive keywords like:

`trust` · `jealous` · `lying` · `future` · `marriage` · `money` · `break up` · `we need to talk` · `serious` · and more

High-risk replies get flagged and only drafted — never auto-sent.

---

## 🔧 Updating WhatsApp Selectors

WhatsApp Web changes its internal class names frequently. If the extension stops detecting messages, open `src/content.js` and look for these functions — each has a list of selectors to try:

| Function | What it finds |
|---|---|
| `getActiveChatTitle()` | Chat name in header |
| `getMessageListContainer()` | Message list element |
| `extractText(el)` | Text inside a message bubble |
| `getMessageInputElement()` | The reply input box |
| `clickSendButton()` | The send button |

To find the current selector: open WhatsApp Web → F12 → Elements → click the element → note its `data-testid` or structure.

---

## 📁 File Structure

```
GirlfriendGPT/
├── manifest.json          # Chrome Extension Manifest V3
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      # Service worker — OpenAI API calls
    ├── content.js         # Injected into WhatsApp Web
    ├── popup.html/js      # Extension popup
    ├── options.html/js    # Full settings page
    ├── storage.js         # chrome.storage helpers
    ├── openai.js          # OpenAI API call logic
    ├── chatParser.js      # WhatsApp export parser
    ├── promptBuilder.js   # Builds the AI prompt
    └── whatsappDom.js     # DOM selectors reference
```

---

## 🔒 Privacy

- Your OpenAI API key is stored only in `chrome.storage.local`
- The WhatsApp chat export is **never** sent to any server
- Only sent to OpenAI per reply: the incoming message + last 10 messages of context + a style summary + ~15 example messages
- No analytics, no telemetry, no accounts

---

## ☕ Support

GirlfriendGPT is free and open source. If it saves you from sending a bad text, consider:

- ⭐ **Starring the repo** on [GitHub](https://github.com/danielmadii/GirlfriendGPT)
- 🐛 **Reporting bugs** via [Issues](https://github.com/danielmadii/GirlfriendGPT/issues)
- 💬 **Contributing** — [PRs welcome](https://github.com/danielmadii/GirlfriendGPT/pulls)

### Crypto Donations

| Coin | Network | Address |
|---|---|---|
| **USDT** | TRC-20 (Tron) | `TXCyHeDWDdtLLY38GCXtgKzk9qd6Fnz1L1` |

> ⚠️ Always verify the address before sending. Double-check the network.

---

## ⚠️ Disclaimer

This extension replies on your behalf. Always review generated messages before sending, especially for anything important. The author is not responsible for any messages sent. Use Auto-Send at your own risk.

---

## 📄 License

MIT — do whatever you want, just don't blame me if your relationship ends.
