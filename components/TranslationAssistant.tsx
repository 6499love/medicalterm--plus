
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms } from '../services/search';
import { Term } from '../types';
import { 
  tokenizeTextWithTerms, 
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
  Type, 
  Info, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  Settings,
  Zap,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Sparkles,
  HelpCircle
} from 'lucide-react';

export const TranslationAssistant: React.FC = () => {
  const { t } = useTranslation();
  const { userTerms, auth } = useStore();
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
  const [hoveredTermId, setHoveredTermId] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<{ term: Term, x: number, y: number } | null>(null);

  // Translation Mode State
  const [transMode, setTransMode] = useState<'fast' | 'professional'>('fast');
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [isReflectionOpen, setIsReflectionOpen] = useState(false);

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

  // Detect language of source text
  const isSourceChinese = useMemo(() => {
    // Default to false (English) if empty, but simple check for any Chinese char
    return /[\u4e00-\u9fa5]/.test(inputText);
  }, [inputText]);

  // AI Translation Effect (Debounced)
  useEffect(() => {
    const translate = async () => {
      if (!inputText.trim()) {
        setTranslatedText('');
        setReflectionNotes('');
        setError(null);
        return;
      }

      if (!auth) {
        setTranslatedText('');
        return;
      }

      // Increment request ID to invalidate previous pending requests
      const requestId = ++requestRef.current;
      
      setIsLoading(true);
      setError(null);
      setReflectionNotes(''); // Clear notes when starting new translation
      
      const sourceLang = isSourceChinese ? 'Chinese' : 'English';
      const targetLang = isSourceChinese ? 'English' : 'Chinese';

      try {
        if (transMode === 'fast') {
          setStepStatus(t('AST_STATUS_TRANSLATING') || 'Translating...'); // Fallback string if key missing
          
          // Use initialTranslate for fast mode
          const result = await initialTranslate(inputText, sourceLang, targetLang, auth);
          
          if (requestId === requestRef.current) {
            setTranslatedText(result);
          }
        } else {
          // Professional Mode Workflow
          
          // Step 1: Initial Draft
          setStepStatus('Drafting translation...');
          const draft = await initialTranslate(inputText, sourceLang, targetLang, auth);
          
          if (requestId !== requestRef.current) return;
          // Show draft immediately for better UX
          setTranslatedText(draft);

          // Step 2: Reflection / Critique
          setStepStatus('Reviewing translation...');
          const critique = await reflectOnTranslation(inputText, draft, sourceLang, targetLang, auth);
          
          if (requestId !== requestRef.current) return;
          setReflectionNotes(critique);
          
          // Step 3: Improvement
          setStepStatus('Polishing translation...');
          const final = await improveTranslation(inputText, draft, critique, sourceLang, targetLang, auth);
          
          if (requestId !== requestRef.current) return;
          setTranslatedText(final);
        }
      } catch (err: any) {
        if (requestId === requestRef.current) {
          console.error(err);
          setError(err.message || 'Translation failed');
        }
      } finally {
        if (requestId === requestRef.current) {
          setIsLoading(false);
          setStepStatus('');
        }
      }
    };

    const timeoutId = setTimeout(translate, 1000); // 1s debounce
    return () => clearTimeout(timeoutId);
  }, [inputText, auth, transMode, isSourceChinese]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setInputText(newText);
    localStorage.setItem('mtt_assistant_input', newText);
  };

  // Combine terms for tokenizer
  const allTerms = useMemo(() => [...userTerms, ...systemTerms], [userTerms, systemTerms]);

  // Tokenize Input - Source Panel
  // If source is Chinese, match Chinese terms. If English, match English terms.
  const inputSegments = useMemo(() => 
    tokenizeTextWithTerms(inputText, allTerms, isSourceChinese ? 'chinese' : 'english'), 
  [inputText, allTerms, isSourceChinese]);

  // Tokenize Output - Target Panel
  // If source was Chinese, target is English -> match English terms.
  // If source was English, target is Chinese -> match Chinese terms.
  const outputSegments = useMemo(() => 
    tokenizeTextWithTerms(translatedText, allTerms, isSourceChinese ? 'english' : 'chinese'), 
  [translatedText, allTerms, isSourceChinese]);

  // Count unique detected terms
  const detectedCount = useMemo(() => {
    const ids = new Set<string>();
    inputSegments.forEach(s => { if(s.matchedTerm) ids.add(s.matchedTerm.id); });
    return ids.size;
  }, [inputSegments]);

  // Tooltip & Hover Logic
  const handleTermEnter = (e: React.MouseEvent, term: Term) => {
    setHoveredTermId(term.id);
    
    // Calculate tooltip position relative to viewport
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltipData({
      term,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  };

  const handleTermLeave = () => {
    setHoveredTermId(null);
    setTooltipData(null);
  };

  // Sub-component for rendering segments
  const RenderedText: React.FC<{ segments: TextSegment[] }> = ({ segments }) => (
    <div className="whitespace-pre-wrap leading-relaxed text-slate-700">
      {segments.map((seg) => {
        if (!seg.matchedTerm) {
          return <span key={seg.id}>{seg.text}</span>;
        }
        
        const isHovered = hoveredTermId === seg.matchedTerm.id;
        
        return (
          <span
            key={seg.id}
            data-term-id={seg.matchedTerm.id}
            onMouseEnter={(e) => handleTermEnter(e, seg.matchedTerm!)}
            onMouseLeave={handleTermLeave}
            className={`cursor-pointer transition-colors duration-200 rounded px-0.5 border-b-2 
              ${isHovered 
                ? 'bg-indigo-200 border-indigo-500 text-indigo-900' 
                : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-indigo-600" />
            {t('AST_TITLE')}
          </h2>
          <p className="text-sm text-slate-500">{t('AST_SUBTITLE')}</p>
        </div>
        
        <div className="flex items-center gap-4">
           {detectedCount > 0 && (
             <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
               {t('AST_DETECTED', { count: detectedCount })}
             </span>
           )}
           
           {/* Mode Toggle */}
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
             
             {/* Info Tooltip for Professional Mode */}
             <div className="group relative ml-2 mr-1">
               <HelpCircle size={14} className="text-slate-400 hover:text-indigo-500 cursor-help" />
               <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
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
                <RenderedText segments={inputSegments} />
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
                {isLoading ? (stepStatus || 'Processing...') : t('AST_AUTO_PREVIEW')}
              </span>
            )}
          </div>

          <div className="p-6 flex-1 overflow-auto relative">
            {!auth ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                 <div className="bg-white/50 p-4 rounded-full mb-4">
                    <Settings className="w-8 h-8 text-slate-300" />
                 </div>
                 <h3 className="font-bold text-slate-600 mb-1">AI Features Disabled</h3>
                 <p className="text-sm mb-4">Please configure your API key in Settings to enable real-time medical translation.</p>
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center text-red-400 p-6 text-center animate-in fade-in">
                 <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
                 <p className="text-sm font-medium">{error}</p>
                 <p className="text-xs mt-2 opacity-70">Check your API key or connection</p>
              </div>
            ) : translatedText ? (
               <div className="animate-in fade-in duration-500">
                  <RenderedText segments={outputSegments} />
                  
                  {/* Expert Review Notes (Professional Mode Only) */}
                  {transMode === 'professional' && reflectionNotes && !isLoading && (
                    <div className="mt-8 border-t border-indigo-200/50 pt-4 animate-in slide-in-from-bottom-2">
                      <button 
                        onClick={() => setIsReflectionOpen(!isReflectionOpen)} 
                        className="flex items-center gap-2 text-xs font-bold text-indigo-700 hover:text-indigo-900 mb-3 px-2 py-1 hover:bg-indigo-100/50 rounded-lg transition-colors w-full"
                      >
                        <Sparkles size={14} className="text-amber-500"/>
                        Expert Review Notes
                        <div className="ml-auto text-indigo-400">
                           {isReflectionOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </div>
                      </button>
                      
                      {isReflectionOpen && (
                        <div className="text-xs text-slate-600 bg-white/60 p-4 rounded-xl border border-indigo-100 leading-relaxed whitespace-pre-wrap shadow-sm">
                          {reflectionNotes}
                        </div>
                      )}
                    </div>
                  )}
               </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-indigo-300">
                 {isLoading ? (
                    <div className="flex flex-col items-center animate-pulse">
                      <Wand2 className="w-8 h-8 mb-2 opacity-50 text-indigo-400" />
                      <span className="text-sm">{stepStatus || 'Translating...'}</span>
                    </div>
                 ) : (
                    <>
                      <ArrowRight className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-sm">{t('AST_TARGET_PLACEHOLDER')}</span>
                    </>
                 )}
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Tooltip */}
      {tooltipData && (
        <div 
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 w-64"
          style={{ left: tooltipData.x, top: tooltipData.y }}
        >
          <div className="bg-slate-800 text-white p-4 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-2">
               <div>
                 <div className="font-bold text-lg">{tooltipData.term.chinese_term}</div>
                 <div className="text-indigo-300 font-medium text-sm">{tooltipData.term.english_term}</div>
               </div>
               <span className="text-[10px] uppercase bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                 {tooltipData.term.source === 'user' ? t('SOURCE_USER') : t('SOURCE_SYSTEM')}
               </span>
            </div>
            
            {tooltipData.term.category && (
              <div className="text-xs text-slate-400 mb-2">{tooltipData.term.category}</div>
            )}
            
            {(tooltipData.term.note || tooltipData.term.usage) && (
              <div className="mt-3 pt-2 border-t border-slate-700 space-y-2">
                {tooltipData.term.note && (
                  <div className="flex gap-2 text-xs text-slate-300">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{tooltipData.term.note}</span>
                  </div>
                )}
                 {tooltipData.term.usage && (
                  <div className="flex gap-2 text-xs text-slate-300">
                    <Type className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="italic">{tooltipData.term.usage}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 bg-slate-800 rotate-45"></div>
          </div>
        </div>
      )}
    </div>
  );
};
