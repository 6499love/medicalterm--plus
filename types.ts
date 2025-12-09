
export interface Term {
  id: string;
  chinese_term: string; // Was term
  english_term: string; // Was definition
  pinyin_full: string; // Was pinyin
  pinyin_first: string; // New
  category?: string;
  note?: string; // New
  usage?: string; // New
  root_analysis?: string; // New
  mistranslation?: string[]; // New
  source: 'system' | 'user';
  tags?: string[];
  addedAt?: number;
}

export interface SearchResult extends Term {
  matchType: 'exact-user' | 'exact-system' | 'pinyin-full' | 'pinyin-initial' | 'fuzzy';
  score?: number; // For fuse.js sorting
}

export interface HistoryItem {
  id: string;
  query: string;
  timestamp: number;
  resultId?: string; // ID of the selected/best match
  resultTerm?: string;
}

export interface AppSettings {
  autoPlayAudio: boolean;
  darkMode: boolean; // Simplified for this demo
  searchFuzzyThreshold: number;
  autoCopy: boolean; // New: Auto copy best result to clipboard
}

export interface AuthConfig {
  userName: string;
  provider: 'gemini' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export type PageRoute = 'translate' | 'batch' | 'dictionary' | 'assistant' | 'history' | 'favorites' | 'settings';
