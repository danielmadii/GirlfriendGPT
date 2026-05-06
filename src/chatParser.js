// src/chatParser.js
// Parses WhatsApp exported .txt chat files locally in the browser.
// Extracts messages, identifies the user vs the other person,
// and builds a style summary + example set.

/**
 * Parses a WhatsApp export .txt string.
 * Supports both Android and iOS export formats:
 *   Android: [DD/MM/YYYY, HH:MM:SS] Name: message
 *   iOS:     DD/MM/YYYY, HH:MM - Name: message
 *
 * Returns: { messages: [{timestamp, sender, text}], senders: [unique sender names] }
 */
function parseWhatsAppExport(rawText) {
  const messages = [];
  const senders = new Set();

  // Match both Android and iOS formats
  // Android: [10/04/2024, 14:30:00] Sender: text
  // iOS:     10/04/2024, 14:30 - Sender: text
  const lineRegex = /^[\[]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]*\s*[-–]?\s*([^:]+?):\s(.+)$/i;

  const lines = rawText.split('\n');
  let currentMessage = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(lineRegex);

    if (match) {
      // Save previous message
      if (currentMessage) {
        messages.push(currentMessage);
      }

      const [, date, time, sender, text] = match;

      // Skip system messages
      if (
        text.includes('Messages and calls are end-to-end encrypted') ||
        text.includes('created this group') ||
        text.includes('added you') ||
        text.includes('left') ||
        text.includes('changed the group') ||
        text === '<Media omitted>' ||
        text === 'null' ||
        text.toLowerCase().includes('this message was deleted') ||
        text.includes('changed their phone number')
      ) {
        currentMessage = null;
        continue;
      }

      const cleanSender = sender.trim();
      senders.add(cleanSender);

      currentMessage = {
        timestamp: `${date} ${time}`,
        sender: cleanSender,
        text: text.trim(),
      };
    } else if (currentMessage && trimmed) {
      // Continuation of previous message (multi-line)
      currentMessage.text += '\n' + trimmed;
    }
  }

  // Push last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  return { messages, senders: [...senders] };
}

/**
 * Given parsed messages and the identified "myName" (user's sender name),
 * extracts the user's messages and builds:
 * - styleSummary: text description of writing style
 * - styleExamples: up to 30 best examples of the user's messages
 */
function buildStyleProfile(messages, myName) {
  const myMessages = messages.filter(
    (m) => m.sender.toLowerCase() === myName.toLowerCase()
  );

  if (myMessages.length === 0) {
    return { styleSummary: '', styleExamples: [] };
  }

  // Analyze style characteristics
  const totalMessages = myMessages.length;
  const avgLength = Math.round(
    myMessages.reduce((sum, m) => sum + m.text.length, 0) / totalMessages
  );

  const emojiRegex = /[\u{1F300}-\u{1FAFF}]/gu;
  const emojiCount = myMessages.filter((m) => emojiRegex.test(m.text)).length;
  const usesEmojis = emojiCount / totalMessages > 0.15;

  const arabicRegex = /[\u0600-\u06FF]/;
  const arabicCount = myMessages.filter((m) => arabicRegex.test(m.text)).length;
  const arabicRatio = arabicCount / totalMessages;

  const shortMessages = myMessages.filter((m) => m.text.split(' ').length <= 5).length;
  const shortRatio = shortMessages / totalMessages;

  // Detect Arabizi (transliterated Arabic using latin chars)
  const arabiziPatterns = /\b(3|7|2|5|6|8|9)[a-z]/i;
  const arabiziCount = myMessages.filter((m) => arabiziPatterns.test(m.text)).length;
  const usesArabizi = arabiziCount / totalMessages > 0.1;

  const styleSummary = `
User's WhatsApp style analysis (${totalMessages} messages analyzed):
- Average message length: ${avgLength} characters
- Short messages (≤5 words): ${Math.round(shortRatio * 100)}% of messages
- Uses emojis: ${usesEmojis ? 'Yes (use them naturally)' : 'Rarely (avoid emojis)'}
- Arabic script usage: ${Math.round(arabicRatio * 100)}%
- Uses Arabizi (transliterated): ${usesArabizi ? 'Yes' : 'Rarely'}
- Style: ${arabicRatio > 0.5 ? 'Primarily Arabic' : usesArabizi ? 'Arabizi/mixed Lebanese' : 'Casual English or mixed'}
`.trim();

  // Pick diverse, meaningful examples (avoid very short/generic ones)
  const goodExamples = myMessages
    .filter((m) => m.text.length > 3 && m.text.length < 200)
    .filter((m) => !m.text.startsWith('http'))
    .slice(-200); // Take the most recent 200

  // Sample up to 30 spread across the history
  const step = Math.max(1, Math.floor(goodExamples.length / 30));
  const styleExamples = goodExamples
    .filter((_, i) => i % step === 0)
    .slice(0, 30)
    .map((m) => m.text);

  return { styleSummary, styleExamples };
}

/**
 * Full parse pipeline: raw text → style profile
 * Returns: { senders, styleSummary, styleExamples, messageCount }
 */
function processChatExport(rawText, myName) {
  const { messages, senders } = parseWhatsAppExport(rawText);

  if (!myName && senders.length >= 1) {
    // Can't auto-detect without a name
    return { senders, styleSummary: '', styleExamples: [], messageCount: messages.length };
  }

  const { styleSummary, styleExamples } = buildStyleProfile(messages, myName);

  return {
    senders,
    styleSummary,
    styleExamples,
    messageCount: messages.length,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseWhatsAppExport, buildStyleProfile, processChatExport };
}
