
import { Term } from '../types';
import { getCompletion, LLMConfig } from './llm';
import { getTokenCount, calculateChunkSize, splitTextIntoChunks } from './translationChunkUtils';

export interface TextSegment {
  id: string;
  text: string;
  matchedTerm?: Term;
  termOccurrenceIndex?: number; // Tracks which occurrence of the term this is (0, 1, 2...)
  matchType?: 'strong' | 'weak'; // Differentiates Exact vs Core matches
  visualType?: LocalMatchVisualType;
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

export type LocalMatchVisualType = 'term' | 'phrase' | 'parameter';
export type StrictReferenceType = 'sentence' | 'slogan';

export const TERM_TYPE_MATCH_RULES = {
  '术语': { matchMode: 'local', visualType: 'term', label: '术语', priority: 3 },
  '词语': { matchMode: 'local', visualType: 'phrase', label: '词语/短语', priority: 2 },
  '参数': { matchMode: 'local', visualType: 'parameter', label: '参数', priority: 1 },
  '句子': { matchMode: 'strict-reference', referenceType: 'sentence', label: '整句匹配', priority: 1 },
  '标语': { matchMode: 'strict-reference', referenceType: 'slogan', label: '标语匹配', priority: 1 },
} as const;

type LocalTermType = '术语' | '词语' | '参数';
type StrictReferenceTermType = '句子' | '标语';

export interface StrictReferenceMatch {
  id: string;
  start: number;
  end: number;
  text: string;
  term: Term;
  referenceType: StrictReferenceType;
}

export type StrictSentenceMatch = StrictReferenceMatch;

export const isTermMatchEnabled = (term: Term) => term.highlight_enabled !== false;

const getTermType = (term: Term): keyof typeof TERM_TYPE_MATCH_RULES => {
  return term.term_type && term.term_type in TERM_TYPE_MATCH_RULES
    ? term.term_type as keyof typeof TERM_TYPE_MATCH_RULES
    : '术语';
};

const isLocalMatchTerm = (term: Term): term is Term & { term_type?: LocalTermType } => {
  const type = getTermType(term);
  return type === '术语' || type === '词语' || type === '参数';
};

const isSingleChineseCharacter = (value: string) => /^\p{Script=Han}$/u.test(value.trim());

const canUseLocalPattern = (term: Term, value: string) => {
  return term.allow_single_character_match === true || !isSingleChineseCharacter(value);
};

const isStrictReferenceTerm = (term: Term): term is Term & { term_type: StrictReferenceTermType } => {
  const type = getTermType(term);
  return type === '句子' || type === '标语';
};

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
const findMatchesLegacy = (
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

const findMatches = (
  text: string,
  termMap: Map<string, Term>,
  _useCore: boolean = false,
  mode: 'source' | 'translation'
): { start: number; end: number; term: Term; text: string }[] => {
  const matches: { start: number; end: number; term: Term; text: string }[] = [];

  termMap.forEach((term, key) => {
    let pattern = escapeRegExp(key).replace(/\s+/g, '\\s+');
    if (mode === 'translation') {
      pattern = pattern
        .replace(/\\\(/g, '\\s*\\(\\s*')
        .replace(/\\\)/g, '\\s*\\)\\s*');
      if (/^\w/.test(key)) pattern = `\\b${pattern}`;
      if (/\w$/.test(key)) pattern = `${pattern}(?:e?s)?\\b`;
    }

    const regex = new RegExp(pattern, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        term,
        text: match[0],
      });
      if (match[0].length === 0) regex.lastIndex++;
    }
  });

  return matches;
};

const SENTENCE_BOUNDARY_CHARS = new Set([
  '.', '?', '!', ';',
  '。', '？', '！', '；',
]);

const toHalfWidth = (char: string) => char.normalize('NFKC');

const isIgnoredForStrictSentenceMatch = (char: string) => {
  if (!char) return true;
  const normalized = toHalfWidth(char);
  return /\s/u.test(normalized) || /\p{P}/u.test(normalized);
};

const isSentenceBoundaryChar = (char: string) => {
  if (!char) return false;
  return SENTENCE_BOUNDARY_CHARS.has(toHalfWidth(char));
};

const normalizeStrictSentenceText = (text: string) => {
  let normalized = '';
  const indexMap: number[] = [];
  let originalOffset = 0;

  Array.from(text).forEach((char) => {
    const currentOffset = originalOffset;
    originalOffset += char.length;

    const halfWidth = toHalfWidth(char);
    if (isIgnoredForStrictSentenceMatch(halfWidth)) return;

    normalized += halfWidth.toLowerCase();
    indexMap.push(currentOffset);
  });

  return { normalized, indexMap };
};

const hasLeftSentenceBoundary = (text: string, start: number) => {
  for (let i = start - 1; i >= 0; i--) {
    const char = text[i];
    if (/\s/u.test(char)) continue;
    if (isSentenceBoundaryChar(char)) return true;
    if (isIgnoredForStrictSentenceMatch(char)) continue;
    return false;
  }

  return true;
};

const getRightBoundary = (text: string, end: number) => {
  let expandedEnd = end;

  for (let i = end; i < text.length; i++) {
    const char = text[i];
    if (/\s/u.test(char)) continue;

    if (isSentenceBoundaryChar(char)) {
      return { isBoundary: true, end: i + 1 };
    }

    if (isIgnoredForStrictSentenceMatch(char)) {
      expandedEnd = i + 1;
      continue;
    }

    return { isBoundary: false, end };
  }

  return { isBoundary: true, end: expandedEnd };
};

/**
 * Finds strict whole-sentence reference matches independently from term highlighting.
 * Matching ignores whitespace, punctuation, full-width/half-width differences, and case,
 * but still maps the result back to original source text positions for rendering.
 */
const findStrictSentenceMatchesLegacy = (
  text: string,
  terms: Term[],
  options: { mode: 'source' | 'translation' }
): StrictSentenceMatch[] => {
  if (!text || !terms || terms.length === 0) return [];

  const { normalized, indexMap } = normalizeStrictSentenceText(text);
  if (!normalized) return [];

  const candidates: StrictSentenceMatch[] = [];

  terms.forEach(term => {
    if (!isTermMatchEnabled(term) || term.term_type !== '句子') return;

    const referenceText = options.mode === 'source' ? term.chinese_term : term.english_term;
    const normalizedReference = normalizeStrictSentenceText(referenceText || '').normalized;
    if (!normalizedReference) return;

    let searchFrom = 0;
    while (searchFrom <= normalized.length) {
      const normalizedStart = normalized.indexOf(normalizedReference, searchFrom);
      if (normalizedStart === -1) break;

      const normalizedEnd = normalizedStart + normalizedReference.length - 1;
      const originalStart = indexMap[normalizedStart];
      const originalEnd = indexMap[normalizedEnd] + 1;
      const rightBoundary = getRightBoundary(text, originalEnd);

      if (hasLeftSentenceBoundary(text, originalStart) && rightBoundary.isBoundary) {
        const end = rightBoundary.end;
        candidates.push({
          id: `sentence_${originalStart}_${end}_${term.id}`,
          start: originalStart,
          end,
          text: text.slice(originalStart, end),
          term,
          referenceType: 'sentence',
        });
      }

      searchFrom = normalizedStart + 1;
    }
  });

  candidates.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) return lenB - lenA;
    return a.start - b.start;
  });

  const coverage = new Array(text.length).fill(false);
  const finalMatches: StrictSentenceMatch[] = [];

  candidates.forEach(match => {
    for (let i = match.start; i < match.end; i++) {
      if (coverage[i]) return;
    }

    for (let i = match.start; i < match.end; i++) coverage[i] = true;
    finalMatches.push(match);
  });

  return finalMatches.sort((a, b) => a.start - b.start);
};

interface StrictReferenceCandidate {
  start: number;
  end: number;
  term: Term;
  termIndex: number;
  referenceType: StrictReferenceType;
}

const COMMA_REFERENCE_CONNECTOR = /^[,，\s]+$/u;

const normalizeStrictReferenceText = (text: string) => {
  let normalized = '';
  const indexMap: Array<{ start: number; end: number }> = [];
  let offset = 0;

  for (const char of text) {
    const start = offset;
    offset += char.length;
    const halfWidth = toHalfWidth(char);
    if (isIgnoredForStrictSentenceMatch(halfWidth)) continue;
    normalized += halfWidth.toLowerCase();
    indexMap.push({ start, end: offset });
  }

  return { normalized, indexMap };
};

const hasStrictReferenceLeftBoundary = (text: string, start: number) => {
  for (let index = start - 1; index >= 0; index--) {
    const char = text[index];
    if (/\s/u.test(char)) continue;
    if (isSentenceBoundaryChar(char)) return true;
    if (isIgnoredForStrictSentenceMatch(char)) continue;
    return false;
  }
  return true;
};

const getStrictReferenceRightBoundary = (text: string, end: number) => {
  let expandedEnd = end;
  for (let index = end; index < text.length; index++) {
    const char = text[index];
    if (/\s/u.test(char)) {
      expandedEnd = index + 1;
      continue;
    }
    if (isSentenceBoundaryChar(char)) return { isBoundary: true, end: index + 1 };
    if (isIgnoredForStrictSentenceMatch(char)) {
      expandedEnd = index + 1;
      continue;
    }
    return { isBoundary: false, end };
  }
  return { isBoundary: true, end: expandedEnd };
};

const isCommaConnectedReference = (
  text: string,
  left: StrictReferenceCandidate,
  right: StrictReferenceCandidate
) => left.end <= right.start && COMMA_REFERENCE_CONNECTOR.test(text.slice(left.end, right.start));

/**
 * Finds full sentence and slogan references. It deliberately keeps strict references
 * separate from local term matching, while allowing comma-only chains of complete
 * references to be rendered as separate regions.
 */
export const findStrictReferenceMatches = (
  text: string,
  terms: Term[],
  options: { mode: 'source' | 'translation' }
): StrictReferenceMatch[] => {
  if (!text || terms.length === 0) return [];

  const { normalized, indexMap } = normalizeStrictReferenceText(text);
  if (!normalized) return [];

  const candidates: StrictReferenceCandidate[] = [];
  terms.forEach((term, termIndex) => {
    if (!isTermMatchEnabled(term) || !isStrictReferenceTerm(term)) return;

    const referenceText = options.mode === 'source' ? term.chinese_term : term.english_term;
    const normalizedReference = normalizeStrictReferenceText(referenceText || '').normalized;
    if (!normalizedReference) return;

    let searchFrom = 0;
    while (searchFrom <= normalized.length) {
      const normalizedStart = normalized.indexOf(normalizedReference, searchFrom);
      if (normalizedStart === -1) break;
      const normalizedEnd = normalizedStart + normalizedReference.length - 1;
      const termType = getTermType(term) as StrictReferenceTermType;
      candidates.push({
        start: indexMap[normalizedStart].start,
        end: indexMap[normalizedEnd].end,
        term,
        termIndex,
        referenceType: TERM_TYPE_MATCH_RULES[termType].referenceType,
      });
      searchFrom = normalizedStart + 1;
    }
  });

  const hasLeftBoundary = (candidate: StrictReferenceCandidate, seen = new Set<StrictReferenceCandidate>()): boolean => {
    if (hasStrictReferenceLeftBoundary(text, candidate.start)) return true;
    if (seen.has(candidate)) return false;
    const nextSeen = new Set(seen).add(candidate);
    return candidates.some(previous => isCommaConnectedReference(text, previous, candidate) && hasLeftBoundary(previous, nextSeen));
  };

  const getRightBoundary = (candidate: StrictReferenceCandidate, seen = new Set<StrictReferenceCandidate>()): { isBoundary: boolean; end: number } => {
    const directBoundary = getStrictReferenceRightBoundary(text, candidate.end);
    if (directBoundary.isBoundary || seen.has(candidate)) return directBoundary;
    const nextSeen = new Set(seen).add(candidate);
    const connected = candidates.find(next => isCommaConnectedReference(text, candidate, next) && getRightBoundary(next, nextSeen).isBoundary);
    return connected ? { isBoundary: true, end: candidate.end } : directBoundary;
  };

  const validCandidates = candidates
    .map(candidate => {
      const rightBoundary = getRightBoundary(candidate);
      if (!hasLeftBoundary(candidate) || !rightBoundary.isBoundary) return null;
      return { ...candidate, end: rightBoundary.end };
    })
    .filter((candidate): candidate is StrictReferenceCandidate => candidate !== null)
    .sort((a, b) => {
      const lengthA = a.end - a.start;
      const lengthB = b.end - b.start;
      if (lengthA !== lengthB) return lengthB - lengthA;
      return a.termIndex - b.termIndex;
    });

  const coverage = new Array(text.length).fill(false);
  const matches: StrictReferenceMatch[] = [];
  validCandidates.forEach(candidate => {
    for (let index = candidate.start; index < candidate.end; index++) {
      if (coverage[index]) return;
    }
    for (let index = candidate.start; index < candidate.end; index++) coverage[index] = true;
    matches.push({
      id: `${candidate.referenceType}_${candidate.start}_${candidate.end}_${candidate.term.id}`,
      start: candidate.start,
      end: candidate.end,
      text: text.slice(candidate.start, candidate.end),
      term: candidate.term,
      referenceType: candidate.referenceType,
    });
  });

  return matches.sort((a, b) => a.start - b.start);
};

/** Backward-compatible sentence-only view of the unified strict reference matcher. */
export const findStrictSentenceMatches = (
  text: string,
  terms: Term[],
  options: { mode: 'source' | 'translation' }
): StrictSentenceMatch[] => {
  return findStrictReferenceMatches(text, terms, options)
    .filter(match => match.referenceType === 'sentence');
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
  const compareLocalMatches = (
    a: { start: number; end: number; term: Term },
    b: { start: number; end: number; term: Term }
  ) => {
    const weightA = a.term.highlight_weight ?? 0;
    const weightB = b.term.highlight_weight ?? 0;
    if (weightA !== weightB) return weightB - weightA;

    const lengthA = a.end - a.start;
    const lengthB = b.end - b.start;
    if (lengthA !== lengthB) return lengthB - lengthA;
    return terms.indexOf(a.term) - terms.indexOf(b.term);
  };
  
  // Maps for lookup
  const strongMap = new Map<string, Term>();
  const weakMap = new Map<string, Term>();

  terms.forEach(term => {
      if (!isTermMatchEnabled(term) || !isLocalMatchTerm(term)) return;

      // 1. Setup Strong Match Keys
      const primary = mode === 'source' ? term.chinese_term : term.english_term;
      if (primary && canUseLocalPattern(term, primary) && !strongMap.has(normalizeKey(primary))) {
        strongMap.set(normalizeKey(primary), term);
      }
      
      // Aliases are treated as Strong matches
      if (term.related_terms && term.related_terms.length > 0) {
          term.related_terms.forEach(alias => {
            if (!canUseLocalPattern(term, alias)) return;
            const aliasKey = normalizeKey(alias);
            if (!strongMap.has(aliasKey)) strongMap.set(aliasKey, term);
          });
      }

      // 2. Setup Weak Match Keys (Core Terms)
      const core = mode === 'source' ? term.coreCN : term.coreEN;
      if (core && canUseLocalPattern(term, core)) {
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
  strongMatches.sort(compareLocalMatches);

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
      weakMatches.sort(compareLocalMatches);

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
          matchType: m.type,
          visualType: getTermType(m.term) === '词语'
            ? 'phrase'
            : getTermType(m.term) === '参数'
              ? 'parameter'
              : 'term'
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
