
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Trash2, Search, Book, Download, Upload, FileJson, AlertTriangle, ChevronLeft, ChevronRight, X, Info, Plus, Save, Sparkles, HelpCircle, Copy, Check } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { fetchSystemTerms } from '../services/search';
import { Term } from '../types';
import { pinyin } from 'pinyin-pro';
import { copyToClipboard } from '../services/clipboard';

export const UserDictionary: React.FC = () => {
  const { userTerms, addUserTerm, removeUserTerm, importUserTerms, navigatedTermId, setNavigatedTermId } = useStore();
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Pagination & Selection State
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const pageSize = 14; 

  // Add Term Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTerm, setNewTerm] = useState<{
    chinese_term: string;
    english_term: string;
    aliases: string;
    category: string;
    note: string;
    pinyin_full: string;
    pinyin_first: string;
  }>({
    chinese_term: '',
    english_term: '',
    aliases: '',
    category: '',
    note: '',
    pinyin_full: '',
    pinyin_first: ''
  });

  // Help Tooltip State
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [helpCopied, setHelpCopied] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  // Handle external navigation
  useEffect(() => {
    if (navigatedTermId && systemTerms.length > 0) {
      // Check system terms
      const sysTerm = systemTerms.find(t => t.id === navigatedTermId);
      if (sysTerm) {
        setActiveTab('system');
        setSelectedTerm(sysTerm);
        setNavigatedTermId(null);
        return;
      }
      
      // Check user terms
      const userTerm = userTerms.find(t => t.id === navigatedTermId);
      if (userTerm) {
        setActiveTab('user');
        setSelectedTerm(userTerm);
        setNavigatedTermId(null);
        return;
      }
      
      setNavigatedTermId(null);
    }
  }, [navigatedTermId, systemTerms, userTerms, setNavigatedTermId]);

  // Reset pagination when filter or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, activeTab]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const displayedTerms = activeTab === 'system' ? systemTerms : userTerms;

  const filtered = displayedTerms.filter(t => 
    (t.chinese_term?.toLowerCase() || '').includes(filter.toLowerCase()) || 
    (t.english_term?.toLowerCase() || '').includes(filter.toLowerCase()) ||
    t.aliases?.some(a => a.toLowerCase().includes(filter.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visibleTerms = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    const dataStr = JSON.stringify(userTerms, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `mediterm_user_dictionary_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          const count = importUserTerms(json);
          if (count > 0) {
            setMessage({ type: 'success', text: t('IMPORT_SUCCESS', { count }) });
          } else {
            setMessage({ type: 'error', text: t('IMPORT_NO_DATA') });
          }
        } else {
          setMessage({ type: 'error', text: t('IMPORT_FORMAT_ERROR') });
        }
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: t('IMPORT_PARSE_ERROR') });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeUserTerm(id);
    if (selectedTerm?.id === id) {
      setSelectedTerm(null);
    }
  };

  const handleChineseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewTerm(prev => {
       const next = { ...prev, chinese_term: val };
       // Auto generate pinyin
       if (val && /[\u4e00-\u9fa5]/.test(val)) {
           try {
             next.pinyin_full = pinyin(val, { toneType: 'none', nonZh: 'consecutive' });
             next.pinyin_first = pinyin(val, { pattern: 'first', toneType: 'none', nonZh: 'consecutive' }).replace(/\s/g, '');
           } catch (e) {
             console.debug('Pinyin generation failed', e);
           }
       }
       return next;
    });
  };

  const handleSubmitTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.chinese_term || !newTerm.english_term) return;

    setIsSubmitting(true);

    // Simulate animation wait
    setTimeout(() => {
        addUserTerm({
            chinese_term: newTerm.chinese_term,
            english_term: newTerm.english_term,
            category: newTerm.category,
            note: newTerm.note,
            pinyin_full: newTerm.pinyin_full,
            pinyin_first: newTerm.pinyin_first,
            aliases: newTerm.aliases.split(/[,，]/).map(s => s.trim()).filter(Boolean),
            usage: '',
            root_analysis: '',
            mistranslation: []
        });

        setIsSubmitting(false);
        setNewTerm({
            chinese_term: '',
            english_term: '',
            aliases: '',
            category: '',
            note: '',
            pinyin_full: '',
            pinyin_first: ''
        });
        setMessage({ type: 'success', text: t('MSG_TERM_ADDED') });
    }, 600);
  };

  const copyPrompt = (idx: number, text: string) => {
      copyToClipboard(text, t('TOAST_PROMPT_COPIED'), t('TOAST_COPY_FAIL'));
      setHelpCopied(idx);
      setTimeout(() => setHelpCopied(null), 2000);
  };

  const prompt1 = `I have an Excel/CSV file with columns: Chinese, English, Category, Note. Please convert this data into a JSON array matching this TypeScript interface:
interface Term {
  chinese_term: string;
  english_term: string;
  category?: string;
  note?: string;
  aliases?: string[]; // Synonyms
}
Return only the valid JSON.`;

  const prompt2 = `Take this JSON array of medical terms. For each item:
1. Generate 'pinyin_full' (e.g. 'gan mao') and 'pinyin_first' (e.g. 'gm').
2. Add 'aliases' if there are common synonyms.
3. Keep the original fields.
Return the enriched JSON.`;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800">{t('DICT_TITLE')}</h2>
        
        {activeTab === 'user' && (
          <div className="flex gap-2 items-center">
             <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-sm font-bold shadow-sm ${
                    showAddForm 
                    ? 'bg-indigo-600 border-indigo-600 text-white' 
                    : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'
                }`}
             >
                <Plus className="w-4 h-4" /> {t('BTN_ADD_TERM')}
             </button>

             <div className="h-6 w-px bg-slate-200 mx-1"></div>

             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileChange} 
               accept=".json" 
               className="hidden" 
             />
             <div className="flex items-center gap-1">
                <button 
                onClick={handleImportClick}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all text-sm font-medium shadow-sm"
                >
                <Upload className="w-4 h-4" /> {t('BTN_IMPORT_JSON')}
                </button>
                <button 
                  onClick={() => setShowImportHelp(true)}
                  className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-slate-100 rounded-lg transition-colors"
                  title={t('TITLE_IMPORT_HELP')}
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
             </div>
             <button 
               onClick={handleExport}
               disabled={userTerms.length === 0}
               className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-sm font-medium shadow-sm ${
                 userTerms.length === 0 
                   ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' 
                   : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
               }`}
             >
               <Download className="w-4 h-4" /> {t('BTN_EXPORT_JSON')}
             </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in shrink-0 ${
          message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.type === 'error' && <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex p-1 bg-slate-100/80 rounded-xl mb-6 w-full md:w-fit shrink-0">
        <button
          onClick={() => setActiveTab('system')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'system' 
              ? 'bg-white text-indigo-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('TAB_SYSTEM')}
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'user' 
              ? 'bg-white text-indigo-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('TAB_USER')}
        </button>
      </div>

      {/* Add Term Form Card */}
      {activeTab === 'user' && showAddForm && (
         <div className={`mb-6 p-6 bg-white rounded-2xl border-2 border-indigo-100 shadow-lg transition-all duration-500 transform origin-top ${isSubmitting ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                 <Sparkles className="w-5 h-5 text-amber-500" />
                 {t('MODAL_TITLE')}
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSubmitTerm} className="grid md:grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_CHINESE_TERM')} *</label>
                  <input 
                    required 
                    value={newTerm.chinese_term} 
                    onChange={handleChineseChange}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_CHINESE')}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_ENGLISH_DEF')} *</label>
                  <input 
                    required 
                    value={newTerm.english_term} 
                    onChange={e => setNewTerm({...newTerm, english_term: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_ENGLISH')}
                  />
               </div>
               
               <div className="md:col-span-2 grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                       <span>{t('LBL_PINYIN_FULL')}</span> 
                       <span className="text-[10px] text-indigo-500 font-normal normal-case opacity-75">{t('LBL_AUTO_GEN')}</span>
                    </label>
                    <input 
                      value={newTerm.pinyin_full} 
                      onChange={e => setNewTerm({...newTerm, pinyin_full: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-50/50 border border-slate-200 text-slate-600 focus:border-indigo-400 outline-none font-mono text-sm"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                       <span>{t('LBL_PINYIN_FIRST')}</span>
                       <span className="text-[10px] text-indigo-500 font-normal normal-case opacity-75">{t('LBL_AUTO_GEN')}</span>
                    </label>
                    <input 
                      value={newTerm.pinyin_first} 
                      onChange={e => setNewTerm({...newTerm, pinyin_first: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-50/50 border border-slate-200 text-slate-600 focus:border-indigo-400 outline-none font-mono text-sm"
                    />
                 </div>
               </div>

               <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_ALIASES')}</label>
                  <input 
                    value={newTerm.aliases} 
                    onChange={e => setNewTerm({...newTerm, aliases: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_ALIASES')}
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_CATEGORY')}</label>
                  <input 
                    value={newTerm.category} 
                    onChange={e => setNewTerm({...newTerm, category: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none"
                    placeholder={t('PH_CATEGORY')}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_NOTE')}</label>
                  <input 
                    value={newTerm.note} 
                    onChange={e => setNewTerm({...newTerm, note: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none"
                    placeholder={t('PH_NOTE')}
                  />
               </div>

               <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)} 
                    className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    {t('BTN_CANCEL')}
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('BTN_SAVE_TERM')}
                  </button>
               </div>
            </form>
         </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('FILTER_PLACEHOLDER')}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/50 border border-slate-200 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
          {t('DICT_COUNT', { count: filtered.length })}
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 min-h-0 overflow-auto pb-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center text-slate-400 h-full justify-center">
            <FileJson className="w-12 h-12 mb-3 opacity-50" />
            <p>{activeTab === 'user' ? t('EMPTY_USER_DICT') : t('EMPTY_DICT')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleTerms.map((term, index) => (
              <div 
                key={term.id || index} 
                onClick={() => setSelectedTerm(term)}
                className="relative flex flex-col p-5 bg-white/60 rounded-xl border border-white/50 hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-1">
                   <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                     <h4 className="font-bold text-lg text-slate-800 truncate">{term.chinese_term}</h4>
                     {term.pinyin_full && (
                       <span className="text-xs font-mono text-indigo-400/80 shrink-0">{term.pinyin_full}</span>
                     )}
                   </div>
                   
                   {activeTab === 'user' && (
                     <button 
                       onClick={(e) => handleDelete(e, term.id)}
                       className="p-1.5 -mt-1 -mr-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                       title={t('BTN_REMOVE_TERM')}
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                </div>
                
                <p className="text-indigo-700 font-medium leading-relaxed line-clamp-2 mb-2 flex-1" title={term.english_term}>
                   {term.english_term}
                </p>

                {term.aliases && term.aliases.length > 0 && (
                   <div className="mb-2 text-xs text-slate-500 flex gap-1 items-center">
                      <span className="opacity-50">aka:</span> {term.aliases.join(', ')}
                   </div>
                )}
                
                <div className="flex flex-wrap gap-y-1 gap-x-2 mt-auto pt-2 border-t border-slate-100">
                   {term.category && (
                     <span className="text-[10px] text-slate-500 bg-blue-50/50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide truncate max-w-[120px]">
                       {term.category}
                     </span>
                   )}
                   {term.usage && (
                      <div className="flex gap-1 items-center text-xs text-slate-500 bg-green-50/30 px-2 py-0.5 rounded-lg truncate max-w-[150px]">
                        <Book className="w-3 h-3 opacity-70 shrink-0"/> <span className="truncate">{term.usage}</span>
                      </div>
                   )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filtered.length > 0 && (
        <div className="shrink-0 flex justify-center items-center gap-4 py-4 border-t border-slate-200/50 mt-2">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <span className="text-sm font-medium text-slate-600 font-mono">
            {t('PAGE_INFO', { current: currentPage, total: totalPages })}
          </span>

          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTerm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4" onClick={() => setSelectedTerm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-white/50 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">{t('DETAIL_TITLE')}</h3>
              <button onClick={() => setSelectedTerm(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_CHINESE_TERM')}</label>
                <div className="text-2xl font-bold text-slate-800">{selectedTerm.chinese_term}</div>
                {selectedTerm.pinyin_full && (
                  <div className="text-sm text-indigo-500 font-mono mt-1">{selectedTerm.pinyin_full}</div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_ENGLISH_DEF')}</label>
                <div className="text-lg text-slate-700 font-serif leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {selectedTerm.english_term}
                </div>
              </div>

              {selectedTerm.aliases && selectedTerm.aliases.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_ALIASES')}</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTerm.aliases.map((alias, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-sm rounded-md border border-slate-200">
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedTerm.category && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_CATEGORY')}</label>
                    <div className="text-sm text-slate-700">{selectedTerm.category}</div>
                  </div>
                )}
                {selectedTerm.root_analysis && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_ROOT_ANALYSIS')}</label>
                    <div className="text-sm text-slate-700 italic">{selectedTerm.root_analysis}</div>
                  </div>
                )}
              </div>

              {selectedTerm.note && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_NOTE')}</label>
                  <div className="flex gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p>{selectedTerm.note}</p>
                  </div>
                </div>
              )}

              {selectedTerm.usage && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_USAGE')}</label>
                  <div className="flex gap-2 text-sm text-slate-600 bg-green-50 p-3 rounded-lg">
                    <Book className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p>{selectedTerm.usage}</p>
                  </div>
                </div>
              )}

              {selectedTerm.mistranslation && selectedTerm.mistranslation.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-red-400 uppercase mb-1">{t('AVOID')}</label>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <ul className="list-disc list-inside text-sm text-red-700">
                      {selectedTerm.mistranslation.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {selectedTerm.source === 'user' && selectedTerm.addedAt && (
                 <div className="text-xs text-slate-400 text-right pt-4 border-t border-slate-100">
                   {t('LBL_ADDED', { date: new Date(selectedTerm.addedAt).toLocaleString() })}
                 </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50 rounded-b-2xl">
              <button 
                onClick={() => setSelectedTerm(null)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                {t('BTN_CLOSE')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Help Modal */}
      {showImportHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setShowImportHelp(false)}>
           <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-white/50 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl font-bold text-slate-800">{t('IMP_TITLE')}</h3>
                    <p className="text-sm text-slate-500">{t('IMP_DESC')}</p>
                 </div>
                 <button onClick={() => setShowImportHelp(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
              </div>

              <div className="space-y-6">
                 <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <h4 className="font-bold text-indigo-900 text-sm mb-2 flex items-center gap-2">
                       <span className="w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center text-xs">1</span>
                       {t('IMP_STEP1_TITLE')}
                    </h4>
                    <div className="relative group">
                       <pre className="text-xs bg-white p-3 rounded-lg text-slate-600 whitespace-pre-wrap font-mono border border-indigo-100 leading-relaxed">
                          {prompt1}
                       </pre>
                       <button 
                         onClick={() => copyPrompt(1, prompt1)}
                         className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-indigo-600 hover:text-white rounded-md transition-colors text-slate-500"
                       >
                         {helpCopied === 1 ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                       </button>
                    </div>
                 </div>

                 <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <h4 className="font-bold text-purple-900 text-sm mb-2 flex items-center gap-2">
                       <span className="w-5 h-5 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-xs">2</span>
                       {t('IMP_STEP2_TITLE')}
                    </h4>
                    <div className="relative group">
                       <pre className="text-xs bg-white p-3 rounded-lg text-slate-600 whitespace-pre-wrap font-mono border border-purple-100 leading-relaxed">
                          {prompt2}
                       </pre>
                       <button 
                         onClick={() => copyPrompt(2, prompt2)}
                         className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-purple-600 hover:text-white rounded-md transition-colors text-slate-500"
                       >
                         {helpCopied === 2 ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                       </button>
                    </div>
                 </div>
              </div>

              <div className="mt-6 flex justify-end">
                 <button onClick={() => setShowImportHelp(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">{t('BTN_DONE')}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

// Simple loader component
const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);
