
import { GoogleGenAI } from "@google/genai";

export interface LLMConfig {
  provider: 'gemini' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Reusable function to call LLM APIs (Gemini or OpenAI-compatible)
 * Returns ONLY the plain text response.
 */
export const getCompletion = async (
  config: LLMConfig,
  userPrompt: string,
  systemPrompt?: string
): Promise<string> => {
  // Use process.env.API_KEY if available (env with injected key), otherwise fall back to user settings
  const apiKey = process.env.API_KEY || config.apiKey;

  if (!apiKey) {
    throw new Error('API Key is required. Please configure it in Settings.');
  }

  // GEMINI IMPLEMENTATION (Via SDK)
  if (config.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: config.model || 'gemini-2.5-flash',
        contents: userPrompt,
        config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
      });

      return response.text || '';
    } catch (error: any) {
      console.error('Gemini SDK Error:', error);
      throw error;
    }
  }

  // OPENAI-COMPATIBLE IMPLEMENTATION
  if (config.provider === 'openai-compatible') {
    // Default to OpenAI standard URL if baseUrl is not provided
    const baseUrl = config.baseUrl 
      ? config.baseUrl.replace(/\/+$/, '') 
      : 'https://api.openai.com/v1';
    
    const url = `${baseUrl}/chat/completions`;
    const model = config.model || 'gpt-3.5-turbo';

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI-compatible API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (typeof text !== 'string') {
        throw new Error('OpenAI API returned unexpected format (no content found)');
      }

      return text;
    } catch (error: any) {
      console.error('getCompletion OpenAI error:', error);
      throw error;
    }
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
};
