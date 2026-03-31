import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

function assertServer() {
  if (typeof window !== 'undefined') {
    throw new Error('AI provider must only be used on the server.');
  }
}

export type AIProviderResult = {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createGroq>>;
  provider: 'google' | 'groq';
};

/**
 * Returns the primary AI model (Gemini 2.5 Flash).
 * Falls back to Groq if Google key is missing.
 */
export function getAIModel(): AIProviderResult {
  assertServer();
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return { model: google('gemini-2.5-flash'), provider: 'google' };
  }

  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey });
    return { model: groq('llama-3.3-70b-versatile'), provider: 'groq' };
  }

  throw new Error('No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY.');
}

/**
 * Returns the fallback model (Groq Llama 3.3 70B).
 * Returns null if Groq key is not set.
 */
export function getFallbackModel(): AIProviderResult | null {
  assertServer();
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const groq = createGroq({ apiKey: groqKey });
  return { model: groq('llama-3.3-70b-versatile'), provider: 'groq' };
}
