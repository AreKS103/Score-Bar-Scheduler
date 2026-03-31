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
  modelId: string;
};

/**
 * Primary: Groq Llama 4 Scout — newest Llama 4, 30K TPM, free.
 * Falls back to Google Gemini 2.5 Flash if no Groq key.
 */
export function getAIModel(): AIProviderResult {
  assertServer();
  const groqKey = process.env.GROQ_API_KEY;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey });
    return { model: groq('meta-llama/llama-4-scout-17b-16e-instruct'), provider: 'groq', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct' };
  }

  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return { model: google('gemini-2.5-flash'), provider: 'google', modelId: 'gemini-2.5-flash' };
  }

  throw new Error('No AI provider configured. Set GROQ_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.');
}

/**
 * Fallback: Groq Llama 3.3 70B — larger model, stronger sports knowledge.
 * Returns null if Groq key is not set.
 */
export function getFallbackModel(): AIProviderResult | null {
  assertServer();
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const groq = createGroq({ apiKey: groqKey });
  return { model: groq('llama-3.3-70b-versatile'), provider: 'groq', modelId: 'llama-3.3-70b-versatile' };
}
