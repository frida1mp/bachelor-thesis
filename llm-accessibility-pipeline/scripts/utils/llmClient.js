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
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

  const stream = client.messages.stream({
    model,
    max_tokens: 64000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  // Log progress so we know it's not stuck
  let chunks = 0;
  stream.on('text', () => {
    chunks++;
    if (chunks % 200 === 0) process.stdout.write('.');
  });

  const timeoutMs = 10 * 60 * 1000; // 10 minute timeout
  const finalMessage = await Promise.race([
    stream.finalMessage(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out after 10 minutes')), timeoutMs)
    ),
  ]);

  const rawText = finalMessage.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    html: extractHTML(rawText),
    rawResponse: rawText,
    usage: finalMessage.usage,
    model: finalMessage.model,
    stopReason: finalMessage.stop_reason,
  };
}
