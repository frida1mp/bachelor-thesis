import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export function extractHTML(responseText) {
  // Try markdown code fence first
  const fenceMatch = responseText.match(/```html\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try any code fence
  const anyFence = responseText.match(/```\s*\n([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();

  // Try extracting from <!DOCTYPE or <html to </html>
  const htmlMatch = responseText.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();

  // Fallback: return the full response
  return responseText.trim();
}

export async function sendToLLM(systemPrompt, userContent) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    html: extractHTML(rawText),
    rawResponse: rawText,
    usage: response.usage,
    model: response.model,
    stopReason: response.stop_reason,
  };
}
