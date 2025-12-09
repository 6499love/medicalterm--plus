
import { Term } from '../types';
import { getCompletion, LLMConfig } from './llm';

export interface TextSegment {
  id: string;
  text: string;
  matchedTerm?: Term;
  termOccurrenceIndex?: number; // Tracks which occurrence of the term this is (0, 1, 2...)
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
 * @param glossary Optional list of terms to force in translation
 * @returns The translated text string
 */
export const initialTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary?: { source: string; target: string }[]
): Promise<string> => {
  
  let glossaryInstruction = "";
  if (glossary && glossary.length > 0) {
      // Format glossary for the prompt
      const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}"`).join("\n");
      glossaryInstruction = `
Mandatory Glossary (You MUST use these translations for the specific terms below):
${glossaryList}
`;
  }

  const systemPrompt = `You are an expert translator. 
Translate the provided text from ${sourceLang} to ${targetLang}.

Requirements:
- Accuracy: Ensure the translation is faithful to the source text.
- Terminology: Use correct, professional terminology.${glossary && glossary.length > 0 ? " Strictly adhere to the provided mandatory glossary." : ""}
- Formatting: Return ONLY the translated text. Do NOT include explanations, summaries, notes, or any extra text before or after the translation.
${glossaryInstruction}`;

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

Please evaluate the translation based on the following dimensions and provide your feedback in Chinese:
- **术语准确性** (Terminology Accuracy): Check for correctness of medical terms and consistency.
- **语言流畅性与语法** (Fluency and Grammar): Ensure the target text reads naturally and is grammatically correct.
- **表达风格与一致性** (Style and Consistency): Ensure the tone is appropriate for medical documentation.

Output Requirements:
- Return a list of concise, actionable suggestions in Chinese.
- Start your response with exactly: "以下为对当前译文的优化建议："
- Use the Chinese headers provided above.
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

// --- New Segmentation Logic ---

/**
 * Normalizes text for comparison (lowercase, collapse spaces).
 */
const normalizeKey = (str: string) => str.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Escapes regex special characters.
 */
const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Pure function to scan text and return segments with identified terms.
 * 
 * @param text The full text to scan.
 * @param terms The dictionary of terms to match against.
 * @param options Mode: 'source' matches chinese_term, 'translation' matches english_term.
 */
export const buildTermSegments = (
  text: string,
  terms: Term[],
  options: { mode: 'source' | 'translation' }
): TextSegment[] => {
  if (!text) return [];

  const { mode } = options;
  const termMap = new Map<string, Term>();
  const patterns: string[] = [];

  // 1. Prepare patterns and map
  terms.forEach(term => {
    const rawString = mode === 'source' ? term.chinese_term : term.english_term;
    if (!rawString || !rawString.trim()) return;

    // Use normalized key for lookup
    const key = normalizeKey(rawString);
    
    // Store first term found for this string (priority to system or user based on array order)
    if (!termMap.has(key)) {
      termMap.set(key, term);
    }

    // Build Regex Pattern
    // Escape the string for regex
    let pattern = escapeRegExp(rawString.trim());
    
    // Allow flexible whitespace matches (e.g. "Backrest  elevation" matches "Backrest elevation")
    pattern = pattern.replace(/\\ /g, '\\s+');

    // Add word boundaries for English mode to prevent partial matches
    if (mode === 'translation') {
      // If it starts with a word char, require boundary
      if (/^\w/.test(rawString.trim())) {
        pattern = '\\b' + pattern;
      }
      // If it ends with a word char, require boundary
      if (/\w$/.test(rawString.trim())) {
        pattern = pattern + '\\b';
      }
    }

    patterns.push(pattern);
  });

  if (patterns.length === 0) {
    return [{ id: 'seg_0', text }];
  }

  // 2. Sort patterns by length descending to ensure greedy matching
  // (e.g. match "Backrest up/down" before "Backrest")
  // We sort based on the length of the *pattern string* as a proxy for complexity/length
  patterns.sort((a, b) => b.length - a.length);

  // 3. Create Master Regex
  // The capturing group `(...)` is essential for .split() to include the separators (matches)
  const masterRegex = new RegExp(`(${patterns.join('|')})`, 'gi');

  // 4. Split and Map
  const splitParts = text.split(masterRegex);
  
  // Track occurrences for specific term IDs to support 1-to-1 mapping
  const termCounts = new Map<string, number>();

  return splitParts.map((part, index) => {
    // Check if this part is a term
    // We must normalize the part from the text to match our map keys
    const lookupKey = normalizeKey(part);
    const matchedTerm = termMap.get(lookupKey);
    
    let occurrenceIndex: number | undefined = undefined;
    if (matchedTerm) {
        const count = termCounts.get(matchedTerm.id) || 0;
        occurrenceIndex = count;
        termCounts.set(matchedTerm.id, count + 1);
    }

    return {
      id: `seg_${mode}_${index}`, // Unique ID based on index and mode
      text: part,
      matchedTerm: matchedTerm || undefined,
      termOccurrenceIndex: occurrenceIndex
    };
  }).filter(seg => seg.text !== ''); // Filter out empty strings from split
};

// Legacy export for compatibility if needed (aliased to new function for 'auto')
export const tokenizeTextWithTerms = (
  text: string, 
  terms: Term[],
  language: 'chinese' | 'english' | 'auto' = 'auto'
): TextSegment[] => {
  // Map legacy 'language' param to new mode
  const mode = language === 'chinese' ? 'source' : 'translation';
  // Note: 'auto' isn't perfectly supported in strict separation, defaulting to translation (English) check if ambiguous
  // or checking input char types. For this app's usage, we strictly control mode now.
  return buildTermSegments(text, terms, { mode });
};
