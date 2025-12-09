
import React, { useState, useEffect } from 'react';
import { SearchResult, Term } from '../types';
import { searchTerms, fetchSystemTerms, normalizeInput } from '../services/search';
import { useStore } from '../store';
import { Volume2, Star, Copy, Plus, AlertTriangle, Info, BookOpen, Search, Sparkles } from 'lucide-react';
import { speakText } from '../services/tts';
import { useTranslation } from '../services/i18n';
import { copyToClipboard } from '../services/clipboard';

const ResultCard: React.FC<{ item: SearchResult; index: number }> = ({ item, index }) => {
  const { favorites, toggleFavorite } = useStore();
  const { t } = useTranslation();
  const isFav = favorites.includes(item.id);
  const isBestMatch = index === 0;

  const handleSpeak = (text: string) => {
    speakText(text);
  };

  const handleCopy = (text: string) => {
    copyToClipboard(text, t('TOAST_COPY_SUCCESS'), t('TOAST_COPY_FAIL'));
  };

  return (
    <div className={`relative group p-5 rounded-2xl border transition-all duration-200 
      ${isBestMatch 
        ? 'bg-gradient-to-br from-indigo-50/80 to-white/80 border-indigo-200 shadow-md' 
        : 'bg-white/40 border-white/40 hover:bg-white/60'
      }`}>
      
      {isBestMatch && (
        <span className="absolute -top-3 -right-3 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm uppercase tracking-wider">
          {t('BEST_MATCH')}
        </span>
      )}
      
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-2xl font-bold text-slate-800">{item.chinese_term}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
              item.source === 'user' 
                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {item.source === 'user' ? t('SOURCE_USER') : t('SOURCE_SYSTEM')}
            </span>
            <span className="text-xs text-slate-400 font-mono lowercase">
              {item.matchType}
            </span>
          </div>
          {item.pinyin_full && (
            <p className="text-sm text-indigo-500 font-medium mt-1">{item.pinyin_full}</p>
          )}
        </div>
        <button onClick={() => toggleFavorite(item.id)} className="p-2 rounded-full hover:bg-slate-200/50 transition-colors">
           <Star className={`w-5 h-5 ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200/50">
         <p className="text-xl text-slate-700 font-serif font-medium">{item.english_term}</p>
         {item.category && <p className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{item.category}</p>}
      </div>

      {/* Detailed Metadata */}
      <div className="mt-4 space-y-2">
        {item.note && (
          <div className="flex gap-2 text-sm text-slate-600 bg-blue-50/50 p-2 rounded-lg">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p>{item.note}</p>
          </div>
        )}
        {item.usage && (
          <div className="flex gap-2 text-sm text-slate-600 bg-green-50/50 p-2 rounded-lg">
            <BookOpen className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <p>{item.usage}</p>
          </div>
        )}
        {item.root_analysis && (
          <div className="text-xs text-slate-500 italic">
            Root: {item.root_analysis}
          </div>
        )}
        {item.mistranslation && item.mistranslation.length > 0 && (
          <div className="flex gap-2 text-sm text-slate-600 bg-red-50/50 p-2 rounded-lg border border-red-100">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-red-700 text-xs uppercase">{t('AVOID')}:</span>
              <ul className="list-disc list-inside ml-1">
                {item.mistranslation.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-4 justify-end opacity-80 group-hover:opacity-100 transition-opacity">
        <button onClick={() => handleSpeak(item.english_term)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium transition-colors">
          <Volume2 className="w-3.5 h-3.5" /> {t('BTN_PRONOUNCE')}
        </button>
        <button onClick={() => handleCopy(`${item.chinese_term} - ${item.english_term}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium transition-colors">
          <Copy className="w-3.5 h-3.5" /> {t('BTN_COPY')}
        </button>
      </div>
    </div>
  );
};

interface TranslatorProps {
  initialQuery?: string | null;
  onQueryConsumed?: () => void;
}

export const Translator: React.FC<TranslatorProps> = ({ initialQuery, onQueryConsumed }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestion, setSuggestion] = useState<SearchResult | null>(null);
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const { t } = useTranslation();

  // Add Term Form State (Updated to match new schema)
  const [newTerm, setNewTerm] = useState<Partial<Term>>({ 
    chinese_term: '', 
    english_term: '', 
    pinyin_full: '', 
    pinyin_first: '',
    category: '',
    note: '',
    usage: ''
  });

  const { userTerms, settings, addToHistory, addUserTerm } = useStore();

  // Init
  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  // Handle external query updates (from selection translate)
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      // If external query is passed, we trigger the callback to clear it
      if (onQueryConsumed) onQueryConsumed();
    }
  }, [initialQuery, onQueryConsumed]);

  // Search Effect (Debounced)
  useEffect(() => {
    const performSearch = () => {
      if (!query) {
        setResults([]);
        setSuggestion(null);
        return;
      }
      setIsSearching(true);
      
      // Normalize query logic (Trim, Full-to-Half width, etc.)
      const normalizedQuery = normalizeInput(query);
      
      const res = searchTerms(normalizedQuery, userTerms, systemTerms, settings.searchFuzzyThreshold);
      setResults(res);

      // Logic for "Did you mean"
      // If we found results, but the best match is fuzzy (implying no exact match),
      // and the fuzzy match is decent, offer it as a correction.
      if (res.length > 0 && res[0].matchType === 'fuzzy') {
         // Check if score is low enough to be a "good" suggestion (Fuse.js score: 0 is perfect, 1 is mismatch)
         // Using a slightly tighter threshold than generic search for suggestion confidence
         if (res[0].score !== undefined && res[0].score < 0.4) {
           setSuggestion(res[0]);
         } else {
           setSuggestion(null);
         }
      } else {
        setSuggestion(null);
      }

      setIsSearching(false);
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [query, userTerms, systemTerms, settings.searchFuzzyThreshold]);

  // Record History on best match selection
  useEffect(() => {
    if (query.length > 2 && results.length > 0) {
      const timer = setTimeout(() => {
        // Only add to history if it's a strong match
        if (results[0].matchType !== 'fuzzy' || (results[0].score && results[0].score < 0.1)) {
          addToHistory(query, results[0]);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [query, results, addToHistory]);

  const handleQuickAction = () => {
    if (!query.trim()) return;

    setIsSearching(true);
    const normalizedQuery = normalizeInput(query);
    const res = searchTerms(normalizedQuery, userTerms, systemTerms, settings.searchFuzzyThreshold);
    setResults(res);
    setIsSearching(false);

    // Auto-copy logic
    if (res.length > 0 && settings.autoCopy) {
      copyToClipboard(res[0].english_term, t('TOAST_COPY_SUCCESS'), t('TOAST_COPY_FAIL'));
    }
  };

  const handleApplySuggestion = (term: Term) => {
    setQuery(term.chinese_term);
    // Immediate search trigger via effect dependency on `query`
    // We clear suggestion immediately to prevent flicker
    setSuggestion(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuickAction();
    }
  };

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.chinese_term || !newTerm.english_term) return;
    
    addUserTerm({
      chinese_term: newTerm.chinese_term,
      english_term: newTerm.english_term,
      pinyin_full: newTerm.pinyin_full || '',
      pinyin_first: newTerm.pinyin_first || '',
      category: newTerm.category || '',
      note: newTerm.note || '',
      usage: newTerm.usage || '',
      root_analysis: '',
      mistranslation: []
    });
    
    setShowAddModal(false);
    setNewTerm({ chinese_term: '', english_term: '', pinyin_full: '', pinyin_first: '', category: '', note: '', usage: '' });
    setQuery(newTerm.chinese_term || ''); 
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <header className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">{t('HEADER_TITLE')}</h2>
        <p className="text-slate-500">{t('HEADER_SUBTITLE', { count: systemTerms.length + userTerms.length })}</p>
      </header>

      <div className="flex gap-3 mb-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('INPUT_PLACEHOLDER')}
            className="w-full px-6 py-4 text-lg rounded-2xl bg-white/70 backdrop-blur border-2 border-transparent focus:border-indigo-400 focus:bg-white focus:shadow-xl outline-none transition-all duration-300 text-slate-800 placeholder:text-slate-400 shadow-inner"
            autoFocus
          />
          {isSearching && (
             <div className="absolute right-4 top-1/2 -translate-y-1/2">
               <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></div>
             </div>
          )}
        </div>
        <button 
          onClick={handleQuickAction}
          className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
        >
          <Search className="w-5 h-5" />
          <span className="hidden sm:inline">{t('BTN_TRANSLATE_ACTION')}</span>
        </button>
      </div>

      {/* Did You Mean Suggestion */}
      <div className="h-8 mb-6 pl-2">
        {suggestion && (
          <div className="flex items-center gap-2 text-sm text-slate-500 animate-fade-in">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>{t('DID_YOU_MEAN')}</span>
            <button 
              onClick={() => handleApplySuggestion(suggestion)}
              className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline decoration-2 underline-offset-2 transition-colors"
            >
              {suggestion.chinese_term}
            </button>
            <span className="text-slate-400">({suggestion.english_term})</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {results.length > 0 ? (
          results.map((item, idx) => (
            <ResultCard key={item.id} item={item} index={idx} />
          ))
        ) : (
          query && !isSearching && (
            <div className="text-center py-12 bg-white/30 rounded-2xl border border-dashed border-slate-300">
              <p className="text-slate-500 mb-4">{t('NO_MATCH', { query })}</p>
              <button 
                onClick={() => { setNewTerm({...newTerm, chinese_term: query}); setShowAddModal(true); }}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20"
              >
                <Plus className="w-4 h-4" /> {t('BTN_ADD_TO_DICT')}
              </button>
            </div>
          )
        )}
      </div>

      {/* Add Term Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/50 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-800 mb-4">{t('MODAL_TITLE')}</h3>
            <form onSubmit={handleAddTerm} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_CHINESE_TERM')}</label>
                <input required value={newTerm.chinese_term} onChange={e => setNewTerm({...newTerm, chinese_term: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_ENGLISH_DEF')}</label>
                <input required value={newTerm.english_term} onChange={e => setNewTerm({...newTerm, english_term: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_PINYIN_FULL')}</label>
                  <input value={newTerm.pinyin_full} onChange={e => setNewTerm({...newTerm, pinyin_full: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none" />
                </div>
                <div>
                   <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_PINYIN_FIRST')}</label>
                   <input value={newTerm.pinyin_first} onChange={e => setNewTerm({...newTerm, pinyin_first: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_CATEGORY')}</label>
                <input value={newTerm.category} onChange={e => setNewTerm({...newTerm, category: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t('LBL_NOTE_USAGE')}</label>
                <textarea value={newTerm.note} onChange={e => setNewTerm({...newTerm, note: e.target.value})} className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none text-sm" rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">{t('BTN_CANCEL')}</button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-500/20">{t('BTN_SAVE')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
