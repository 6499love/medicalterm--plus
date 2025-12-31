import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { fetchSystemTerms } from '../services/search';
import { Term, PageRoute } from '../types';
import { 
  buildTermSegments, 
  translateText, 
  segmentsFromAlignments,
  TextSegment, 
  TermAlignment
} from '../services/textProcessing';
import { getTokenCount } from '../services/translationChunkUtils';
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
  MessageSquareQuote,
  Coins,
  Clock,
  X
} from 'lucide-react';
import { copyToClipboard } from '../services/clipboard';

const RenderedText: React.FC<{ 
  segments: TextSegment[];
  activeState: { termId: string; index: number } | null;
  selectedState: { termId: string; index: number } | null;
  onTermEnter: (term: Term, index: number) => void;
  onTermLeave: () => void;
  onTermClick?: (e: React.MouseEvent, term: Term, index: number) => void;
  onTermDoubleClick?: (e: React.MouseEvent, term: Term) => void;
}> = React.memo(({ segments, activeState, selectedState, onTermEnter, onTermLeave, onTermClick, onTermDoubleClick }) => (
  <div className="whitespace-pre-wrap leading-relaxed text-slate-800 text-base">
    {segments.map((seg) => {
      if (!seg.matchedTerm) {
        return <span key={seg.id}>{seg.text}</span>;
      }
      
      const isHovered = activeState?.termId === seg.matchedTerm.id && activeState?.index === seg.termOccurrenceIndex;
      const isSelected = selectedState?.termId === seg.matchedTerm.id && selectedState?.index === seg.termOccurrenceIndex;
      const isActive = isHovered || isSelected;
      const isInteractive = !!onTermClick;
      
      return (
        <span
          key={seg.id}
          data-term-id={seg.matchedTerm.id}
          onMouseEnter={() => onTermEnter(seg.matchedTerm!, seg.termOccurrenceIndex!)}
          onMouseLeave={onTermLeave}
          onClick={(e) => isInteractive && onTermClick?.(e, seg.matchedTerm!, seg.termOccurrenceIndex!)}
          onDoubleClick={(e) => isInteractive && onTermDoubleClick?.(e, seg.matchedTerm!)}
          className={`transition-colors duration-200 rounded px-0.5 border-b-2 
            ${isInteractive ? 'cursor-pointer' : 'cursor-default'}
            ${isActive 
              ? 'bg-blue-200 border-blue-500 text-blue-900 font-medium' // Active / Clicked style
              : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' // Normal matched style
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
  
  // Alignment State
  const [alignments, setAlignments] = useState<TermAlignment[] | null>(null);

  // Async State
  const [isLoading, setIsLoading] = useState(false);
  const [stepStatus, setStepStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // View State
  const [mode, setMode] = useState<'edit' | 'analyze'>('edit');
  
  // Interaction State
  const [hoveredState, setHoveredState] = useState<{termId: string, index: number} | null>(null);
  
  // Tooltip Logic State
  const [activeTooltipTerm, setActiveTooltipTerm] = useState<Term | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<HTMLElement | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<{x: number, y: number} | null>(null);

  // Translation Mode State
  const [transMode, setTransMode] = useState<'fast' | 'professional'>('fast');
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [showReflection, setShowReflection] = useState(false);

  // Token Estimate State
  const [estTokens, setEstTokens] = useState(0);

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

  // Tooltip Positioning Logic
  useLayoutEffect(() => {
    if (!tooltipAnchor || !activeTooltipTerm) {
      setTooltipCoords(null);
      return;
    }

    const updatePosition = () => {
      const rect = tooltipAnchor.getBoundingClientRect();
      // Check if element is in viewport
      if (
        rect.top < 0 || 
        rect.left < 0 || 
        rect.bottom > window.innerHeight || 
        rect.right > window.innerWidth ||
        rect.width === 0 || 
        rect.height === 0
      ) {
         setTooltipCoords(null); // Hide if scrolled out
         return;
      }

      setTooltipCoords({
        x: rect.left + rect.width / 2,
        y: rect.top
      });
    };

    updatePosition();

    // Listen to global scroll/resize to update position
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [tooltipAnchor, activeTooltipTerm]);

  // Click outside listener for tooltip
  useEffect(() => {
    if (!activeTooltipTerm) return;

    const handleClickOutside = (e: MouseEvent) => {
       if (tooltipAnchor && tooltipAnchor.contains(e.target as Node)) {
         return; 
       }
       
       const target = e.target as HTMLElement;
       if (target.closest('.mtt-tooltip')) return;

       setActiveTooltipTerm(null);
       setTooltipAnchor(null);
    };

    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeTooltipTerm, tooltipAnchor]);


  // Detect language
  const isSourceChinese = useMemo(() => {
    return /[\u4e00-\u9fa5]/.test(inputText);
  }, [inputText]);

  // Handle Input Clear and Token Counting
  useEffect(() => {
    if (!inputText.trim()) {
       setTranslatedText('');
       setReflectionNotes('');
       setAlignments(null);
       setError(null);
       setEstTokens(0);
       return;
    }

    // Debounce token estimation
    const timer = setTimeout(() => {
       setEstTokens(getTokenCount(inputText));
    }, 500);

    return () => clearTimeout(timer);
  }, [inputText]);

  const allTerms = useMemo(() => [...userTerms, ...systemTerms], [userTerms, systemTerms]);

  // Initial analysis is always regex based (fast)
  // If we have alignments from LLM, we use those for segments.
  const inputSegments = useMemo(() => {
    if (alignments && alignments.length > 0) {
      return segmentsFromAlignments(inputText, alignments, 'source', allTerms);
    }
    return buildTermSegments(inputText, allTerms, { 
      mode: isSourceChinese ? 'source' : 'translation' 
    });
  }, [inputText, allTerms, isSourceChinese, alignments]);

  // Extract detected terms from source analysis to ensure target matches are consistent with source
  const detectedTerms = useMemo(() => {
    const unique = new Map<string, Term>();
    // If we have alignments, use them to determine detected terms
    if (alignments && alignments.length > 0) {
        alignments.forEach(a => {
            const t = allTerms.find(term => term.id === a.termId);
            if (t) unique.set(t.id, t);
        });
    } else {
        // Fallback to regex analysis result
        inputSegments.forEach(s => {
           if (s.matchedTerm) unique.set(s.matchedTerm.id, s.matchedTerm);
        });
    }
    return Array.from(unique.values());
  }, [inputSegments, alignments, allTerms]);

  const translatedSegments = useMemo(() => {
    // If we have AI alignments, use them for precise mapping
    if (alignments && alignments.length > 0) {
        return segmentsFromAlignments(translatedText, alignments, 'target', allTerms);
    }
    // Fallback: Use detected terms for regex matching on target
    return buildTermSegments(translatedText, detectedTerms, { 
      mode: isSourceChinese ? 'translation' : 'source' 
    });
  }, [translatedText, detectedTerms, isSourceChinese, alignments, allTerms]);

  const detectedCount = detectedTerms.length;

  const handleTranslate = async () => {
      if (!inputText.trim()) return;

      if (!auth) {
        return;
      }

      // Always switch to analyze mode to show highlights
      setMode('analyze');

      const requestId = ++requestRef.current;
      
      setIsLoading(true);
      setError(null);
      setReflectionNotes('');
      setAlignments(null);
      setShowReflection(false);
      
      const sourceLang = isSourceChinese ? 'Chinese' : 'English';
      const targetLang = isSourceChinese ? 'English' : 'Chinese';

      // Build Glossary from regex-identified segments for context
      // Note: We use regex result initially because alignments are not yet available
      const glossaryMap = new Map<string, { target: string, id: string }>();
      // Use regex analysis for glossary preparation
      const initialRegexSegments = buildTermSegments(inputText, allTerms, { mode: isSourceChinese ? 'source' : 'translation' });
      initialRegexSegments.forEach(seg => {
        if (seg.matchedTerm) {
          const target = isSourceChinese ? seg.matchedTerm.english_term : seg.matchedTerm.chinese_term;
          if (target) {
             glossaryMap.set(seg.text, { target, id: seg.matchedTerm.id });
          }
        }
      });
      const glossary = Array.from(glossaryMap.entries()).map(([source, val]) => ({ 
        source, 
        target: val.target, 
        id: val.id 
      }));

      // Get detected terms to pass for alignment
      const relevantTerms = Array.from(glossaryMap.values()).map(v => allTerms.find(t => t.id === v.id)).filter(Boolean) as Term[];

      try {
        const result = await translateText(inputText, transMode, auth, {
          glossary,
          relevantTerms,
          sourceLang,
          targetLang,
          onProgress: (s) => setStepStatus(s)
        });
        
        if (requestId === requestRef.current) {
           setTranslatedText(result.finalText);
           setReflectionNotes(result.reflectionNotes || '');
           if (result.alignments) {
              setAlignments(result.alignments);
           }
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
    // Alignments are invalid if text changes
    if (alignments) setAlignments(null);
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
    
    // Toggle: if clicking same term, close it
    if (activeTooltipTerm?.id === term.id && tooltipAnchor === e.currentTarget) {
       setActiveTooltipTerm(null);
       setTooltipAnchor(null);
       return;
    }

    setActiveTooltipTerm(term);
    setTooltipAnchor(e.currentTarget as HTMLElement);
  }, [activeTooltipTerm, tooltipAnchor]);

  const handleTermDoubleClick = useCallback((e: React.MouseEvent, term: Term) => {
    e.stopPropagation();
    setNavigatedTermId(term.id);
    onNavigate('dictionary');
  }, [onNavigate, setNavigatedTermId]);

  const getTokenHint = () => {
    if (estTokens === 0) return null;
    
    if (estTokens > 2000) {
        return {
            text: t('TOKEN_ESTIMATE_LONG', { count: estTokens }),
            color: 'text-amber-600 bg-amber-50 border-amber-200',
            icon: <Clock className="w-3.5 h-3.5" />
        };
    }
    if (estTokens > 800) {
        return {
            text: t('TOKEN_ESTIMATE_MEDIUM', { count: estTokens }),
            color: 'text-blue-600 bg-blue-50 border-blue-200',
            icon: <Coins className="w-3.5 h-3.5" />
        };
    }
    return {
        text: t('TOKEN_ESTIMATE_SHORT', { count: estTokens }),
        color: 'text-slate-500 bg-slate-50 border-slate-200',
        icon: <Coins className="w-3.5 h-3.5" />
    };
  };

  const tokenHint = getTokenHint();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 lg:mb-6 shrink-0 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wand2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            {t('AST_TITLE')}
          </h2>
          <p className="text-xs md:text-sm text-slate-500">{t('AST_SUBTITLE')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           {detectedCount > 0 && (
             <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 md:px-3 md:py-1.5 rounded-full border border-blue-100">
               {t('AST_DETECTED', { count: detectedCount })}
             </span>
           )}

           <button
             onClick={handleTranslate}
             disabled={isLoading || !inputText.trim() || !auth}
             className={`flex items-center gap-2 px-4 py-2 md:px-5 md:py-2 rounded-xl font-bold text-sm shadow-sm transition-all
               ${isLoading || !inputText.trim() || !auth
                 ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                 : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/20 shadow-blue-500/10'
               }`}
           >
             {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
             {t('BTN_TRANSLATE_NOW')}
           </button>
           
           <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 items-center">
             <button 
               onClick={() => setTransMode('fast')}
               className={`flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-1.5 rounded-lg text-xs font-bold transition-all ${
                 transMode === 'fast' 
                   ? 'bg-white text-blue-700 shadow-sm' 
                   : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               <Zap size={14} className={transMode === 'fast' ? "fill-blue-600/20" : ""} /> <span className="hidden sm:inline">{t('MODE_FAST')}</span>
             </button>
             <button 
               onClick={() => setTransMode('professional')}
               className={`flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-1.5 rounded-lg text-xs font-bold transition-all ${
                 transMode === 'professional' 
                   ? 'bg-white text-blue-700 shadow-sm' 
                   : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               <GraduationCap size={14} className={transMode === 'professional' ? "fill-blue-600/20" : ""} /> <span className="hidden sm:inline">{t('MODE_PRO')}</span>
             </button>
             
             <div className="group relative ml-2 mr-1 hidden sm:block">
               <HelpCircle size={14} className="text-slate-400 hover:text-blue-500 cursor-help" />
               <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 text-white text-[10px] p-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                 {t('MODE_PRO_DESC')}
                 <div className="absolute top-0 right-1.5 -translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 gap-6 min-h-0">
        
        {/* LEFT PANEL: Source */}
        <div className="flex flex-col bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden min-h-[300px] lg:min-h-0">
          <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white/40">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">{t('AST_SOURCE')}</span>
            
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              <button 
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'edit' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> {t('AST_MODE_EDIT')}
              </button>
              <button 
                onClick={() => setMode('analyze')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'analyze' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" /> {t('AST_MODE_ANALYZE')}
              </button>
            </div>
          </div>
          
          <div className="flex-1 relative overflow-auto flex flex-col">
            <div className="flex-1 relative">
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
                    selectedState={activeTooltipTerm ? { termId: activeTooltipTerm.id, index: 0 } : null} // Only match ID for generic highlighting when selected
                    onTermEnter={handleTermEnter}
                    onTermLeave={handleTermLeave}
                    onTermClick={handleTermClick}
                    onTermDoubleClick={handleTermDoubleClick}
                  />
                  {inputText.length === 0 && <span className="text-slate-400 italic">{t('AST_EMPTY')}</span>}
                </div>
              )}
            </div>

            {/* Token Hint Footer */}
            {tokenHint && (
               <div className={`px-4 py-2 text-xs flex items-center justify-end gap-2 border-t font-medium transition-colors ${tokenHint.color}`}>
                  {tokenHint.icon}
                  <span>{tokenHint.text}</span>
               </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Translation / Preview */}
        <div className="flex flex-col bg-blue-50/50 backdrop-blur-md rounded-2xl border border-blue-100 shadow-sm overflow-hidden relative min-h-[300px] lg:min-h-0">
           <div className="flex items-center justify-between p-3 border-b border-blue-100/50 bg-blue-50/50">
            <span className="text-xs font-bold text-blue-600/70 uppercase tracking-wider ml-2">{t('AST_TARGET')}</span>
            {auth && (
              <span className="text-[10px] text-blue-400 bg-white/50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
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
                    <Settings className="w-8 h-8 text-slate-300 group-hover:text-blue-500 transition-colors" />
                 </button>
                 <h3 className="font-bold text-slate-600 mb-2 text-lg">{t('ERR_AI_DISABLED_TITLE')}</h3>
                 <p className="text-lg font-bold text-slate-800 mb-6 max-w-xs mx-auto leading-snug">{t('ERR_AI_DISABLED_MSG')}</p>
                 <button 
                   onClick={handleGoToSettings}
                   className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
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
                  selectedState={null} // Highlighting in translation is passive only
                  onTermEnter={handleTermEnter}
                  onTermLeave={handleTermLeave}
                  // No interaction handlers for translation panel, purely for viewing highlighted terms
                />
                
                {reflectionNotes && (
                   <div className="mt-8 border-t border-blue-200/50 pt-4">
                     <button 
                       onClick={() => setShowReflection(!showReflection)}
                       className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wide hover:text-blue-800 transition-colors"
                     >
                        <MessageSquareQuote className="w-4 h-4" />
                        {t('BTN_EXPERT_SUGGESTIONS')}
                        {showReflection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                     </button>
                     
                     {showReflection && (
                       <div className="mt-3 p-4 bg-white/60 rounded-xl border border-blue-100 text-sm text-slate-600 leading-relaxed animate-in slide-in-from-top-2 max-h-60 overflow-y-auto">
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
                 className="p-2 bg-white/80 hover:bg-white text-slate-500 hover:text-blue-600 rounded-lg shadow-sm border border-blue-100 transition-all backdrop-blur-sm"
                 title={t('BTN_COPY')}
               >
                 <Copy className="w-4 h-4" />
               </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Tooltip Popup - Rendered via Portal to escape stacking contexts */}
      {tooltipCoords && activeTooltipTerm && createPortal(
        <div 
          className="mtt-tooltip fixed z-[9999] bg-slate-900 text-white p-3 rounded-xl shadow-2xl max-w-xs animate-in zoom-in-95 duration-200"
          style={{ 
            left: tooltipCoords.x,
            top: tooltipCoords.y + 24, // Offset slightly below
            transform: 'translateX(-50%)'
          }}
        >
          <div className="flex justify-between items-start mb-1">
             <div className="text-sm font-bold text-blue-300">{activeTooltipTerm.chinese_term}</div>
             <div className="text-[10px] text-slate-400 bg-slate-800 px-1.5 rounded border border-slate-700 uppercase tracking-wider">{activeTooltipTerm.source}</div>
          </div>
          <div className="text-sm font-serif mb-2 leading-snug">{activeTooltipTerm.english_term}</div>
          
          {(activeTooltipTerm.note || activeTooltipTerm.category) && (
             <div className="pt-2 border-t border-slate-700 text-xs text-slate-400 flex flex-col gap-1">
               {activeTooltipTerm.category && <span>{activeTooltipTerm.category}</span>}
               {activeTooltipTerm.note && <span>{activeTooltipTerm.note}</span>}
             </div>
          )}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
        </div>,
        document.body
      )}
    </div>
  );
};