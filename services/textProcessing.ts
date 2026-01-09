
import { Term } from '../types';
import { getCompletion, LLMConfig } from './llm';
import { getTokenCount, calculateChunkSize, splitTextIntoChunks } from './translationChunkUtils';

export interface TextSegment {
  id: string;
  text: string;
  matchedTerm?: Term;
  termOccurrenceIndex?: number; // Tracks which occurrence of the term this is (0, 1, 2...)
  matchType?: 'strong' | 'weak'; // Differentiates Exact vs Core matches
}

export interface TermSpan {
  start: number;
  end: number;
}

export interface TermAlignment {
  termId: string;
  sourceSpans: TermSpan[];
  targetSpans: TermSpan[];
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
 */
export const initialTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary?: { source: string; target: string; id: string }[],
  options: { enforceTags?: boolean } = {} 
): Promise<string> => {
  
  let glossaryInstruction = "";
  if (glossary && glossary.length > 0) {
      const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}"`).join("\n");
      glossaryInstruction = `
${TERMINOLOGY_GUIDANCE}

Reference Dictionary:
${glossaryList}

Instructions:
- Use the provided glossary translations for the corresponding source terms.
- Do NOT add any special tags, brackets, or labels in the output. 
- Just produce natural, professional text that incorporates the terminology.
`;
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
 */
export const improveTranslation = async (
  sourceText: string,
  translatedText: string,
  reflectionNotes: string,
  sourceLang: string,
  targetLang: string,
  aiConfig: LLMConfig,
  glossary?: { source: string; target: string; id: string }[],
  options: { enforceTags?: boolean } = {}
): Promise<string> => {
  
  let glossaryInstruction = "";
  if (glossary && glossary.length > 0) {
      const glossaryList = glossary.map(g => `- "${g.source}" -> "${g.target}"`).join("\n");
      glossaryInstruction = `
${TERMINOLOGY_GUIDANCE}

MANDATORY GLOSSARY ENFORCEMENT:
${glossaryList}

CRITICAL: You MUST incorporate the glossary terms into the final translation.
Do NOT use special brackets or tags. Just integrate the terms naturally and grammatically into the sentence.
`;
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

// --- Alignment Logic ---

export const alignTermsWithLLM = async (
  sourceText: string,
  translatedText: string,
  terms: Term[],
  aiConfig: LLMConfig
): Promise<TermAlignment[]> => {
    if (!terms || terms.length === 0) return [];
    if (!sourceText || !translatedText) return [];

    // Prepare concise dictionary for prompt
    const termListJSON = terms.map(t => ({
        id: t.id,
        chinese_term: t.chinese_term,
        english_term: t.english_term,
        related_terms: t.related_terms
    }));

    const systemPrompt = `You are a medical translation alignment assistant.

You will receive:
1) Source Chinese paragraph:
   {{sourceText}}

2) Final English translation of that paragraph:
   {{translatedText}}

3) A medical term dictionary:
   Each entry has: id, chinese_term, english_term, related_terms.

Task:
- For each term, decide whether its meaning appears in the source and in the translation.
- Even if the exact wording is not identical (e.g. minor wording changes or missing words),
  try to find the substring that most closely expresses that term.
- For each occurrence, return character index ranges (start, end, 0-based, end exclusive)
  for:
    - sourceSpans: positions in the Chinese source text
    - targetSpans: positions in the English translation

Output STRICTLY in JSON with this shape:
[
  {
    "termId": "sys_123",
    "sourceSpans": [{ "start": 10, "end": 14 }],
    "targetSpans": [{ "start": 120, "end": 145 }]
  },
  ...
]

- Do NOT modify the translation text.
- Do NOT add explanations, comments, or extra fields.
Only output the JSON array.`;

    const userPrompt = `Source Text:
${sourceText}

Translated Text:
${translatedText}

Term Dictionary:
${JSON.stringify(termListJSON)}
`;

    try {
        let result = await getCompletion(aiConfig, userPrompt, systemPrompt);
        // Clean markdown
        result = result.replace(/^```(json)?\n/i, '').replace(/\n```$/, '').trim();
        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Alignment failed", e);
        return [];
    }
};

/**
 * Helper to convert alignment data into TextSegments for rendering.
 */
export const segmentsFromAlignments = (
  text: string,
  alignments: TermAlignment[],
  side: 'source' | 'target',
  allTerms: Term[]
): TextSegment[] => {
    // 1. Collect all spans
    const spans: { start: number, end: number, termId: string }[] = [];
    alignments.forEach(align => {
        const sideSpans = side === 'source' ? align.sourceSpans : align.targetSpans;
        if (sideSpans) {
            sideSpans.forEach(s => {
                spans.push({ start: s.start, end: s.end, termId: align.termId });
            });
        }
    });

    // 2. Sort by start index
    spans.sort((a, b) => a.start - b.start);

    // 3. Build segments (First win strategy for overlapping)
    const segments: TextSegment[] = [];
    let currentIdx = 0;
    const termMap = new Map(allTerms.map(t => [t.id, t]));
    const termCounts = new Map<string, number>();

    for (const span of spans) {
        if (span.start < currentIdx) continue; // Skip overlaps

        // Plain text before match
        if (span.start > currentIdx) {
            segments.push({
                id: `seg_${side}_plain_${currentIdx}`,
                text: text.slice(currentIdx, span.start)
            });
        }

        // Match
        const term = termMap.get(span.termId);
        let occurrenceIndex = 0;
        if (term) {
             const c = termCounts.get(term.id) || 0;
             occurrenceIndex = c;
             termCounts.set(term.id, c + 1);
        }

        segments.push({
            id: `seg_${side}_term_${span.start}`,
            text: text.slice(span.start, span.end),
            matchedTerm: term,
            termOccurrenceIndex: occurrenceIndex,
            matchType: 'strong' // AI aligned matches are considered strong contextually
        });

        currentIdx = span.end;
    }

    // Remaining text
    if (currentIdx < text.length) {
        segments.push({
            id: `seg_${side}_plain_${currentIdx}`,
            text: text.slice(currentIdx)
        });
    }

    return segments;
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
 * Internal helper to find matches for a given set of string patterns.
 * Returns sorted ranges.
 */
const findMatches = (
  text: string, 
  termMap: Map<string, Term>, 
  useCore: boolean = false, 
  mode: 'source' | 'translation'
): { start: number; end: number; term: Term; text: string }[] => {
    // Store term with descriptor
    const descriptors: { pattern: string; length: number; term: Term }[] = [];
    const seenPatterns = new Set<string>();

    termMap.forEach((term, key) => {
        let patternStr = escapeRegExp(key);
        
        // Convert whitespace to flexible regex whitespace
        patternStr = patternStr.replace(/\s+/g, '\\s+');

        if (mode === 'translation') {
            // 1. Flexible parentheses: ignore spaces around them
            // key is escaped, so parens are '\(' and '\)'
            patternStr = patternStr
                .replace(/\\\(/g, '\\s*\\(\\s*')
                .replace(/\\\)/g, '\\s*\\)\\s*');

            // 2. English word boundaries and plurals
            const isWordStart = /^\w/.test(key);
            const isWordEnd = /\w$/.test(key);

            if (isWordStart) {
                patternStr = '\\b' + patternStr;
            }
            if (isWordEnd) {
                // Support optional 's' or 'es' at end of term
                patternStr = patternStr + '(?:e?s)?\\b';
            }
        }

        if (!seenPatterns.has(patternStr)) {
            seenPatterns.add(patternStr);
            descriptors.push({
                pattern: patternStr,
                length: key.length,
                term: term
            });
        }
    });

    if (descriptors.length === 0) return [];

    // Sort patterns by length (Longest Match First)
    descriptors.sort((a, b) => b.length - a.length);

    // Build massive regex
    const masterRegex = new RegExp(`(${descriptors.map(d => d.pattern).join('|')})`, 'gi');
    
    const matches: { start: number; end: number; term: Term; text: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = masterRegex.exec(text)) !== null) {
        const matchText = match[0];
        
        // Find which descriptor matched.
        // We reuse the pattern but ensure it matches the whole found string (case-insensitive)
        const matchedDescriptor = descriptors.find(desc => {
             return new RegExp(`^${desc.pattern}$`, 'i').test(matchText);
        });

        if (matchedDescriptor) {
            matches.push({
                start: match.index,
                end: match.index + matchText.length,
                term: matchedDescriptor.term,
                text: matchText
            });
        }
    }
    return matches;
};

/**
 * Pure function to scan text and return segments with identified terms.
 * Implements strict "Strong Match First" then "Weak Match" strategy.
 * 
 * 1. Strong Matches: chinese_term (or English equiv) fully matches.
 * 2. Weak Matches: coreCN (or coreEN) matches, but only in uncovered regions.
 */
export const buildTermSegments = (
  text: string,
  terms: Term[],
  options: { mode: 'source' | 'translation' }
): TextSegment[] => {
  if (!text) return [];

  const { mode } = options;
  
  // Maps for lookup
  const strongMap = new Map<string, Term>();
  const weakMap = new Map<string, Term>();

  terms.forEach(term => {
      // 1. Setup Strong Match Keys
      const primary = mode === 'source' ? term.chinese_term : term.english_term;
      if (primary) strongMap.set(normalizeKey(primary), term);
      
      // Aliases are treated as Strong matches
      if (term.related_terms && term.related_terms.length > 0) {
          term.related_terms.forEach(alias => strongMap.set(normalizeKey(alias), term));
      }

      // 2. Setup Weak Match Keys (Core Terms)
      const core = mode === 'source' ? term.coreCN : term.coreEN;
      if (core) {
          const coreKey = normalizeKey(core);
          // Only add to weak map if it's not already a strong key (prevent redundancy)
          if (!strongMap.has(coreKey)) {
              weakMap.set(coreKey, term);
          }
      }
  });

  // Coverage Mask (true = occupied)
  const coverage = new Array(text.length).fill(false);
  const finalMatches: { start: number; end: number; term: Term; text: string; type: 'strong' | 'weak' }[] = [];

  // --- PASS 1: Strong Matches ---
  const strongMatches = findMatches(text, strongMap, false, mode);
  
  // Sort by length desc (already done in helper) -> then by index to ensure deterministic First-Longest win
  strongMatches.sort((a, b) => {
      const lenA = a.end - a.start;
      const lenB = b.end - b.start;
      if (lenA !== lenB) return lenB - lenA; // Longest first
      return a.start - b.start; // First occurrence
  });

  strongMatches.forEach(m => {
      // Check collision
      let occupied = false;
      for (let i = m.start; i < m.end; i++) {
          if (coverage[i]) { occupied = true; break; }
      }
      
      if (!occupied) {
          // Mark coverage
          for (let i = m.start; i < m.end; i++) coverage[i] = true;
          finalMatches.push({ ...m, type: 'strong' });
      }
  });

  // --- PASS 2: Weak Matches (Now treated as Strong per request) ---
  if (weakMap.size > 0) {
      const weakMatches = findMatches(text, weakMap, true, mode);
      
      // Sort weak matches
      weakMatches.sort((a, b) => {
          const lenA = a.end - a.start;
          const lenB = b.end - b.start;
          if (lenA !== lenB) return lenB - lenA;
          return a.start - b.start;
      });

      weakMatches.forEach(m => {
          // Check collision with existing coverage (Strong matches)
          let occupied = false;
          for (let i = m.start; i < m.end; i++) {
              if (coverage[i]) { occupied = true; break; }
          }

          if (!occupied) {
              // Mark coverage
              for (let i = m.start; i < m.end; i++) coverage[i] = true;
              // CHANGE: Treat core/weak matches as 'strong' for uniform highlighting in Professional Mode context
              finalMatches.push({ ...m, type: 'strong' });
          }
      });
  }

  // --- Construct Segments ---
  // Sort final matches by position for segmentation
  finalMatches.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let segIndex = 0;
  const termCounts = new Map<string, number>();

  finalMatches.forEach(m => {
      // Gap text
      if (m.start > lastIndex) {
          segments.push({
              id: `seg_${mode}_${segIndex++}`,
              text: text.slice(lastIndex, m.start)
          });
      }

      const count = termCounts.get(m.term.id) || 0;
      termCounts.set(m.term.id, count + 1);

      segments.push({
          id: `seg_${mode}_${segIndex++}`,
          text: m.text,
          matchedTerm: m.term,
          termOccurrenceIndex: count,
          matchType: m.type
      });

      lastIndex = m.end;
  });

  // Trailing text
  if (lastIndex < text.length) {
      segments.push({
          id: `seg_${mode}_${segIndex++}`,
          text: text.slice(lastIndex)
      });
  }

  return segments;
};


// --- Unified Translation API ---

export interface TranslationResult {
  finalText: string;
  reflectionNotes?: string;
  alignments?: TermAlignment[];
}

export interface TranslateOptions {
  maxTokensPerChunk?: number;
  glossary?: { source: string; target: string; id: string }[];
  relevantTerms?: Term[];
  sourceLang?: string;
  targetLang?: string;
  onProgress?: (status: string) => void; 
}

/**
 * Top-level orchestration function for translating text.
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
    relevantTerms = [],
    sourceLang = 'Chinese',
    targetLang = 'English',
    onProgress
  } = options;

  const totalTokens = getTokenCount(sourceText);
  
  // Decide Strategy
  if (totalTokens <= maxTokensPerChunk) {
    // === Single Chunk Strategy ===
    if (onProgress) onProgress(mode === 'fast' ? 'Translating...' : 'Drafting...');
    
    // 1. Initial Translation (Pure Text)
    const draft = await initialTranslate(
      sourceText, 
      sourceLang, 
      targetLang, 
      aiConfig, 
      glossary
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
      glossary
    );

    // Alignment Step
    if (onProgress) onProgress('Aligning Terms...');
    const alignments = await alignTermsWithLLM(sourceText, improved, relevantTerms, aiConfig);
    
    return { finalText: improved, reflectionNotes: reflection, alignments };

  } else {
    // === Multi Chunk Strategy ===
    const chunkSize = calculateChunkSize(totalTokens, maxTokensPerChunk);
    const chunks = splitTextIntoChunks(sourceText, chunkSize);
    
    const results: string[] = [];
    const reflections: string[] = [];
    const allAlignments: TermAlignment[] = [];
    
    let sourceOffset = 0;
    let targetOffset = 0;

    // Process chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const progressPrefix = `Part ${i + 1}/${chunks.length}`;
      
      const chunkLower = chunk.toLowerCase();
      // Filter terms relevant to this chunk (using glossary logic for now)
      // Ideally we should use relevantTerms but filtering by string match is quick heuristic
      const chunkGlossary = glossary.filter(g => chunkLower.includes(g.source.toLowerCase()));
      // Filter relevantTerms similarly for alignment optimization (optional but good for context)
      // Using full relevantTerms is safer for alignment context
      
      let chunkResult = '';

      if (mode === 'fast') {
        if (onProgress) onProgress(`${progressPrefix}: Translating...`);
        chunkResult = await initialTranslate(
          chunk, 
          sourceLang, 
          targetLang, 
          aiConfig, 
          chunkGlossary
        );
        results.push(chunkResult);
      } else {
        // Professional Mode
        if (onProgress) onProgress(`${progressPrefix}: Drafting...`);
        const draft = await initialTranslate(
          chunk, 
          sourceLang, 
          targetLang, 
          aiConfig, 
          chunkGlossary
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
          chunkGlossary
        );
        
        chunkResult = improved;
        results.push(improved);

        // Alignment per chunk
        if (onProgress) onProgress(`${progressPrefix}: Aligning...`);
        const chunkAlignments = await alignTermsWithLLM(chunk, improved, relevantTerms, aiConfig);
        
        // Merge and Offset Alignments
        chunkAlignments.forEach(al => {
           let existing = allAlignments.find(a => a.termId === al.termId);
           if (!existing) {
               existing = { termId: al.termId, sourceSpans: [], targetSpans: [] };
               allAlignments.push(existing);
           }
           if (al.sourceSpans) {
              al.sourceSpans.forEach(s => existing!.sourceSpans.push({ 
                  start: s.start + sourceOffset, 
                  end: s.end + sourceOffset 
              }));
           }
           if (al.targetSpans) {
              al.targetSpans.forEach(s => existing!.targetSpans.push({ 
                  start: s.start + targetOffset, 
                  end: s.end + targetOffset 
              }));
           }
        });
      }

      // Update offsets
      sourceOffset += chunk.length;
      // We assume the final join will add \n\n (2 chars)
      targetOffset += chunkResult.length + 2; 
    }

    return {
      finalText: results.join('\n\n'), 
      reflectionNotes: reflections.join('\n\n'),
      alignments: mode === 'professional' ? allAlignments : undefined
    };
  }
};
