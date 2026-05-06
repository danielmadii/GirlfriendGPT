// src/openai.js
// Handles OpenAI API calls from the service worker.
// Returns parsed { reply, risk_level, can_auto_send, reason } or throws.

/**
 * Calls OpenAI Chat Completions API.
 *
 * @param {string} apiKey
 * @param {string} model
 * @param {Array<{role:string, content:string}>} messages
 * @returns {Promise<{reply:string, risk_level:string, can_auto_send:boolean, reason:string}>}
 */
async function callOpenAI(apiKey, model, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  // Strip markdown code fences just in case
  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${cleaned}`);
  }

  // Validate expected fields
  if (typeof parsed.reply !== 'string') {
    throw new Error(`Invalid OpenAI response structure: ${JSON.stringify(parsed)}`);
  }

  return {
    reply: parsed.reply || '',
    risk_level: parsed.risk_level || 'high',
    can_auto_send: parsed.can_auto_send === true,
    reason: parsed.reason || '',
  };
}

if (typeof module !== 'undefined') {
  module.exports = { callOpenAI };
}
