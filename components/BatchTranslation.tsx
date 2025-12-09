import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { fetchSystemTerms, searchTerms } from '../services/search';
import { Term } from '../types';
import { ArrowRight, Download } from 'lucide-react';
import { useTranslation } from '../services/i18n';

export const BatchTranslation: React.FC = () => {
  const [input, setInput] = useState('');
  const [processed, setProcessed] = useState<{original: string, result: string, found: boolean}[]>([]);
  const [systemTerms, setSystemTerms] = useState<Term[]>([]);
  const { userTerms, settings } = useStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetchSystemTerms().then(setSystemTerms);
  }, []);

  const handleProcess = () => {
    const lines = input.split(/\n/).filter(l => l.trim());
    const results = lines.map(line => {
      const matches = searchTerms(line, userTerms, systemTerms, settings.searchFuzzyThreshold);
      return {
        original: line,
        result: matches.length > 0 ? matches[0].english_term : t('NOT_FOUND'),
        found: matches.length > 0
      };
    });
    setProcessed(results);
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Original,Translation\n"
      + processed.map(e => `${e.original},${e.result}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "medical_translations.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            className="flex-1 w-full p-4 rounded-2xl bg-white/50 border border-white/60 focus:border-indigo-300 outline-none resize-none text-slate-700"
            placeholder={t('PLACEHOLDER_INPUT')}
          />
          <button 
            onClick={handleProcess}
            className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all"
          >
            {t('BTN_TRANSLATE_ALL')}
          </button>
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-500">{t('LBL_RESULTS')}</label>
            {processed.length > 0 && (
              <button onClick={handleExport} className="flex items-center gap-1 text-indigo-600 text-xs font-bold hover:underline">
                <Download className="w-3 h-3" /> {t('BTN_EXPORT')}
              </button>
            )}
          </div>
          <div className="flex-1 w-full p-4 rounded-2xl bg-white/80 border border-white/60 overflow-auto">
            {processed.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                {t('EMPTY_RESULTS')}
              </div>
            ) : (
              <div className="space-y-2">
                {processed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 border-b border-slate-100 last:border-0">
                    <span className="font-medium text-slate-700">{item.original}</span>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                    <span className={`${item.found ? 'text-indigo-600' : 'text-red-400 italic'}`}>
                      {item.result}
                    </span>
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
