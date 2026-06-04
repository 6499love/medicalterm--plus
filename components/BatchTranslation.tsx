
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms, searchTerms } from '../services/search';
import { Term } from '../types';
import { ArrowRight, Download, Loader2, Sparkles, Book, AlertCircle, X, Copy, FileSpreadsheet, HelpCircle, Image as ImageIcon, Camera, UploadCloud, Check } from 'lucide-react';
import { useTranslation } from '../services/i18n';
import { getCompletion } from '../services/llm';
import { copyToClipboard } from '../services/clipboard';
import { useToastStore } from '../services/toast';
import * as XLSX from 'xlsx';
import { getPaddleOcr, fileToImageData } from '../services/ocr';

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
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null);
  
  // OCR specific states
  const [showOcrPanel, setShowOcrPanel] = useState(false);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrTextResult, setOcrTextResult] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { userTerms, settings, auth } = useStore();
  const { t } = useTranslation();
  const { showToast } = useToastStore();

  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Only process global paste if OCR panel is open
      if (!showOcrPanel) return;
      
      // If user is pasting text into the OCR editing textarea, let them
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && activeEl.tagName === 'TEXTAREA' && activeEl.getAttribute('placeholder') === t('OCR_EDIT_HINT')) {
        // However, if they paste an image, we still want to intercept it
        const hasText = e.clipboardData?.types.includes('text/plain');
        if (hasText) return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            await processImageOCR(file);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [showOcrPanel, t]);

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

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to array of arrays
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        // Extract first column and filter empty values
        const content = jsonData
          .map(row => row[0])
          .filter(val => val !== undefined && val !== null && String(val).trim() !== '')
          .map(val => String(val).trim())
          .join('\n');
          
        if (content) {
          setInput(prev => prev ? prev + '\n' + content : content);
          showToast(t('TOAST_IMPORT_EXCEL_SUCCESS', { count: content.split('\n').length }), 'success');
        }
      } catch (err) {
        console.error('Excel Import Error:', err);
        showToast(t('TOAST_IMPORT_EXCEL_FAIL'), 'error');
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const processImageOCR = async (file: File) => {
    // Show preview and open panel
    const previewUrl = URL.createObjectURL(file);
    setOcrPreviewUrl(previewUrl);
    setOcrTextResult('');
    setShowOcrPanel(true);
    
    setIsOcrProcessing(true);
    showToast(t('TOAST_OCR_PROCESSING'), 'info');

    try {
      const imgData = await fileToImageData(file);
      const ocr = await getPaddleOcr();
      
      const rawResult = await ocr.recognize(imgData);
      const result = ocr.processRecognition(rawResult, { lineMergeThresholdRatio: 0.8 });

      const text = result.text;
      const lines = text.split('\n')
        .map(l => {
          let cleaned = l.replace(/\s+/g, ' ').trim();
          while (/([^\x00-\x7F])\s+([^\x00-\x7F])/.test(cleaned)) {
            cleaned = cleaned.replace(/([^\x00-\x7F])\s+([^\x00-\x7F])/g, '$1$2');
          }
          return cleaned;
        })
        .filter(l => l !== '');

      if (lines.length > 0) {
        setOcrTextResult(lines.join('\n'));
        showToast(t('TOAST_OCR_SUCCESS', { count: lines.length }), 'success');
      } else {
        showToast(t('TOAST_OCR_FAIL'), 'error');
      }
    } catch (error) {
      console.error('OCR Error:', error);
      showToast(t('TOAST_OCR_FAIL'), 'error');
    } finally {
      setIsOcrProcessing(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleImportImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageOCR(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          await processImageOCR(file);
        }
        break;
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processImageOCR(file);
    }
  };

  const confirmOcrResult = () => {
    if (ocrTextResult.trim()) {
      setInput(prev => prev ? prev + '\n' + ocrTextResult : ocrTextResult);
    }
    closeOcrPanel();
  };

  const closeOcrPanel = () => {
    setShowOcrPanel(false);
    setOcrPreviewUrl(null);
    setOcrTextResult('');
  };

  return (
    <div className="h-full flex flex-col relative">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">{t('BATCH_TITLE')}</h2>
      
      <div className="grid md:grid-cols-2 gap-6 flex-1 h-full min-h-[400px]">
        <div className="flex flex-col">
           <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-500">{t('LBL_INPUT')}</label>
            <div className="flex items-center gap-2">
               <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImportExcel} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
               />
               <input 
                  type="file" 
                  ref={imageInputRef} 
                  onChange={handleImportImage} 
                  accept="image/png, image/jpeg, image/webp" 
                  className="hidden" 
               />
               <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowOcrPanel(!showOcrPanel)}
                    className={`flex items-center gap-1 text-xs font-bold transition-colors ${showOcrPanel ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}
                  >
                    <Camera className="w-3 h-3" />
                    {t('OCR_TITLE')}
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-blue-600 text-xs font-bold hover:underline"
                  >
                    <FileSpreadsheet className="w-3 h-3" /> {t('BTN_IMPORT_EXCEL')}
                  </button>
                  
                  {/* Format Hint Tooltip */}
                  <div className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-blue-500 cursor-help transition-colors" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
                       {t('IMPORT_EXCEL_HINT')}
                       <div className="absolute top-full right-1 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {showOcrPanel && (
            <div 
              className="mb-4 relative rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 transition-all animate-in slide-in-from-top-2 duration-200"
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              <button 
                onClick={closeOcrPanel} 
                className="absolute top-2 right-2 p-1 text-blue-400 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {ocrPreviewUrl || isOcrProcessing ? (
                <div className="flex flex-col gap-3">
                   <div className="flex gap-4 items-stretch h-32">
                     <div className="w-32 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-black/5 shadow-inner flex items-center justify-center p-1 relative">
                       {ocrPreviewUrl ? <img src={ocrPreviewUrl} className="max-w-full max-h-full object-contain rounded-md" alt="OCR Preview" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                     </div>
                     <div className="flex-1 min-w-0 flex flex-col relative h-full">
                       {isOcrProcessing && (
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-lg border border-transparent">
                            <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                            <span className="text-xs font-bold text-blue-600">{t('TOAST_OCR_PROCESSING')}</span>
                          </div>
                       )}
                       <textarea 
                         value={ocrTextResult}
                         onChange={e => setOcrTextResult(e.target.value)}
                         placeholder={t('OCR_EDIT_HINT')}
                         className="flex-1 w-full h-full p-3 text-sm text-slate-700 bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all shadow-sm"
                       />
                     </div>
                   </div>
                   <div className="flex justify-end pt-2 border-t border-blue-200/50 mt-1">
                     <button
                       onClick={confirmOcrResult}
                       disabled={!ocrTextResult.trim() || isOcrProcessing}
                       className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors shadow-sm hover:shadow-md"
                     >
                       <Check className="w-4 h-4" />
                       {t('OCR_BTN_CONFIRM')}
                     </button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                    <UploadCloud className="w-5 h-5 text-blue-500" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 mb-1">{t('OCR_DRAG_HINT')}</h4>
                  <p className="text-xs text-slate-500 mb-4">{t('OCR_PASTE_HINT')}</p>
                  
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="px-5 py-2.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {t('OCR_BTN_UPLOAD')}
                  </button>
                  <p className="text-[10px] text-slate-400 mt-3">{t('OCR_FORMATS')}</p>
                </div>
              )}
            </div>
          )}

          <div className="relative flex-1 flex flex-col group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              className={`flex-1 w-full p-4 rounded-2xl bg-white/50 border outline-none resize-none text-slate-700 font-mono text-sm leading-relaxed transition-colors border-white/60 focus:border-blue-300`}
              placeholder={t('PLACEHOLDER_INPUT')}
            />
          </div>
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
