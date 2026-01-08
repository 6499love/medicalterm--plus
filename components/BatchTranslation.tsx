
import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms, searchTerms } from '../services/search';
import { Term } from '../types';
import { ArrowRight, Download, Loader2, Sparkles, Book, AlertCircle, X, Copy } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { getCompletion } from '../services/llm';
import { copyToClipboard } from '../services/clipboard';
import * as XLSX from 'xlsx';

interface BatchResult {
  original: string;
  result: string;
  found: boolean;
  source: 'dict' | 'ai' | 'none';
}

export const BatchTranslation: React.FC = () => {
  const [input, setInput] = useState('');
  const [processed, setProcessed] = useState<BatchResult[]>([]);
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null);
  
  const { userTerms, settings, auth } = useStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  const handleProcess = async () => {
    if (!input.trim()) return;
    
    setIsProcessing(true);
    setProgressMsg(t('BATCH_PROCESSING'));
    setProcessed([]);

    const lines = input.split(/\n/).filter(l => l.trim());
    const tempResults: BatchResult[] = new Array(lines.length).fill(null);
    const missingIndices: number[] = [];

    // 1. First pass: Dictionary Match
    lines.forEach((line, idx) => {
      // Use stricter threshold for batch to avoid bad matches
      const matches = searchTerms(line, userTerms, systemTerms, settings.searchFuzzyThreshold > 0.3 ? 0.3 : settings.searchFuzzyThreshold);
      
      // We prioritize Exact or very high fuzzy matches for batch
      const bestMatch = matches.length > 0 ? matches[0] : null;
      
      if (bestMatch && (bestMatch.matchType.startsWith('exact') || bestMatch.matchType.startsWith('pinyin') || (bestMatch.score && bestMatch.score < 0.15))) {
         tempResults[idx] = {
           original: line,
           result: bestMatch.english_term,
           found: true,
           source: 'dict'
         };
      } else {
         missingIndices.push(idx);
         // Placeholder - If API Key exists, tell user AI is coming. If not, just "Not Found"
         tempResults[idx] = {
           original: line,
           result: auth?.apiKey ? t('WAITING_FOR_AI') : t('NOT_FOUND'),
           found: false,
           source: 'none'
         };
      }
    });

    // Update state with dictionary results first
    setProcessed([...tempResults]);

    // 2. Second pass: AI Translation for missing terms
    if (missingIndices.length > 0 && auth?.apiKey) {
       setProgressMsg(t('BATCH_WAIT_AI'));
       
       const missingTerms = missingIndices.map(i => lines[i]);
       
       // Construct a bulk prompt
       const prompt = `You are a professional medical translator. 
Translate the following list of medical terms line by line.
If the source is Chinese, translate to English.
If English, translate to Chinese.
Maintain the exact order.
Do not output numbering or bullet points.
Output EXACTLY one line of translation per input line.

Input List:
${missingTerms.join('\n')}`;

       try {
         const aiResponse = await getCompletion(auth, prompt);
         const aiLines = aiResponse.split(/\n/).map(l => l.trim()).filter(l => l);
         
         // Fill back into results
         missingIndices.forEach((originalIndex, i) => {
            if (i < aiLines.length) {
               tempResults[originalIndex] = {
                 original: lines[originalIndex],
                 result: aiLines[i],
                 found: true,
                 source: 'ai'
               };
            }
         });
         
         setProcessed([...tempResults]);
       } catch (err) {
         console.error("AI Batch Error", err);
         // Fallback is already set to "Not Found" / "none" or waiting status
         // We might want to revert the waiting status to error or not found if it failed
         missingIndices.forEach((originalIndex) => {
             if (tempResults[originalIndex].source === 'none' && tempResults[originalIndex].result === t('WAITING_FOR_AI')) {
                 tempResults[originalIndex].result = t('NOT_FOUND');
             }
         });
         setProcessed([...tempResults]);
       }
    }

    setIsProcessing(false);
    setProgressMsg('');
  };

  const handleExport = () => {
    if (processed.length === 0) return;

    // Prepare data for Excel
    const data = processed.map(item => ({
      [t('AST_SOURCE')]: item.original,     // "原文" / "Source"
      [t('AST_TARGET')]: item.result,       // "译文" / "Translation"
      [t('LBL_CATEGORY')]: item.source === 'dict' ? t('BATCH_SOURCE_DICT') : (item.source === 'ai' ? t('BATCH_SOURCE_AI') : '') // "来源" / "Source Type"
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Auto-adjust column width (heuristic)
    const maxWidth = processed.reduce((w, r) => Math.max(w, r.original.length, r.result.length), 10);
    const colWidth = Math.min(maxWidth + 5, 50); // Cap at 50 chars
    worksheet['!cols'] = [{ wch: colWidth }, { wch: colWidth }, { wch: 15 }];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Translations");

    // Generate filename
    const filename = `medical_batch_translations_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Write file
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="h-full flex flex-col relative">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">{t('BATCH_TITLE')}</h2>
      
      <div className="grid md:grid-cols-2 gap-6 flex-1 h-full min-h-[400px]">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-slate-500 mb-2">{t('LBL_INPUT')}</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 w-full p-4 rounded-2xl bg-white/50 border border-white/60 focus:border-blue-300 outline-none resize-none text-slate-700 font-mono text-sm leading-relaxed"
            placeholder={t('PLACEHOLDER_INPUT')}
          />
          <button 
            onClick={handleProcess}
            disabled={isProcessing || !input.trim()}
            className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {t('BTN_TRANSLATE_ALL')}
          </button>
          
          {isProcessing && (
            <p className="text-xs text-blue-600 text-center mt-2 animate-pulse">{progressMsg}</p>
          )}

          {!auth?.apiKey && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
               <AlertCircle className="w-4 h-4" />
               <span>AI API 未配置，仅支持本地词库匹配。</span>
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-500">{t('LBL_RESULTS')}</label>
            {processed.length > 0 && (
              <button onClick={handleExport} className="flex items-center gap-1 text-green-600 text-xs font-bold hover:underline">
                <Download className="w-3 h-3" /> {t('BTN_EXPORT')}
              </button>
            )}
          </div>
          <div className="flex-1 w-full p-4 rounded-2xl bg-white/80 border border-white/60 overflow-auto shadow-inner">
            {processed.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                {t('EMPTY_RESULTS')}
              </div>
            ) : (
              <div className="space-y-2">
                {processed.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedResult(item)}
                    className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/50 hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                       <span className="font-medium text-slate-700 truncate" title={item.original}>{item.original}</span>
                       <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                       <span className={`truncate font-medium ${item.found ? 'text-blue-700' : 'text-slate-400 italic'}`} title={item.result}>
                         {item.result}
                       </span>
                    </div>
                    
                    <div className="ml-3 shrink-0" title={item.source === 'dict' ? t('BATCH_SOURCE_DICT') : item.source === 'ai' ? t('BATCH_SOURCE_AI') : ''}>
                       {item.source === 'dict' && <Book className="w-4 h-4 text-emerald-500" />}
                       {item.source === 'ai' && <Sparkles className="w-4 h-4 text-violet-500" />}
                       {item.source === 'none' && <div className="w-4 h-4 rounded-full bg-slate-200"></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4" onClick={() => setSelectedResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-white/50 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {t('DETAIL_TITLE')}
                {selectedResult.source === 'dict' && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide border border-emerald-200">Dictionary</span>}
                {selectedResult.source === 'ai' && <span className="bg-violet-100 text-violet-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide border border-violet-200">AI Translate</span>}
              </h3>
              <button onClick={() => setSelectedResult(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{t('AST_SOURCE')}</label>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-slate-800 font-medium leading-relaxed break-words">
                  {selectedResult.original}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                   <label className="block text-xs font-bold text-slate-400 uppercase">{t('AST_TARGET')}</label>
                   <button 
                     onClick={() => copyToClipboard(selectedResult.result, t('TOAST_COPY_SUCCESS'), t('TOAST_COPY_FAIL'))}
                     className="text-blue-500 hover:text-blue-700 text-xs flex items-center gap-1 font-medium"
                   >
                     <Copy className="w-3 h-3" /> {t('BTN_COPY')}
                   </button>
                </div>
                <div className={`p-4 rounded-xl border leading-relaxed break-words ${
                  selectedResult.found 
                    ? 'bg-blue-50/50 border-blue-100 text-blue-900 font-serif text-lg' 
                    : 'bg-slate-50 border-slate-100 text-slate-400 italic'
                }`}>
                  {selectedResult.result}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50 rounded-b-2xl">
              <button 
                onClick={() => setSelectedResult(null)}
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
