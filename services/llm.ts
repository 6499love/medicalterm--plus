
import { GoogleGenAI } from "@google/genai";
import { resolveSiliconFlowModel } from './siliconflow';
import type { LLMProvider } from '../types';

export const DEFAULT_LLM_MODELS: Record<LLMProvider, string> = {
  glm: 'glm-4-flash',
  siliconflow: '',
  gemini: 'gemini-2.5-flash',
  'openai-compatible': 'gpt-3.5-turbo',
};

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isQuotaError = (error: any): boolean => {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  return (
    error.status === 429 || 
    error.code === 429 ||
    error?.error?.code === 429 ||
    error?.response?.status === 429 ||
    msg.includes('429') || 
    msg.includes('quota') || 
    msg.includes('RESOURCE_EXHAUSTED')
  );
};

/**
 * Reusable function to call LLM APIs (Gemini, OpenAI-compatible, or GLM)
 * Returns ONLY the plain text response.
 */
export const getCompletion = async (
  config: LLMConfig,
  userPrompt: string,
  systemPrompt?: string
): Promise<string> => {
  let apiKey = config.apiKey;

  // Only use process.env.API_KEY if the provider is Gemini.
  // This prevents the environment's Gemini key from overriding user-provided keys for other services.
  if (config.provider === 'gemini' && process.env.API_KEY) {
    apiKey = process.env.API_KEY;
  }

  if (!apiKey) {
    throw new Error('API Key is required. Please configure it in Settings.');
  }

  const siliconFlowModel = config.provider === 'siliconflow'
    ? await resolveSiliconFlowModel(apiKey, config.model) : undefined;

  const MAX_RETRIES = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        await sleep(1000 * Math.pow(2, attempt - 1));
      }

      // GEMINI IMPLEMENTATION (Via SDK)
      if (config.provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
          model: config.model || DEFAULT_LLM_MODELS.gemini,
          contents: userPrompt,
          config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
        });

        return response.text || '';
      }

      // OPENAI-COMPATIBLE, GLM, & SILICONFLOW IMPLEMENTATION
      if (config.provider === 'openai-compatible' || config.provider === 'glm' || config.provider === 'siliconflow') {
        let baseUrl = config.baseUrl;
        let model = config.model;

        // Apply defaults based on provider
        if (config.provider === 'glm') {
          baseUrl = baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
          model = model || DEFAULT_LLM_MODELS.glm;
        } else if (config.provider === 'siliconflow') {
          baseUrl = baseUrl || 'https://api.siliconflow.cn/v1';
          model = siliconFlowModel;
        } else {
          // Generic OpenAI defaults
          baseUrl = baseUrl 
            ? baseUrl.replace(/\/+$/, '') 
            : 'https://api.openai.com/v1';
          model = model || DEFAULT_LLM_MODELS['openai-compatible'];
        }
        
        // Ensure URL ends correctly
        baseUrl = baseUrl.replace(/\/+$/, '');
        // Vite and Vercel provide the same fixed GLM route; custom endpoints remain explicit.
        const url = config.provider === 'glm' && baseUrl === 'https://open.bigmodel.cn/api/paas/v4'
          ? '/api/glm/chat/completions'
          : `${baseUrl}/chat/completions`;

        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });

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
           let errorText = await response.text();
           try {
              const jsonErr = JSON.parse(errorText);
              errorText = JSON.stringify(jsonErr);
           } catch(e) {}

           const error: any = new Error(`${config.provider.toUpperCase()} API Error (${response.status}): ${errorText}`);
           error.status = response.status;
           throw error;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;

        if (typeof text !== 'string') {
          throw new Error('API returned unexpected format (no content found)');
        }

        return text;
      }

      throw new Error(`Unsupported provider: ${config.provider}`);

    } catch (error: any) {
      lastError = error;
      
      // Handle Quota/Rate Limit Errors
      if (isQuotaError(error)) {
        if (attempt < MAX_RETRIES) {
           console.warn(`Quota limit hit (Attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying...`);
           continue; 
        } else {
           throw new Error('QUOTA_EXCEEDED');
        }
      }

      // Non-recoverable error, rethrow immediately
      const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      throw new Error(msg);
    }
  }

  throw lastError || new Error('Unknown Error');
};
