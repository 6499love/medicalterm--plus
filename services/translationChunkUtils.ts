
/**
 * Estimates the number of tokens in a text string.
 * 
 * Heuristic approach for client-side usage without heavy tokenizer libraries:
 * - CJK characters: ~1.5 tokens (conservative estimate for modern models like Gemini/GPT-4)
 * - English/Latin words: ~1.3 tokens
 * - Punctuation/Spaces: accounted for in word/char count heuristics
 * 
 * This is deterministic and fast.
 */
export const getTokenCount = (text: string): number => {
  if (!text) return 0;

  // 1. Count CJK characters (including punctuation ranges)
  // Ranges: 
  // \u4e00-\u9fa5 (CJK Unified Ideographs)
  // \u3000-\u303f (CJK Symbols and Punctuation)
  // \uff00-\uffef (Halfwidth and Fullwidth Forms)
  const cjkRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g;
  const cjkMatches = text.match(cjkRegex);
  const numCjk = cjkMatches ? cjkMatches.length : 0;

  // 2. Remove CJK and count "words" in the remaining text
  // Replace CJK with space to maintain boundaries, then replace non-word chars with space
  const nonCjkText = text.replace(cjkRegex, ' ').replace(/[^\w\s]/g, ' '); 
  const words = nonCjkText.trim().split(/\s+/).filter(w => w.length > 0);
  const numWords = words.length;

  // 3. Heuristic calculation
  return Math.ceil(numCjk * 1.5 + numWords * 1.3);
};

/**
 * Calculates an optimal chunk size to distribute text evenly.
 * 
 * Instead of filling chunks to the brim (e.g. 1000, 1000, 200),
 * this distributes them evenly (e.g. 740, 740, 740).
 * 
 * @param totalTokens Total estimated tokens in the text
 * @param targetPerChunk Desired max tokens per chunk (default 1000)
 */
export const calculateChunkSize = (totalTokens: number, targetPerChunk: number = 1000): number => {
  if (totalTokens <= targetPerChunk) return totalTokens;
  
  const numChunks = Math.ceil(totalTokens / targetPerChunk);
  // Ensure we don't return 0
  return Math.max(1, Math.ceil(totalTokens / numChunks));
};

/**
 * Recursively splits a segment if it exceeds the max token limit.
 * Tries separators in order: Sentences -> Clauses -> Hard split (halving).
 */
const splitSegmentRecursively = (text: string, maxLimit: number): string[] => {
  if (getTokenCount(text) <= maxLimit) return [text];

  // 1. Try Sentences (. ? ! 。 ？！)
  if (/[.?!。？！]/.test(text)) {
      const parts = text.split(/([.?!。？！]+)/).reduce((acc, curr) => {
           // Append delimiter to the last part
           if (/^[.?!。？！]+$/.test(curr)) {
               if (acc.length > 0) acc[acc.length - 1] += curr;
           } else if (curr) {
               acc.push(curr);
           }
           return acc;
      }, [] as string[]);
      
      // If splitting by sentences actually created multiple parts (not just one huge sentence)
      if (parts.length > 1) {
           return regroupChunks(parts, maxLimit);
      }
  }
  
  // 2. Try Clauses (, ; ， ；)
  if (/[;,，；]/.test(text)) {
      const parts = text.split(/([;,，；]+)/).reduce((acc, curr) => {
           if (/^[;,，；]+$/.test(curr)) {
               if (acc.length > 0) acc[acc.length - 1] += curr;
           } else if (curr) {
               acc.push(curr);
           }
           return acc;
      }, [] as string[]);
      
      if (parts.length > 1) {
           return regroupChunks(parts, maxLimit);
      }
  }

  // 3. Fallback: Binary Split
  // If no good semantic split point exists, split in half to guarantee progress
  const mid = Math.floor(text.length / 2);
  if (mid === 0) return [text]; // Can't split further
  
  const firstHalf = text.slice(0, mid);
  const secondHalf = text.slice(mid);
  
  return [
    ...splitSegmentRecursively(firstHalf, maxLimit),
    ...splitSegmentRecursively(secondHalf, maxLimit)
  ];
};

/**
 * Helper to group smaller parts into maximal chunks that fit the limit.
 */
const regroupChunks = (parts: string[], maxLimit: number): string[] => {
    const chunks: string[] = [];
    let current = '';
    
    for (const part of parts) {
        if (getTokenCount(current + part) <= maxLimit) {
            current += part;
        } else {
            if (current) {
                chunks.push(current);
                current = '';
            }
            if (getTokenCount(part) > maxLimit) {
                chunks.push(...splitSegmentRecursively(part, maxLimit));
            } else {
                current = part;
            }
        }
    }
    if (current) chunks.push(current);
    return chunks;
};

/**
 * Splits text into ordered chunks that fit within maxTokensPerChunk.
 * Preserves Paragraphs > Sentences > Clauses boundaries.
 */
export const splitTextIntoChunks = (text: string, maxTokensPerChunk: number): string[] => {
  if (getTokenCount(text) <= maxTokensPerChunk) return [text];

  const chunks: string[] = [];
  
  // Initial split by Paragraphs (newline)
  // We keep the newline attached to the preceding paragraph to preserve formatting
  const paraSegments = text.split(/(\n+)/).reduce((acc, curr, idx) => {
      if (idx > 0 && /^\n+$/.test(curr)) {
          if (acc.length > 0) acc[acc.length - 1] += curr;
          else acc.push(curr); // Leading newlines
      } else if (curr) {
          acc.push(curr);
      }
      return acc;
  }, [] as string[]);

  // Accumulate paragraphs
  let currentChunk = '';
  
  for (const para of paraSegments) {
      if (getTokenCount(currentChunk + para) <= maxTokensPerChunk) {
          currentChunk += para;
      } else {
          // Push current if it exists
          if (currentChunk) {
              chunks.push(currentChunk);
              currentChunk = '';
          }
          
          // If paragraph itself is huge, split it
          if (getTokenCount(para) > maxTokensPerChunk) {
              const subChunks = splitSegmentRecursively(para, maxTokensPerChunk);
              chunks.push(...subChunks);
          } else {
              currentChunk = para;
          }
      }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  
  return chunks;
};
