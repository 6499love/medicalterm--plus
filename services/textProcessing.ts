
import { Term } from '../types';
import { getCompletion, LLMConfig } from './llm';

export interface TextSegment {
  id: string; // Unique key for React mapping
  text: string;
  matchedTerm?: Term;
}

/**
 * Translates text using an LLM API.
 * If config is missing, returns the original text (stub behavior).
 */
export const translateWithAI = async (text: string, config: LLMConfig | null): Promise<string> => {
  if (!text) return '';
  
  if (!config) {
    // Fallback/Stub behavior if no config is provided
    return text;
  }

  const systemPrompt = `You are a professional medical translator. 
Translate the provided text faithfully.
If the source is Chinese, translate to English.
If the source is English, translate to Chinese.
Use professional medical terminology.
Return ONLY the translated text. Do not include any explanations, notes, or markdown formatting.`;

  // Propagate error to caller for UI handling
  return await getCompletion(config, text, systemPrompt);
};

/**
 * Performs a high-quality initial translation using an LLM.
 * Designed to provide a clean, professional translation without extra conversational filler.
 * 
 * @param text The text to translate
 * @param sourceLang The source language name (e.g., "English", "Chinese")
 * @param targetLang The target language name
 * @param aiConfig The LLM configuration
 * @returns The translated text string
 */
export const initialTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig
): Promise<string> => {
  const systemPrompt = `You are an expert translator. 
Translate the provided text from ${sourceLang} to ${targetLang}.

Requirements:
- Accuracy: Ensure the translation is faithful to the source text.
- Terminology: Use correct, professional terminology.
- Formatting: Return ONLY the translated text. Do NOT include explanations, summaries, notes, or any extra text before or after the translation.`;

  return await getCompletion(aiConfig, text, systemPrompt);
};

/**
 * Critiques a translation and provides improvement suggestions.
 * 
 * @param sourceText The original source text
 * @param translatedText The current translation to evaluate
 * @param sourceLang The source language name
 * @param targetLang The target language name
 * @param aiConfig The LLM configuration
 * @returns A string containing a list of specific suggestions
 */
export const reflectOnTranslation = async (
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig
): Promise<string> => {
  const systemPrompt = `You are an expert translation reviewer specializing in medical texts.
Your task is to critique the translation provided below.

Focus your reflection on:
- Accuracy: Identify mistranslations, omissions, or added meaning.
- Fluency and Grammar: Ensure the target text reads naturally.
- Style: Ensure the tone is appropriate for medical documentation.
- Terminology: Check for consistency and correct domain-specific terms.

Output Requirements:
- Return a list of concise, actionable suggestions.
- Each suggestion should point to a specific issue.
- Do NOT output a revised translation.
- Do NOT output generic praise or conversational filler.`;

  const userPrompt = `Source Text (${sourceLang}):
${sourceText}

Translation to Critique (${targetLang}):
${translatedText}

Provide your specific suggestions for improvement:`;

  return await getCompletion(aiConfig, userPrompt, systemPrompt);
};

/**
 * Improves a translation based on expert critique.
 * 
 * @param sourceText The original source text
 * @param translatedText The initial translation
 * @param reflectionNotes The critique/suggestions provided by the reviewer
 * @param sourceLang The source language name
 * @param targetLang The target language name
 * @param aiConfig The LLM configuration
 * @returns The revised translation string
 */
export const improveTranslation = async (
  sourceText: string,
  translatedText: string,
  reflectionNotes: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig
): Promise<string> => {
  const systemPrompt = `You are an expert medical translator and editor.
Your task is to refine a translation based on expert review feedback.

Requirements:
- Incorporate the reviewer's suggestions to improve accuracy, fluency, and terminology.
- Ensure the tone is professional and appropriate for medical contexts.
- Strictly maintain the original meaning of the source text.
- Return ONLY the revised translation. Do not include any notes or explanations.`;

  const userPrompt = `Source Text (${sourceLang}):
${sourceText}

Current Translation (${targetLang}):
${translatedText}

Expert Reviewer Feedback:
${reflectionNotes}

Please provide the final, revised translation based on this feedback:`;

  return await getCompletion(aiConfig, userPrompt, systemPrompt);
};

/**
 * Scans text and breaks it into segments, identifying terms from the dictionary.
 * Prioritizes longer matches to prevent partial matching (e.g., matching "bed" inside "bed height").
 * 
 * @param text The text to scan
 * @param allTerms Dictionary of terms
 * @param language 'chinese' | 'english' | 'auto'. 
 *                 'chinese': only matches chinese_term. 
 *                 'english': only matches english_term.
 *                 'auto': matches both (legacy behavior).
 */
export const tokenizeTextWithTerms = (
  text: string, 
  allTerms: Term[],
  language: 'chinese' | 'english' | 'auto' = 'auto'
): TextSegment[] => {
  if (!text) return [];

  // 1. Prepare terms for regex
  // We want to match fields based on the specified language
  // We need to map the matched string back to the specific Term object
  const termMap = new Map<string, Term>();
  const patterns: string[] = [];

  // Helper to escape regex special characters
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const shouldMatchChinese = language === 'chinese' || language === 'auto';
  const shouldMatchEnglish = language === 'english' || language === 'auto';

  allTerms.forEach(term => {
    if (shouldMatchChinese && term.chinese_term) {
      const key = term.chinese_term.toLowerCase();
      // Store mapping (lowercase for case-insensitive lookup)
      if (!termMap.has(key)) {
         termMap.set(key, term);
         patterns.push(escapeRegExp(term.chinese_term));
      }
    }
    if (shouldMatchEnglish && term.english_term) {
      const key = term.english_term.toLowerCase();
      if (!termMap.has(key)) {
         termMap.set(key, term);
         patterns.push(escapeRegExp(term.english_term));
      }
    }
  });

  // 2. Sort patterns by length descending (Critical for correct matching)
  patterns.sort((a, b) => b.length - a.length);

  if (patterns.length === 0) {
    return [{ id: '0', text }];
  }

  // 3. Create the Master Regex
  // Use capturing group () to include the separators (terms) in the split result
  const regex = new RegExp(`(${patterns.join('|')})`, 'gi');

  // 4. Split and Map
  // split() with capturing groups returns: [pre, match, post, match, ...]
  const parts = text.split(regex);
  
  return parts.map((part, index) => {
    const lowerPart = part.toLowerCase();
    const matchedTerm = termMap.get(lowerPart);
    
    return {
      id: `seg_${index}`,
      text: part,
      matchedTerm
    };
  });
};
