import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { Trash2, Search, Book, Download, Upload, FileJson, AlertTriangle, ChevronLeft, ChevronRight, X, Info, Plus, Save, Sparkles, HelpCircle, Copy, Check, Loader2, ArrowUpDown, ChevronDown, Edit } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { fetchSystemTerms } from '../services/search';
import { Term } from '../types';
import { pinyin } from 'pinyin-pro';
import { copyToClipboard } from '../services/clipboard';

export const UserDictionary: React.FC = () => {
  const { userTerms, addUserTerm, removeUserTerm, updateUserTerm, importUserTerms, navigatedTermId, setNavigatedTermId } = useStore();
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [filter, setFilter] = useState(''); // Text filter for User tab
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // System Tab Specific State
  const [sortBy, setSortBy] = useState<'zh_asc' | 'zh_desc' | 'en_asc' | 'en_desc'>('en_asc');

  // Pagination & Selection State
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const pageSize = 10; 

  // Add/Edit Term Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTerm, setNewTerm] = useState<{
    chinese_term: string;
    english_term: string;
    related_terms: string;
    category: string;
    note: string;
    pinyin_full: string;
    pinyin_first: string;
  }>({
    chinese_term: '',
    english_term: '',
    related_terms: '',
    category: '',
    note: '',
    pinyin_full: '',
    pinyin_first: ''
  });

  // Help Tooltip State
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [helpCopied, setHelpCopied] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, language } = useTranslation();

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

  // Reset pagination when filter/tab/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, activeTab, sortBy]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Processing Data (Filter & Sort)
  const displayedTerms = useMemo(() => {
    if (activeTab === 'user') {
        // User Tab: Filter by text
        return userTerms.filter(t => 
            (t.chinese_term?.toLowerCase() || '').includes(filter.toLowerCase()) || 
            (t.english_term?.toLowerCase() || '').includes(filter.toLowerCase()) ||
            t.related_terms?.some(a => a.toLowerCase().includes(filter.toLowerCase()))
        ).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); // Default User sort: Newest first
    } else {
        // System Tab: Sort Only
        let data = [...systemTerms];

        // Sort
        data.sort((a, b) => {
            if (sortBy === 'zh_asc') return a.chinese_term.localeCompare(b.chinese_term, 'zh-CN');
            if (sortBy === 'zh_desc') return b.chinese_term.localeCompare(a.chinese_term, 'zh-CN');
            if (sortBy === 'en_asc') return a.english_term.localeCompare(b.english_term);
            if (sortBy === 'en_desc') return b.english_term.localeCompare(a.english_term);
            return 0;
        });

        return data;
    }
  }, [activeTab, userTerms, systemTerms, filter, sortBy]);

  const totalPages = Math.ceil(displayedTerms.length / pageSize);
  const visibleTerms = displayedTerms.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

  const handleEdit = (e: React.MouseEvent, term: Term) => {
    e.stopPropagation();
    setNewTerm({
        chinese_term: term.chinese_term,
        english_term: term.english_term,
        related_terms: term.related_terms ? term.related_terms.join(', ') : '',
        category: term.category || '',
        note: term.note || '',
        pinyin_full: term.pinyin_full || '',
        pinyin_first: term.pinyin_first || ''
    });
    setEditingId(term.id);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChineseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewTerm(prev => {
       const next = { ...prev, chinese_term: val };
       // Auto generate pinyin only if not editing or empty
       if (val && /[\u4e00-\u9fa5]/.test(val)) {
           try {
             if (!editingId) {
                next.pinyin_full = pinyin(val, { toneType: 'none', nonZh: 'consecutive' });
                next.pinyin_first = pinyin(val, { pattern: 'first', toneType: 'none', nonZh: 'consecutive' }).replace(/\s/g, '');
             }
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

    setTimeout(() => {
        const commonData = {
            chinese_term: newTerm.chinese_term,
            english_term: newTerm.english_term,
            category: newTerm.category,
            note: newTerm.note,
            pinyin_full: newTerm.pinyin_full,
            pinyin_first: newTerm.pinyin_first,
            related_terms: newTerm.related_terms.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        };

        if (editingId) {
             const original = userTerms.find(t => t.id === editingId);
             if (original) {
                 updateUserTerm({
                     ...original,
                     ...commonData,
                     usage_scenario: original.usage_scenario,
                     root_analysis: original.root_analysis,
                     mistranslation_warning: original.mistranslation_warning
                 });
                 setMessage({ type: 'success', text: language === 'zh-CN' ? '术语已更新' : 'Term updated' });
             }
             setEditingId(null);
             setShowAddForm(false);
        } else {
            addUserTerm({
                ...commonData,
                usage_scenario: '',
                root_analysis: '',
                mistranslation_warning: []
            });
            setMessage({ type: 'success', text: t('MSG_TERM_ADDED') });
            // Clear form for next entry
            setNewTerm({
                chinese_term: '',
                english_term: '',
                related_terms: '',
                category: '',
                note: '',
                pinyin_full: '',
                pinyin_first: ''
            });
        }

        setIsSubmitting(false);
    }, 600);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setNewTerm({
        chinese_term: '',
        english_term: '',
        related_terms: '',
        category: '',
        note: '',
        pinyin_full: '',
        pinyin_first: ''
    });
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
  related_terms?: string[]; // Synonyms
}
Return only the valid JSON.`;

  const prompt2 = `Take this JSON array of medical terms. For each item:
1. Generate 'pinyin_full' (e.g. 'gan mao') and 'pinyin_first' (e.g. 'gm').
2. Add 'related_terms' if there are common synonyms.
3. Keep the original fields.
Return the enriched JSON.`;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex flex-row items-center justify-between mb-2 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800">{t('DICT_TITLE')}</h2>
        
        {/* Subtle Large Counter (Top Right) */}
        <div className="absolute right-0 top-0 pointer-events-none select-none z-0">
            <span className="text-5xl font-black text-slate-200/60 tracking-tighter leading-none font-sans">
              {displayedTerms.length}
            </span>
        </div>
        
        {activeTab === 'user' && (
          <div className="flex flex-wrap gap-2 items-center z-10">
             <button 
                onClick={() => {
                   setEditingId(null);
                   setNewTerm({
                        chinese_term: '',
                        english_term: '',
                        related_terms: '',
                        category: '',
                        note: '',
                        pinyin_full: '',
                        pinyin_first: ''
                   });
                   setShowAddForm(true);
                }}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-sm font-bold shadow-sm ${
                    showAddForm && !editingId
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100'
                }`}
             >
                <Plus className="w-4 h-4" /> {t('BTN_ADD_TERM')}
             </button>

             <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

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
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-medium shadow-sm"
                >
                <Upload className="w-4 h-4" /> {t('BTN_IMPORT_JSON')}
                </button>
                <button 
                  onClick={() => setShowImportHelp(true)}
                  className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-lg transition-colors"
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
                   : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
               }`}
             >
               <Download className="w-4 h-4" /> {t('BTN_EXPORT_JSON')}
             </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in shrink-0 z-10 ${
          message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.type === 'error' && <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex p-1 bg-slate-100/80 rounded-xl mb-6 w-full md:w-fit shrink-0 z-10">
        <button
          onClick={() => setActiveTab('system')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'system' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('TAB_SYSTEM')}
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'user' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('TAB_USER')}
        </button>
      </div>

      {/* Add/Edit Term Form Card */}
      {activeTab === 'user' && showAddForm && (
         <div className={`mb-6 p-4 md:p-6 bg-white rounded-2xl border-2 border-blue-100 shadow-lg transition-all duration-500 transform origin-top z-20 relative ${isSubmitting ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                 <Sparkles className="w-5 h-5 text-amber-500" />
                 {editingId ? (language === 'zh-CN' ? '编辑术语' : 'Edit Term') : t('MODAL_TITLE')}
              </h3>
              <button onClick={handleCancelForm} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSubmitTerm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_CHINESE_TERM')} *</label>
                  <input 
                    required 
                    value={newTerm.chinese_term} 
                    onChange={handleChineseChange}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_CHINESE')}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_ENGLISH_DEF')} *</label>
                  <input 
                    required 
                    value={newTerm.english_term} 
                    onChange={e => setNewTerm({...newTerm, english_term: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_ENGLISH')}
                  />
               </div>
               
               <div className="md:col-span-2 grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                       <span>{t('LBL_PINYIN_FULL')}</span> 
                       <span className="text-[10px] text-blue-500 font-normal normal-case opacity-75">{t('LBL_AUTO_GEN')}</span>
                    </label>
                    <input 
                      value={newTerm.pinyin_full} 
                      onChange={e => setNewTerm({...newTerm, pinyin_full: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-50/50 border border-slate-200 text-slate-600 focus:border-blue-400 outline-none font-mono text-sm"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex justify-between">
                       <span>{t('LBL_PINYIN_FIRST')}</span>
                       <span className="text-[10px] text-blue-500 font-normal normal-case opacity-75">{t('LBL_AUTO_GEN')}</span>
                    </label>
                    <input 
                      value={newTerm.pinyin_first} 
                      onChange={e => setNewTerm({...newTerm, pinyin_first: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-50/50 border border-slate-200 text-slate-600 focus:border-blue-400 outline-none font-mono text-sm"
                    />
                 </div>
               </div>

               <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_ALIASES')}</label>
                  <input 
                    value={newTerm.related_terms} 
                    onChange={e => setNewTerm({...newTerm, related_terms: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white outline-none transition-all"
                    placeholder={t('PH_ALIASES')}
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_CATEGORY')}</label>
                  <input 
                    value={newTerm.category} 
                    onChange={e => setNewTerm({...newTerm, category: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 outline-none"
                    placeholder={t('PH_CATEGORY')}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('LBL_NOTE')}</label>
                  <input 
                    value={newTerm.note} 
                    onChange={e => setNewTerm({...newTerm, note: e.target.value})}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 outline-none"
                    placeholder={t('PH_NOTE')}
                  />
               </div>

               <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                  <button 
                    type="button" 
                    onClick={handleCancelForm} 
                    className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    {t('BTN_CANCEL')}
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('BTN_SAVE_TERM')}
                  </button>
               </div>
            </form>
         </div>
      )}

      {/* Controls Bar */}
      <div className="relative mb-4 shrink-0 z-10">
        {activeTab === 'user' ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('FILTER_PLACEHOLDER')}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/50 border border-slate-200 focus:outline-none focus:border-blue-400 focus:bg-white transition-all shadow-sm"
            />
          </div>
        ) : (
          <div className="bg-white/50 p-2 rounded-2xl border border-white/50 shadow-sm backdrop-blur-sm">
             {/* Sort Control */}
             <div className="relative">
               <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 hidden sm:inline">Sort</span>
               </div>
               <select 
                 value={sortBy}
                 onChange={(e) => setSortBy(e.target.value as any)}
                 className="w-full pl-8 sm:pl-20 pr-8 py-2.5 rounded-xl bg-white/70 border border-slate-200 focus:outline-none focus:border-blue-400 focus:bg-white transition-all appearance-none cursor-pointer text-slate-700 text-sm font-medium hover:bg-white"
               >
                 <option value="en_asc">English (A-Z)</option>
                 <option value="en_desc">English (Z-A)</option>
                 <option value="zh_asc">中文拼音 (A-Z)</option>
                 <option value="zh_desc">中文拼音 (Z-A)</option>
               </select>
               <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="w-4 h-4" />
               </div>
             </div>
          </div>
        )}
      </div>

      {/* Grid List */}
      <div className="flex-1 min-h-0 overflow-auto pb-4 z-10">
        {displayedTerms.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center text-slate-400 h-full justify-center">
            <FileJson className="w-12 h-12 mb-3 opacity-50" />
            <p>{activeTab === 'user' ? t('EMPTY_USER_DICT') : t('EMPTY_DICT')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleTerms.map((term, index) => (
              <div 
                key={term.id || index} 
                onClick={() => setSelectedTerm(term)}
                className="relative flex flex-col p-3 bg-white/60 rounded-xl border border-white/50 hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-1">
                   <div className="flex items-baseline gap-2 min-w-0 flex-1">
                     <h4 className="font-bold text-lg text-slate-800 truncate" title={term.chinese_term}>{term.chinese_term}</h4>
                     {term.pinyin_full && term.source !== 'system' && (
                       <span className="text-xs font-mono text-blue-400/80 shrink-0">{term.pinyin_full}</span>
                     )}
                   </div>
                   
                   {activeTab === 'user' && (
                     <div className="flex gap-1 -mt-1 -mr-1">
                       <button 
                         onClick={(e) => handleEdit(e, term)}
                         className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                         title={language === 'zh-CN' ? "编辑" : "Edit"}
                       >
                         <Edit className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={(e) => handleDelete(e, term.id)}
                         className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                         title={t('BTN_REMOVE_TERM')}
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   )}
                </div>
                
                <p className="text-blue-700 font-medium leading-snug line-clamp-2 mb-2 text-sm" title={term.english_term}>
                   {term.english_term}
                </p>

                {term.related_terms && term.related_terms.length > 0 && (
                   <div className="mb-2 text-xs text-slate-500 flex gap-1 items-center overflow-hidden">
                      <span className="opacity-50 shrink-0">aka:</span> 
                      <span className="truncate">{term.related_terms.join(', ')}</span>
                   </div>
                )}
                
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-100 h-7 overflow-hidden">
                   {term.category && (
                     <span className="text-[10px] text-slate-500 bg-blue-50/50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide truncate max-w-[40%]">
                       {term.category}
                     </span>
                   )}
                   {term.usage_scenario && (
                      <div className="flex gap-1 items-center text-xs text-slate-500 bg-green-50/30 px-2 py-0.5 rounded-lg truncate max-w-[50%]">
                        <Book className="w-3 h-3 opacity-70 shrink-0"/> <span className="truncate">{term.usage_scenario}</span>
                      </div>
                   )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {displayedTerms.length > 0 && (
        <div className="shrink-0 flex justify-center items-center gap-4 py-4 border-t border-slate-200/50 mt-2 z-10">
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
                  <div className="text-sm text-blue-500 font-mono mt-1">{selectedTerm.pinyin_full}</div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_ENGLISH_DEF')}</label>
                <div className="text-lg text-slate-700 font-serif leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {selectedTerm.english_term}
                </div>
              </div>

              {selectedTerm.related_terms && selectedTerm.related_terms.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_ALIASES')}</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTerm.related_terms.map((alias, i) => (
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

              {selectedTerm.usage_scenario && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_USAGE')}</label>
                  <div className="flex gap-2 text-sm text-slate-600 bg-green-50 p-3 rounded-lg">
                    <Book className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p>{selectedTerm.usage_scenario}</p>
                  </div>
                </div>
              )}

              {selectedTerm.mistranslation_warning && selectedTerm.mistranslation_warning.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-red-400 uppercase mb-1">{t('AVOID')}</label>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <ul className="list-disc list-inside text-sm text-red-700">
                      {selectedTerm.mistranslation_warning.map((m, i) => <li key={i}>{m}</li>)}
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
                 <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <h4 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2">
                       <span className="w-5 h-5 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs">1</span>
                       {t('IMP_STEP1_TITLE')}
                    </h4>
                    <div className="relative group">
                       <pre className="text-xs bg-white p-3 rounded-lg text-slate-600 whitespace-pre-wrap font-mono border border-blue-100 leading-relaxed">
                          {prompt1}
                       </pre>
                       <button 
                         onClick={() => copyPrompt(1, prompt1)}
                         className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-md transition-colors text-slate-500"
                       >
                         {helpCopied === 1 ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                       </button>
                    </div>
                 </div>

                 <div className="p-4 bg-cyan-50 rounded-xl border border-cyan-100">
                    <h4 className="font-bold text-cyan-900 text-sm mb-2 flex items-center gap-2">
                       <span className="w-5 h-5 bg-cyan-200 text-cyan-700 rounded-full flex items-center justify-center text-xs">2</span>
                       {t('IMP_STEP2_TITLE')}
                    </h4>
                    <div className="relative group">
                       <pre className="text-xs bg-white p-3 rounded-lg text-slate-600 whitespace-pre-wrap font-mono border border-cyan-100 leading-relaxed">
                          {prompt2}
                       </pre>
                       <button 
                         onClick={() => copyPrompt(2, prompt2)}
                         className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-cyan-600 hover:text-white rounded-md transition-colors text-slate-500"
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