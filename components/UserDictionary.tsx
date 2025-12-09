
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Trash2, Search, Book, Download, Upload, FileJson, AlertTriangle, ChevronLeft, ChevronRight, X, Info } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { fetchSystemTerms } from '../services/search';
import { Term } from '../types';

export const UserDictionary: React.FC = () => {
  const { userTerms, removeUserTerm, importUserTerms } = useStore();
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Pagination & Selection State
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const pageSize = 14; // 2 columns * 7 rows

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  // Reset pagination when filter or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, activeTab]);

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const displayedTerms = activeTab === 'system' ? systemTerms : userTerms;

  const filtered = displayedTerms.filter(t => 
    (t.chinese_term?.toLowerCase() || '').includes(filter.toLowerCase()) || 
    (t.english_term?.toLowerCase() || '').includes(filter.toLowerCase())
  );

  // Pagination Logic
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
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeUserTerm(id);
    // Close modal if the deleted term was open
    if (selectedTerm?.id === id) {
      setSelectedTerm(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800">{t('DICT_TITLE')}</h2>
        
        {/* Import/Export Controls (Only visible on User tab) */}
        {activeTab === 'user' && (
          <div className="flex gap-2">
             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileChange} 
               accept=".json" 
               className="hidden" 
             />
             <button 
               onClick={handleImportClick}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all text-sm font-medium shadow-sm"
             >
               <Upload className="w-4 h-4" /> {t('BTN_IMPORT_JSON')}
             </button>
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

      {/* Status Message */}
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
                   <div className="flex items-baseline gap-2 min-w-0">
                     <h4 className="font-bold text-lg text-slate-800 truncate">{term.chinese_term}</h4>
                     {term.pinyin_full && (
                       <span className="text-xs font-mono text-indigo-400/80 shrink-0">{term.pinyin_full}</span>
                     )}
                   </div>
                   
                   {activeTab === 'user' && (
                     <button 
                       onClick={(e) => handleDelete(e, term.id)}
                       className="p-1.5 -mt-1 -mr-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                       title="Remove term"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                </div>
                
                <p className="text-indigo-700 font-medium leading-relaxed line-clamp-2 mb-2 flex-1" title={term.english_term}>
                   {term.english_term}
                </p>
                
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

              <div className="grid grid-cols-2 gap-4">
                {selectedTerm.category && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{t('LBL_CATEGORY')}</label>
                    <div className="text-sm text-slate-700">{selectedTerm.category}</div>
                  </div>
                )}
                {selectedTerm.root_analysis && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Root Analysis</label>
                    <div className="text-sm text-slate-700 italic">{selectedTerm.root_analysis}</div>
                  </div>
                )}
              </div>

              {selectedTerm.note && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Note</label>
                  <div className="flex gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p>{selectedTerm.note}</p>
                  </div>
                </div>
              )}

              {selectedTerm.usage && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Usage</label>
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
    </div>
  );
};
