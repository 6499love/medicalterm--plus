
import { Term } from '../types';
import { getCompletion, LLMConfig } from './llm';
import { getTokenCount, calculateChunkSize, splitTextIntoChunks } from './translationChunkUtils';

export interface TextSegment {
  id: string;
  text: string;
  matchedTerm?: Term;
  termOccurrenceIndex?: number; // Tracks which occurrence of the term this is (0, 1, 2...)
}

const TERMINOLOGY_GUIDANCE = `
Terminology Guidance:
- You are translating medical text. A term dictionary is provided below.
- If the dictionary gives a clear translation for a term, use that translation whenever it fits the grammar.
- Do not invent new technical terms if a dictionary entry exists.
- You may adjust surrounding words and sentence structure for fluency, but keep the core term meaning aligned with the dictionary.
- Priority Hierarchy: 
  1. Semantic accuracy and clinical correctness.
  2. Respecting the term dictionary when it does not conflict with grammar.
  3. Fluency and stylistic polish.
- If you must choose, prioritize correct medical meaning and dictionary-consistent terminology over stylistic variation.
`;

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
 * @param options Configuration options
 * @returns The translated text string
 */
export const initialTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary?: { source: string; target: string; id: string }[],
  options: { enforceTags: boolean } = { enforceTags: true }
): Promise<string> => {
  
  let glossaryInstruction = "";
  if (glossary && glossary.length > 0) {
      if (options.enforceTags) {
        // FAST MODE: Strict tagging for immediate UI feedback
        const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}" (ID: ${g.id})`).join("\n");
        glossaryInstruction = `
Mandatory Glossary:
${glossaryList}

IMPORTANT: Whenever you use a translation from the glossary, you MUST wrap it in special brackets with its ID, like this: ⦗Translated Text|ID⦘.
Example: If the glossary has "Heart" -> "XinZang" (ID: 123), you must write "The ⦗XinZang|123⦘ is beating."
Do not wrap terms that are not in the glossary.
`;
      } else {
        // PROFESSIONAL MODE: Strong guidance but natural flow (no tags)
        const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}"`).join("\n");
        glossaryInstruction = `
${TERMINOLOGY_GUIDANCE}

Reference Dictionary:
${glossaryList}

Instructions:
- Use the provided glossary translations for the corresponding source terms.
- Do NOT add any special tags or brackets in the output. Just produce natural, professional text.
`;
      }
  }

  const systemPrompt = `You are an expert translator. 
Translate the provided text from ${sourceLang} to ${targetLang}.

Requirements:
- Accuracy: Ensure the translation is faithful to the source text.
- Terminology: Use correct, professional terminology.${glossary && glossary.length > 0 ? " Strictly adhere to the provided mandatory glossary." : ""}
- Formatting: Return ONLY the translated text. Do NOT include explanations, summaries, notes, or any extra text before or after the translation.
${glossaryInstruction}`;

  let result = await getCompletion(aiConfig, text, systemPrompt);
  // Cleanup potential markdown blocks
  result = result.replace(/^```(json|text|markdown)?\n/i, '').replace(/\n```$/, '').trim();
  return result;
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
 * @param glossary Optional list of terms to force in translation
 * @param options Configuration options
 * @returns The revised translation string
 */
export const improveTranslation = async (
  sourceText: string,
  translatedText: string,
  reflectionNotes: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary?: { source: string; target: string; id: string }[],
  options: { enforceTags: boolean } = { enforceTags: true }
): Promise<string> => {
  
  let glossaryInstruction = "";
  if (glossary && glossary.length > 0) {
      if (options.enforceTags) {
        const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}" (ID: ${g.id})`).join("\n");
        glossaryInstruction = `
MANDATORY GLOSSARY ENFORCEMENT:
${glossaryList}

CRITICAL: You MUST incorporate the glossary terms into the final translation.
Whenever you use a term from the glossary, you MUST wrap it in special brackets with its ID, like this: ⦗Translated Text|ID⦘.
Even if you rewrite the sentence structure, the glossary terms MUST be preserved and tagged.
`;
      } else {
        const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}"`).join("\n");
        glossaryInstruction = `
${TERMINOLOGY_GUIDANCE}

MANDATORY GLOSSARY ENFORCEMENT:
${glossaryList}

CRITICAL: You MUST incorporate the glossary terms into the final translation.
Do NOT use special brackets or tags. Just integrate the terms naturally and grammatically into the sentence.
`;
      }
  }

  const systemPrompt = `You are an expert medical translator and editor.
Your task is to refine a translation based on expert review feedback.

Requirements:
- Incorporate the reviewer's suggestions to improve accuracy, fluency, and terminology.
- Ensure the tone is professional and appropriate for medical contexts.
- Strictly maintain the original meaning of the source text.
- Return ONLY the revised translation. Do not include any notes or explanations.
${glossaryInstruction}`;

  const userPrompt = `Source Text (${sourceLang}):
${sourceText}

Current Translation (${targetLang}):
${translatedText}

Expert Reviewer Feedback:
${reflectionNotes}

Please provide the final, revised translation based on this feedback:`;

  let result = await getCompletion(aiConfig, userPrompt, systemPrompt);
  // Cleanup potential markdown blocks
  result = result.replace(/^```(json|text|markdown)?\n/i, '').replace(/\n```$/, '').trim();
  return result;
};

/**
 * Post-processing step to identify and tag terms in a final polished translation.
 * This is used when generation was done without tags to ensure high fluency,
 * but we still want UI highlighting.
 */
export const markTerminologyInTranslation = async (
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary: { source: string; target: string; id: string }[]
): Promise<string> => {
  if (!glossary || glossary.length === 0) return translatedText;

  // Provide richer context for the aligner
  const glossaryList = glossary.map(g => `- Concept ID: ${g.id} | Source: "${g.source}" | Likely Target: "${g.target}"`).join("\n");

  const systemPrompt = `You are a text processing engine specializing in medical terminology alignment.
Your goal is to apply ID tags to a translated text based on a provided glossary, without altering the text content.

Input Data:
1. Polished Translation: The text to be tagged.
2. Glossary: A list of terms (ID, Source, Likely Target) that exist in the text.

Instructions:
1. Read the "Polished Translation".
2. For each term in the Glossary, locate its corresponding translated phrase in the text.
   - Look for the "Likely Target" or a close synonym/variation used in the translation.
3. Wrap the identified phrase in the translation with ⦗...|ID⦘.
   - Example: If the text is "The heart rate is stable" and glossary has ID:123 for "heart", output "The ⦗heart|123⦘ rate is stable".
4. OUTPUT THE EXACT TEXT provided, with NO changes to words, grammar, punctuation, or capitalization. ONLY add the tags.
5. Do not output any conversational text, headers, footers, or labels like "Output:" or "Translation:".
6. If a term is not found, do nothing for that term.`;

  const userPrompt = `Polished Translation:
${translatedText}

Glossary:
${glossaryList}

Output the tagged text:`;

  let result = await getCompletion(aiConfig, userPrompt, systemPrompt);
  
  // Aggressive cleanup to remove potential Markdown wrappers or labels and extra words
  result = result.trim();
  // Remove wrapping markdown code blocks
  result = result.replace(/^```(json|text|markdown)?\n/i, '').replace(/\n```$/, '');
  // Remove common labels if the model hallucinates them
  result = result.replace(/^(Here is the tagged text|Output|Tagged Output|Translation):/i, '').trim();

  return result;
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
 * Helper to strip the special tags from the text for display/clipboard
 */
export const stripTags = (text: string): string => {
  return text.replace(/⦗(.*?)\|.*?⦘/g, '$1');
};

/**
 * Parses text containing ⦗Phrase|ID⦘ tags and builds TextSegments
 */
export const parseTaggedText = (text: string, terms: Term[]): TextSegment[] => {
  const segments: TextSegment[] = [];
  const regex = /⦗(.*?)\|(.*?)⦘/g;
  let lastIndex = 0;
  let match;
  
  const termMap = new Map(terms.map(t => [t.id, t]));
  const termCounts = new Map<string, number>();

  while ((match = regex.exec(text)) !== null) {
    // Text before the tag
    if (match.index > lastIndex) {
      segments.push({
        id: `seg_plain_${lastIndex}`,
        text: text.slice(lastIndex, match.index)
      });
    }
    
    // The tagged term
    const phrase = match[1];
    const id = match[2];
    const term = termMap.get(id);
    
    let occurrenceIndex = 0;
    if (term) {
       occurrenceIndex = termCounts.get(id) || 0;
       termCounts.set(id, occurrenceIndex + 1);
    }
    
    segments.push({
      id: `seg_term_${match.index}`,
      text: phrase,
      matchedTerm: term,
      termOccurrenceIndex: occurrenceIndex
    });
    
    lastIndex = regex.lastIndex;
  }
  
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({
      id: `seg_plain_${lastIndex}`,
      text: text.slice(lastIndex)
    });
  }
  
  if (segments.length === 0) {
    return [{ id: 'seg_full', text }];
  }
  
  return segments;
};

/**
 * Pure function to scan text and return segments with identified terms.
 * Implements strict "Longest Match First" strategy.
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
  
  // Descriptors used to build the master regex
  const descriptors: { pattern: string; length: number }[] = [];
  const seenPatterns = new Set<string>();

  terms.forEach(term => {
    const rawString = mode === 'source' ? term.chinese_term : term.english_term;
    if (!rawString || !rawString.trim()) return;

    // Use normalized key for lookup
    const key = normalizeKey(rawString);
    // Store ONLY the first term encountered for duplicates (system vs user priority handled by array order)
    if (!termMap.has(key)) {
      termMap.set(key, term);
    }

    // Build Regex Pattern
    let pattern = escapeRegExp(rawString.trim());
    
    // Allow flexible whitespace matches.
    // Note: escapeRegExp does not escape spaces, so we must match literal spaces
    pattern = pattern.replace(/\s+/g, '\\s+');

    // Add word boundaries for English mode to prevent partial matches
    if (mode === 'translation') {
      // Check if original string starts/ends with word char
      const isWordStart = /^\w/.test(rawString.trim());
      const isWordEnd = /\w$/.test(rawString.trim());
      
      if (isWordStart) pattern = '\\b' + pattern;
      if (isWordEnd) pattern = pattern + '\\b';
    }

    if (!seenPatterns.has(pattern)) {
        seenPatterns.add(pattern);
        descriptors.push({
            pattern,
            // Store original text length for sorting. This is CRITICAL.
            // Longer strings must come first in the regex OR choice.
            length: rawString.trim().length 
        });
    }
  });

  if (descriptors.length === 0) {
    return [{ id: 'seg_0', text }];
  }

  // 2. Sort patterns by length descending to ensure greedy matching (Longest Match First)
  // This is the core logic fix: (Longer|Short) regex ensures Longer is matched if both start at same position.
  descriptors.sort((a, b) => {
    const lenDiff = b.length - a.length;
    if (lenDiff !== 0) return lenDiff;
    // Tie-breaker: Alphabetical for determinism
    return a.pattern.localeCompare(b.pattern);
  });

  // 3. Create Master Regex
  // The capturing group `(...)` is essential for finding the match.
  const masterRegex = new RegExp(`(${descriptors.map(d => d.pattern).join('|')})`, 'gi');

  // 4. Scan with exec loop to implement "skip and continue"
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segIndex = 0;
  
  // Track occurrences for specific term IDs to support 1-to-1 mapping highlights
  const termCounts = new Map<string, number>();

  while ((match = masterRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchText = match[0];
    const matchEnd = matchStart + matchText.length;

    // Add plain text before match
    if (matchStart > lastIndex) {
        segments.push({
            id: `seg_${mode}_${segIndex++}`,
            text: text.slice(lastIndex, matchStart)
        });
    }

    // Identify Term
    const lookupKey = normalizeKey(matchText);
    const matchedTerm = termMap.get(lookupKey);
    
    let occurrenceIndex: number | undefined = undefined;
    if (matchedTerm) {
        const count = termCounts.get(matchedTerm.id) || 0;
        occurrenceIndex = count;
        termCounts.set(matchedTerm.id, count + 1);
    }

    segments.push({
        id: `seg_${mode}_${segIndex++}`,
        text: matchText,
        matchedTerm: matchedTerm || undefined,
        termOccurrenceIndex: occurrenceIndex
    });

    // Advance cursor to end of match (Skipping nested matches implicitly)
    lastIndex = matchEnd;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
        id: `seg_${mode}_${segIndex++}`,
        text: text.slice(lastIndex)
    });
  }

  return segments;
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


// --- Unified Translation API ---

export interface TranslationResult {
  finalText: string;
  reflectionNotes?: string;
}

export interface TranslateOptions {
  maxTokensPerChunk?: number;
  glossary?: { source: string; target: string; id: string }[];
  sourceLang?: string;
  targetLang?: string;
  onProgress?: (status: string) => void; 
}

/**
 * Top-level orchestration function for translating text.
 * Automatically chooses between single-chunk and multi-chunk strategies based on text length.
 */
export const translateText = async (
  sourceText: string,
  mode: 'fast' | 'professional',
  aiConfig: LLMConfig,
  options: TranslateOptions = {}
): Promise<TranslationResult> => {
  const { 
    maxTokensPerChunk = 1000, 
    glossary = [], 
    sourceLang = 'Chinese',
    targetLang = 'English',
    onProgress
  } = options;

  const totalTokens = getTokenCount(sourceText);
  
  // Decide Strategy
  if (totalTokens <= maxTokensPerChunk) {
    // === Single Chunk Strategy ===
    if (onProgress) onProgress(mode === 'fast' ? 'Translating...' : 'Drafting...');
    
    // 1. Initial Translation
    // Fast Mode: Enforce tags immediately
    // Pro Mode: Raw draft
    const draft = await initialTranslate(
      sourceText, 
      sourceLang, 
      targetLang, 
      aiConfig, 
      glossary, 
      { enforceTags: mode === 'fast' }
    );
    
    if (mode === 'fast') {
      return { finalText: draft };
    }

    // Professional Mode Steps
    if (onProgress) onProgress('Reviewing...');
    const reflection = await reflectOnTranslation(sourceText, draft, sourceLang, targetLang, aiConfig);
    
    if (onProgress) onProgress('Polishing...');
    const improved = await improveTranslation(
      sourceText, 
      draft, 
      reflection, 
      sourceLang, 
      targetLang, 
      aiConfig, 
      glossary, 
      { enforceTags: false } // Still clean text
    );
    
    if (onProgress) onProgress('Finalizing...');
    const final = await markTerminologyInTranslation(sourceText, improved, sourceLang, targetLang, aiConfig, glossary);
    
    return { finalText: final, reflectionNotes: reflection };

  } else {
    // === Multi Chunk Strategy ===
    const chunkSize = calculateChunkSize(totalTokens, maxTokensPerChunk);
    const chunks = splitTextIntoChunks(sourceText, chunkSize);
    
    const results: string[] = [];
    const reflections: string[] = [];

    // Process chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const progressPrefix = `Part ${i + 1}/${chunks.length}`;
      
      // Filter glossary for this chunk to optimize context
      // Simple case-insensitive match
      const chunkLower = chunk.toLowerCase();
      const chunkGlossary = glossary.filter(g => chunkLower.includes(g.source.toLowerCase()));

      if (mode === 'fast') {
        if (onProgress) onProgress(`${progressPrefix}: Translating...`);
        const text = await initialTranslate(
          chunk, 
          sourceLang, 
          targetLang, 
          aiConfig, 
          chunkGlossary, 
          { enforceTags: true }
        );
        results.push(text);
      } else {
        // Professional Mode
        if (onProgress) onProgress(`${progressPrefix}: Drafting...`);
        const draft = await initialTranslate(
          chunk, 
          sourceLang, 
          targetLang, 
          aiConfig, 
          chunkGlossary, 
          { enforceTags: false }
        );
        
        if (onProgress) onProgress(`${progressPrefix}: Reviewing...`);
        const reflection = await reflectOnTranslation(chunk, draft, sourceLang, targetLang, aiConfig);
        reflections.push(`[Part ${i+1}] ${reflection}`);
        
        if (onProgress) onProgress(`${progressPrefix}: Polishing...`);
        const improved = await improveTranslation(
          chunk, 
          draft, 
          reflection, 
          sourceLang, 
          targetLang, 
          aiConfig, 
          chunkGlossary, 
          { enforceTags: false }
        );
        
        if (onProgress) onProgress(`${progressPrefix}: Finalizing...`);
        const final = await markTerminologyInTranslation(chunk, improved, sourceLang, targetLang, aiConfig, chunkGlossary);
        results.push(final);
      }
    }

    // Join results
    // We assume chunks roughly correspond to paragraphs or logical blocks, so joining with newline is safe
    return {
      finalText: results.join('\n\n'), // Double newline to ensure paragraph separation
      reflectionNotes: reflections.join('\n\n')
    };
  }
};
