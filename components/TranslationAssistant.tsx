
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms } from '../services/search';
import { Term, PageRoute } from '../types';
import { 
  buildTermSegments, 
  initialTranslate, 
  reflectOnTranslation, 
  improveTranslation,
  TextSegment 
} from '../services/textProcessing';
import { useTranslation } from '../services/i18n';
import { 
  Wand2, 
  Highlighter, 
  Edit3, 
  Settings,
  Zap,
  GraduationCap,
  Sparkles,
  HelpCircle,
  Loader2,
  AlertTriangle,
  Copy,
  ChevronDown,
  ChevronUp,
  MessageSquareQuote
} from 'lucide-react';
import { copyToClipboard } from '../services/clipboard';

const RenderedText: React.FC<{ 
  segments: TextSegment[];
  activeState: { termId: string; index: number } | null;
  selectedState: { termId: string; index: number } | null;
  onTermEnter: (term: Term, index: number) => void;
  onTermLeave: () => void;
  onTermClick: (e: React.MouseEvent, term: Term, index: number) => void;
  onTermDoubleClick: (e: React.MouseEvent, term: Term) => void;
}> = React.memo(({ segments, activeState, selectedState, onTermEnter, onTermLeave, onTermClick, onTermDoubleClick }) => (
  <div className="whitespace-pre-wrap leading-relaxed text-slate-800 text-base">
    {segments.map((seg) => {
      if (!seg.matchedTerm) {
        return <span key={seg.id}>{seg.text}</span>;
      }
      
      const isHovered = activeState?.termId === seg.matchedTerm.id && activeState?.index === seg.termOccurrenceIndex;
      const isSelected = selectedState?.termId === seg.matchedTerm.id && selectedState?.index === seg.termOccurrenceIndex;
      const isActive = isHovered || isSelected;
      
      return (
        <span
          key={seg.id}
          data-term-id={seg.matchedTerm.id}
          onMouseEnter={() => onTermEnter(seg.matchedTerm!, seg.termOccurrenceIndex!)}
          onMouseLeave={onTermLeave}
          onClick={(e) => onTermClick(e, seg.matchedTerm!, seg.termOccurrenceIndex!)}
          onDoubleClick={(e) => onTermDoubleClick(e, seg.matchedTerm!)}
          className={`cursor-pointer transition-colors duration-200 rounded px-0.5 border-b-2 
            ${isActive 
              ? 'bg-indigo-200 border-indigo-500 text-indigo-900 font-medium' // Active / Clicked style
              : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' // Normal matched style
            }`}
        >
          {seg.text}
        </span>
      );
    })}
  </div>
));

interface TranslationAssistantProps {
  onNavigate: (page: PageRoute) => void;
}

export const TranslationAssistant: React.FC<TranslationAssistantProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { userTerms, auth, setNavigatedTermId } = useStore();
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  
  // Input State
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  
  // Async State
  const [isLoading, setIsLoading] = useState(false);
  const [stepStatus, setStepStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // View State
  const [mode, setMode] = useState<'edit' | 'analyze'>('edit');
  
  // Interaction State
  const [hoveredState, setHoveredState] = useState<{termId: string, index: number} | null>(null);
  const [tooltipState, setTooltipState] = useState<{term: Term, index: number, x: number, y: number} | null>(null);

  // Translation Mode State
  const [transMode, setTransMode] = useState<'fast' | 'professional'>('fast');
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [showReflection, setShowReflection] = useState(false);

  // Request tracking to handle race conditions
  const requestRef = useRef(0);

  // Persistence
  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
    
    const savedText = localStorage.getItem('mtt_assistant_input');
    if (savedText) {
      setInputText(savedText);
    }
  }, []);

  // Click outside to close tooltip
  useEffect(() => {
    const handleClickOutside = () => setTooltipState(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Detect language
  const isSourceChinese = useMemo(() => {
    return /[\u4e00-\u9fa5]/.test(inputText);
  }, [inputText]);

  // Handle Input Clear
  useEffect(() => {
    if (!inputText.trim()) {
       setTranslatedText('');
       setReflectionNotes('');
       setError(null);
    }
  }, [inputText]);

  const allTerms = useMemo(() => [...userTerms, ...systemTerms], [userTerms, systemTerms]);

  const inputSegments = useMemo(() => 
    buildTermSegments(inputText, allTerms, { 
      mode: isSourceChinese ? 'source' : 'translation' 
    }), 
  [inputText, allTerms, isSourceChinese]);

  const translatedSegments = useMemo(() => 
    buildTermSegments(translatedText, allTerms, { 
      mode: isSourceChinese ? 'translation' : 'source' 
    }), 
  [translatedText, allTerms, isSourceChinese]);

  const detectedCount = useMemo(() => {
    const ids = new Set<string>();
    inputSegments.forEach(s => { if(s.matchedTerm) ids.add(s.matchedTerm.id); });
    return ids.size;
  }, [inputSegments]);

  const handleTranslate = async () => {
      if (!inputText.trim()) return;

      if (!auth) {
        return;
      }

      const requestId = ++requestRef.current;
      
      setIsLoading(true);
      setError(null);
      setReflectionNotes('');
      setShowReflection(false);
      
      const sourceLang = isSourceChinese ? 'Chinese' : 'English';
      const targetLang = isSourceChinese ? 'English' : 'Chinese';

      // Build Glossary from identified segments
      // We deduplicate based on source text
      const glossaryMap = new Map<string, string>();
      inputSegments.forEach(seg => {
        if (seg.matchedTerm) {
          const target = isSourceChinese ? seg.matchedTerm.english_term : seg.matchedTerm.chinese_term;
          if (target) {
             glossaryMap.set(seg.text, target);
          }
        }
      });
      const glossary = Array.from(glossaryMap.entries()).map(([source, target]) => ({ source, target }));

      try {
        if (transMode === 'fast') {
          setStepStatus(t('AST_STATUS_TRANSLATING')); 
          
          const result = await initialTranslate(inputText, sourceLang, targetLang, auth, glossary);
          
          if (requestId === requestRef.current) {
            setTranslatedText(result);
          }
        } else {
          // Professional Mode Workflow
          setStepStatus(t('AST_STATUS_DRAFTING'));
          const draft = await initialTranslate(inputText, sourceLang, targetLang, auth, glossary);
          
          if (requestId !== requestRef.current) return;
          setTranslatedText(draft);

          setStepStatus(t('AST_STATUS_REVIEWING'));
          const critique = await reflectOnTranslation(inputText, draft, sourceLang, targetLang, auth);
          
          if (requestId !== requestRef.current) return;
          setReflectionNotes(critique);
          
          setStepStatus(t('AST_STATUS_POLISHING'));
          const final = await improveTranslation(inputText, draft, critique, sourceLang, targetLang, auth);
          
          if (requestId !== requestRef.current) return;
          setTranslatedText(final);
        }
      } catch (err: any) {
        if (requestId === requestRef.current) {
          console.error(err);
          if (err.message === 'QUOTA_EXCEEDED') {
            setError(t('ERR_QUOTA_EXCEEDED'));
          } else {
            setError(err.message || t('ERR_TRANS_FAILED'));
          }
        }
      } finally {
        if (requestId === requestRef.current) {
          setIsLoading(false);
          setStepStatus('');
        }
      }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
    localStorage.setItem('mtt_assistant_input', newText);
  };

  const handleGoToSettings = () => {
    onNavigate('settings');
  };

  const handleTermEnter = useCallback((term: Term, index: number) => {
    setHoveredState({ termId: term.id, index });
  }, []);

  const handleTermLeave = useCallback(() => {
    setHoveredState(null);
  }, []);

  const handleTermClick = useCallback((e: React.MouseEvent, term: Term, index: number) => {
    e.stopPropagation(); 
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    setTooltipState({
      term,
      index,
      x: rect.left + rect.width / 2,
      y: rect.top - 8 
    });
  }, []);

  const handleTermDoubleClick = useCallback((e: React.MouseEvent, term: Term) => {
    e.stopPropagation();
    setNavigatedTermId(term.id);
    onNavigate('dictionary');
  }, [onNavigate, setNavigatedTermId]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-indigo-600" />
            {t('AST_TITLE')}
          </h2>
          <p className="text-sm text-slate-500">{t('AST_SUBTITLE')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           {detectedCount > 0 && (
             <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
               {t('AST_DETECTED', { count: detectedCount })}
             </span>
           )}

           <button
             onClick={handleTranslate}
             disabled={isLoading || !inputText.trim() || !auth}
             className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm shadow-sm transition-all
               ${isLoading || !inputText.trim() || !auth
                 ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                 : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20 shadow-indigo-500/10'
               }`}
           >
             {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
             {t('BTN_TRANSLATE_NOW')}
           </button>
           
           <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 items-center">
             <button 
               onClick={() => setTransMode('fast')}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                 transMode === 'fast' 
                   ? 'bg-white text-indigo-700 shadow-sm' 
                   : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               <Zap size={14} className={transMode === 'fast' ? "fill-indigo-600/20" : ""} /> {t('MODE_FAST')}
             </button>
             <button 
               onClick={() => setTransMode('professional')}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                 transMode === 'professional' 
                   ? 'bg-white text-indigo-700 shadow-sm' 
                   : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               <GraduationCap size={14} className={transMode === 'professional' ? "fill-indigo-600/20" : ""} /> {t('MODE_PRO')}
             </button>
             
             <div className="group relative ml-2 mr-1">
               <HelpCircle size={14} className="text-slate-400 hover:text-indigo-500 cursor-help" />
               <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                 {t('MODE_PRO_DESC')}
                 <div className="absolute top-0 right-1.5 -translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        
        {/* LEFT PANEL: Source */}
        <div className="flex flex-col bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white/40">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">{t('AST_SOURCE')}</span>
            
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              <button 
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'edit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> {t('AST_MODE_EDIT')}
              </button>
              <button 
                onClick={() => setMode('analyze')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'analyze' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" /> {t('AST_MODE_ANALYZE')}
              </button>
            </div>
          </div>
          
          <div className="flex-1 relative overflow-auto">
            {mode === 'edit' ? (
              <textarea
                value={inputText}
                onChange={handleInputChange}
                placeholder={t('AST_PLACEHOLDER')}
                className="w-full h-full p-6 bg-transparent resize-none focus:outline-none text-slate-700 leading-relaxed text-base"
                spellCheck={false}
              />
            ) : (
              <div className="p-6 h-full w-full overflow-auto">
                <RenderedText 
                  segments={inputSegments} 
                  activeState={hoveredState}
                  selectedState={tooltipState ? { termId: tooltipState.term.id, index: tooltipState.index } : null}
                  onTermEnter={handleTermEnter}
                  onTermLeave={handleTermLeave}
                  onTermClick={handleTermClick}
                  onTermDoubleClick={handleTermDoubleClick}
                />
                {inputText.length === 0 && <span className="text-slate-400 italic">{t('AST_EMPTY')}</span>}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Translation / Preview */}
        <div className="flex flex-col bg-indigo-50/50 backdrop-blur-md rounded-2xl border border-indigo-100 shadow-sm overflow-hidden relative">
           <div className="flex items-center justify-between p-3 border-b border-indigo-100/50 bg-indigo-50/50">
            <span className="text-xs font-bold text-indigo-600/70 uppercase tracking-wider ml-2">{t('AST_TARGET')}</span>
            {auth && (
              <span className="text-[10px] text-indigo-400 bg-white/50 px-2 py-1 rounded border border-indigo-100 flex items-center gap-1">
                {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {isLoading ? (stepStatus || 'Processing...') : (translatedText ? t('STATUS_CONNECTED') : t('AST_AUTO_PREVIEW'))}
              </span>
            )}
          </div>

          <div className="p-6 flex-1 overflow-auto relative flex flex-col">
            {!auth ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                 <button 
                    onClick={handleGoToSettings}
                    className="bg-white/50 p-4 rounded-full mb-4 hover:bg-white/80 hover:shadow-lg transition-all group cursor-pointer"
                    title={t('BTN_GOTO_SETTINGS')}
                 >
                    <Settings className="w-8 h-8 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                 </button>
                 <h3 className="font-bold text-slate-600 mb-1">{t('ERR_AI_DISABLED_TITLE')}</h3>
                 <p className="text-sm mb-4">{t('ERR_AI_DISABLED_MSG')}</p>
                 <button 
                   onClick={handleGoToSettings}
                   className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                 >
                   {t('BTN_GOTO_SETTINGS')}
                 </button>
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center text-rose-500 p-6 text-center">
                 <div className="bg-rose-100 p-3 rounded-full mb-3">
                   <AlertTriangle className="w-6 h-6" />
                 </div>
                 <p className="font-medium mb-2">{error}</p>
                 <p className="text-xs text-rose-400 max-w-xs">{t('ERR_TROUBLESHOOT')}: {t('ERR_CAUSES')}</p>
                 <button 
                   onClick={handleTranslate} 
                   className="mt-4 px-4 py-2 bg-white border border-rose-200 rounded-lg text-sm text-rose-600 hover:bg-rose-50"
                 >
                   Try Again
                 </button>
              </div>
            ) : translatedText ? (
              <>
                <RenderedText 
                  segments={translatedSegments} 
                  activeState={hoveredState}
                  selectedState={tooltipState ? { termId: tooltipState.term.id, index: tooltipState.index } : null}
                  onTermEnter={handleTermEnter}
                  onTermLeave={handleTermLeave}
                  onTermClick={handleTermClick}
                  onTermDoubleClick={handleTermDoubleClick}
                />
                
                {reflectionNotes && (
                   <div className="mt-8 border-t border-indigo-200/50 pt-4">
                     <button 
                       onClick={() => setShowReflection(!showReflection)}
                       className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wide hover:text-indigo-800 transition-colors"
                     >
                        <MessageSquareQuote className="w-4 h-4" />
                        {t('BTN_EXPERT_SUGGESTIONS')}
                        {showReflection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                     </button>
                     
                     {showReflection && (
                       <div className="mt-3 p-4 bg-white/60 rounded-xl border border-indigo-100 text-sm text-slate-600 leading-relaxed animate-in slide-in-from-top-2">
                         <div className="whitespace-pre-wrap">{reflectionNotes}</div>
                       </div>
                     )}
                   </div>
                )}
              </>
            ) : (
               <div className="h-full flex items-center justify-center text-slate-400/50 italic select-none">
                 {t('AST_TARGET_PLACEHOLDER')}
               </div>
            )}
          </div>
          
          {translatedText && !isLoading && (
            <div className="absolute top-14 right-4 flex gap-2">
               <button 
                 onClick={() => copyToClipboard(translatedText, t('TOAST_COPY_SUCCESS'), t('TOAST_COPY_FAIL'))}
                 className="p-2 bg-white/80 hover:bg-white text-slate-500 hover:text-indigo-600 rounded-lg shadow-sm border border-indigo-100 transition-all backdrop-blur-sm"
                 title={t('BTN_COPY')}
               >
                 <Copy className="w-4 h-4" />
               </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Tooltip Popup */}
      {tooltipState && (
        <div 
          className="fixed z-50 bg-slate-900 text-white p-3 rounded-xl shadow-2xl max-w-xs animate-in zoom-in-95 duration-200 pointer-events-none"
          style={{ 
            left: tooltipState.x, 
            top: tooltipState.y,
            transform: 'translate(-50%, -100%)',
            marginTop: '-8px'
          }}
        >
          <div className="font-bold text-sm mb-1">{tooltipState.term.chinese_term}</div>
          <div className="text-indigo-300 font-medium text-sm mb-2">{tooltipState.term.english_term}</div>
          {tooltipState.term.note && (
            <div className="text-xs text-slate-400 border-t border-slate-700 pt-2 mt-1">{tooltipState.term.note}</div>
          )}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
};
