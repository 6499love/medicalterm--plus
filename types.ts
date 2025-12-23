
export interface Term {
  id: string;
  chinese_term: string;
  english_term: string;
  pinyin_full: string;
  pinyin_first: string;
  category: string;
  note: string;
  usage_scenario: string; // Renamed from usage
  root_analysis: string;
  mistranslation_warning: string[]; // Renamed from mistranslation
  related_terms: string[]; // Renamed from aliases
  
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
  rememberApiKey: boolean; // New: Whether to persist API key
}

export interface AuthConfig {
  userName: string;
  provider: 'gemini' | 'openai-compatible' | 'glm';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export type PageRoute = 'translate' | 'batch' | 'dictionary' | 'assistant' | 'history' | 'favorites' | 'settings';
