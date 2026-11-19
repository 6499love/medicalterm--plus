
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Term, HistoryItem, AppSettings, AuthConfig } from './types';

interface StoreState {
  // Data
  userTerms: Term[];
  favorites: string[]; // IDs of favorite terms
  history: HistoryItem[];
  settings: AppSettings;
  auth: AuthConfig | null; // Auth state
  literatureAuth: AuthConfig | null;
  rememberLiteratureKey: boolean;
  
  // Navigation State
  navigatedTermId: string | null; // ID of term to open in dictionary

  // Actions
  addUserTerm: (termData: Omit<Term, 'id' | 'source' | 'addedAt'>) => string;
  removeUserTerm: (id: string) => void;
  updateUserTerm: (term: Term) => void;
  importUserTerms: (terms: any[]) => number; // Returns count of added terms
  
  toggleFavorite: (termId: string) => void;
  
  addToHistory: (query: string, result?: Term) => void;
  clearHistory: () => void;
  
  updateSettings: (settings: Partial<AppSettings>) => void;
  
  setAuth: (config: AuthConfig) => void;
  logout: () => void;
  setLiteratureAuth: (config: AuthConfig, rememberKey?: boolean) => void;
  clearLiteratureAuth: () => void;
  
  setNavigatedTermId: (id: string | null) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      userTerms: [],
      favorites: [],
      history: [],
      settings: {
        autoPlayAudio: false,
        darkMode: false,
        searchFuzzyThreshold: 0.3,
        autoCopy: false,
        rememberApiKey: true,
      },
      auth: null,
      literatureAuth: null,
      rememberLiteratureKey: false,
      navigatedTermId: null,

      addUserTerm: (termData) => {
        const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        set((state) => ({
          userTerms: [
            ...state.userTerms,
            {
              ...termData,
              id: newId,
              source: 'user',
              addedAt: Date.now(),
            },
          ],
        }));
        return newId;
      },

      removeUserTerm: (id) => set((state) => ({
        userTerms: state.userTerms.filter((t) => t.id !== id),
        favorites: state.favorites.filter((fid) => fid !== id), // Remove from favs if deleted
      })),

      updateUserTerm: (updatedTerm) => set((state) => ({
        userTerms: state.userTerms.map((t) => (t.id === updatedTerm.id ? updatedTerm : t)),
      })),

      importUserTerms: (newTerms) => {
        let addedCount = 0;
        set((state) => {
          // Create a map of existing terms by Chinese term for easy lookup (prevent duplicates)
          const existingMap = new Map(state.userTerms.map(t => [t.chinese_term, t]));
          
          newTerms.forEach(t => {
            if (t.chinese_term && t.english_term && !existingMap.has(t.chinese_term)) {
              const termToAdd: Term = {
                id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${addedCount}`,
                chinese_term: t.chinese_term,
                english_term: t.english_term,
                pinyin_full: t.pinyin_full || '',
                pinyin_first: t.pinyin_first || '',
                category: t.category || '',
                note: t.note || '',
                // Map old fields to new schema if present
                usage_scenario: t.usage_scenario || t.usage || '',
                root_analysis: t.root_analysis || '',
                mistranslation_warning: t.mistranslation_warning || t.mistranslation || [],
                related_terms: t.related_terms || t.aliases || [],
                
                source: 'user',
                addedAt: Date.now(),
                tags: t.tags || [],
                // Ensure core fields are mapped
                coreCN: t.coreCN || '',
                coreEN: t.coreEN || ''
              };
              existingMap.set(termToAdd.chinese_term, termToAdd);
              addedCount++;
            }
          });
          
          return { userTerms: Array.from(existingMap.values()) };
        });
        return addedCount;
      },

      toggleFavorite: (termId) => set((state) => {
        const isFav = state.favorites.includes(termId);
        return {
          favorites: isFav
            ? state.favorites.filter((id) => id !== termId)
            : [...state.favorites, termId],
        };
      }),

      addToHistory: (query, result) => set((state) => {
        const newItem: HistoryItem = {
          id: `hist_${Date.now()}`,
          query,
          timestamp: Date.now(),
          resultId: result?.id,
          resultTerm: result?.chinese_term,
        };
        // Keep history limited to last 100 items
        return {
          history: [newItem, ...state.history].slice(0, 100),
        };
      }),

      clearHistory: () => set({ history: [] }),

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings },
      })),

      setAuth: (config) => set({ auth: config }),
      
      logout: () => set({ auth: null }),
      setLiteratureAuth: (config, rememberKey = false) => set({ literatureAuth: config, rememberLiteratureKey: rememberKey }),
      clearLiteratureAuth: () => set({ literatureAuth: null, rememberLiteratureKey: false }),
      
      setNavigatedTermId: (id) => set({ navigatedTermId: id }),
    }),
    {
      name: 'mediterm-storage',
      merge: (persisted, current) => {
        const saved = persisted as Partial<StoreState> | undefined;
        // Retire Baidu credentials without sending them to the replacement provider.
        const auth = (saved?.auth as { provider?: string } | null)?.provider === 'baidu' ? null : saved?.auth;
        return { ...current, ...saved, auth: auth ?? null,
          literatureAuth: saved?.rememberLiteratureKey ? saved.literatureAuth ?? null : null,
          rememberLiteratureKey: saved?.rememberLiteratureKey === true };
      },
      partialize: (state) => {
        const { auth, literatureAuth, ...rest } = state;
        return { ...rest,
          ...(state.settings.rememberApiKey ? { auth } : {}),
          ...(state.rememberLiteratureKey ? { literatureAuth } : {}) };
      }
    }
  )
);
