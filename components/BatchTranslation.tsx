import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms, searchTerms } from '../services/search';
import { Term } from '../types';
import { ArrowRight, Download, Loader2, Sparkles, Book, AlertCircle } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { getCompletion } from '../services/llm';
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
         // Placeholder
         tempResults[idx] = {
           original: line,
           result: t('NOT_FOUND'),
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
         // Fallback is already set to "Not Found" / "none"
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
    <div className="h-full flex flex-col">
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
                  <div key={idx} className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/50 hover:border-blue-200 transition-colors">
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                       <span className="font-medium text-slate-700 truncate" title={item.original}>{item.original}</span>
                       <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                       <span className={`truncate font-medium ${item.found ? 'text-blue-700' : 'text-red-400 italic'}`} title={item.result}>
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
    </div>
  );
};