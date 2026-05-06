// src/promptBuilder.js
// Builds the final prompt sent to OpenAI from settings + chat context.

/**
 * Builds the messages array for OpenAI Chat Completions.
 *
 * @param {object} params
 * @param {string} params.systemPrompt     - System prompt from settings
 * @param {string} params.styleInstructions - Extra style instructions from settings
 * @param {string} params.styleSummary     - Auto-generated style summary from chat export
 * @param {string[]} params.styleExamples  - Sample messages from the user
 * @param {string} params.incomingMessage  - The new incoming WhatsApp message
 * @param {Array<{role:'me'|'them', text:string}>} params.recentContext - Last N messages
 * @returns {Array<{role:string, content:string}>}
 */
function buildPromptMessages({
  systemPrompt,
  styleInstructions,
  styleSummary,
  styleExamples,
  incomingMessage,
  recentContext,
}) {
  const systemParts = [systemPrompt];

  if (styleSummary) {
    systemParts.push('\n--- USER STYLE ANALYSIS ---\n' + styleSummary);
  }

  if (styleExamples && styleExamples.length > 0) {
    // Limit to 15 examples max to keep token usage low
    const examples = styleExamples.slice(0, 15);
    systemParts.push(
      '\n--- EXAMPLE MESSAGES FROM USER (for style reference only) ---\n' +
      examples.map((e, i) => `${i + 1}. ${e}`).join('\n')
    );
  }

  if (styleInstructions && styleInstructions.trim()) {
    systemParts.push('\n--- EXTRA STYLE NOTES ---\n' + styleInstructions.trim());
  }

  systemParts.push(`
--- RESPONSE FORMAT ---
Respond ONLY with valid JSON. No markdown. No backticks. No extra text.
{
  "reply": "the message to send",
  "risk_level": "low | medium | high",
  "can_auto_send": true or false,
  "reason": "one line reason"
}
`);

  const systemContent = systemParts.join('\n');

  // Build user message with recent context
  const contextLines = [];

  if (recentContext && recentContext.length > 0) {
    contextLines.push('--- RECENT CONVERSATION (oldest to newest) ---');
    for (const msg of recentContext) {
      const label = msg.role === 'me' ? 'Me' : 'Them';
      contextLines.push(`${label}: ${msg.text}`);
    }
    contextLines.push('---');
  }

  contextLines.push(`New incoming message to reply to:\nThem: ${incomingMessage}`);
  contextLines.push('\nWrite my reply as JSON.');

  const userContent = contextLines.join('\n');

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

if (typeof module !== 'undefined') {
  module.exports = { buildPromptMessages };
}
