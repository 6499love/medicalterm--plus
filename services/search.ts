import Fuse from 'fuse.js';
import { Term, SearchResult } from '../types';
import { systemTermsData } from '../system_terms_data';


let systemTermsCache: Term[] | null = null;

export const fetchSystemTerms = async (): Promise<Term[]> => {
  if (systemTermsCache) return systemTermsCache;
  try {
    // Hydrate with source and IDs since they might be missing in JSON
    // We map the imported JSON data directly
    systemTermsCache = (systemTermsData as any[]).map((t: any, index: number) => ({
      ...t,
      id: `sys_${index}`,
      source: 'system',
      // Ensure fields exist even if JSON is partial
      chinese_term: t.chinese_term || '',
      english_term: t.english_term || '',
      pinyin_full: t.pinyin_full || '',
      pinyin_first: t.pinyin_first || '',
      category: t.category || '',
      note: t.note || '',
      usage: t.usage || '',
      root_analysis: t.root_analysis || '',
      mistranslation: t.mistranslation || []
    }));
    return systemTermsCache || [];
  } catch (error) {
    console.error('Failed to load system terms:', error);
    return [];
  }
};

// Helper to remove spaces and normalize
const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '');

/**
 * Normalizes user input for better matching:
 * - Trims whitespace
 * - Converts full-width characters to half-width
 * - Collapses multiple spaces
 */
export const normalizeInput = (str: string): string => {
  return str
    // Convert full-width alphanumeric/punctuation in range FF01-FF5E to half-width 21-7E
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // Convert full-width space to half-width space
    .replace(/\u3000/g, ' ')
    // Handle common Chinese punctuation not in the FF01 range if needed (e.g. 。 to .)
    // However, standard policy is often to keep specific CJK punctuation for context, 
    // but for search normalization we map standard ones:
    .replace(/。/g, '.')
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    // Trim and collapse spaces
    .trim()
    .replace(/\s+/g, ' ');
};

export const searchTerms = (
  query: string, 
  userTerms: Term[], 
  systemTerms: Term[], 
  fuzzyThreshold: number
): SearchResult[] => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const normalizedQuery = normalize(trimmedQuery);
  const lowerQuery = trimmedQuery.toLowerCase();

  // 1. Exact Match (User)
  const userExact = userTerms.filter(
    t => normalize(t.chinese_term) === normalizedQuery || normalize(t.english_term) === normalizedQuery
  );
  if (userExact.length > 0) {
    return userExact.map(t => ({ ...t, matchType: 'exact-user' }));
  }

  // 2. Exact Match (System)
  const systemExact = systemTerms.filter(
    t => normalize(t.chinese_term) === normalizedQuery || normalize(t.english_term) === normalizedQuery
  );
  if (systemExact.length > 0) {
    return systemExact.map(t => ({ ...t, matchType: 'exact-system' }));
  }

  // 3. Pinyin Match (Full & First Letter)
  // Check against both user and system terms
  const allTerms = [...userTerms, ...systemTerms];
  const pinyinMatches: SearchResult[] = [];

  allTerms.forEach(term => {
    // If pinyin fields are empty in JSON, this check will just skip or fail safely
    if (!term.pinyin_full && !term.pinyin_first) return;

    const normPinyinFull = normalize(term.pinyin_full || '');
    const normPinyinFirst = normalize(term.pinyin_first || '');

    // Full Pinyin Match
    if (normPinyinFull && normPinyinFull.includes(normalizedQuery)) {
      pinyinMatches.push({ ...term, matchType: 'pinyin-full' });
      return; 
    }
    
    // Initials/First-Letter Match
    if (normPinyinFirst && normPinyinFirst === normalizedQuery) {
      pinyinMatches.push({ ...term, matchType: 'pinyin-initial' });
    }
  });

  if (pinyinMatches.length > 0) {
    return pinyinMatches;
  }

  // 4. Fuzzy Search (Fuse.js)
  const options = {
    includeScore: true,
    threshold: fuzzyThreshold,
    keys: [
      { name: 'chinese_term', weight: 0.5 },
      { name: 'english_term', weight: 0.3 },
      { name: 'pinyin_full', weight: 0.2 }
    ]
  };

  const fuse = new Fuse(allTerms, options);
  const fuseResults = fuse.search(trimmedQuery);

  if (fuseResults.length > 0) {
    return fuseResults.map(res => ({
      ...res.item,
      matchType: 'fuzzy',
      score: res.score
    }));
  }

  // 5. Fallback (Empty array indicates "Not Found")
  return [];
};
