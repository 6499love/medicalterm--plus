
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Translator } from './components/Translator';
import { BatchTranslation } from './components/BatchTranslation';
import { UserDictionary } from './components/UserDictionary';
import { TranslationAssistant } from './components/TranslationAssistant';
import { PageRoute, Term } from './types';
import { useStore } from './store';
import { Trash2, Volume2, Save, Key, User, Globe, Cpu, LogOut, ArrowRight, ExternalLink, Info, CheckCircle, HelpCircle } from 'lucide-react';
import { fetchSystemTerms } from './services/search';
import { speakText } from './services/tts';
import { useTranslation } from './services/i18n';
import { SelectionPopup } from './components/SelectionPopup';

const HistoryPage = () => {
  const { history, clearHistory } = useStore();
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t('HIST_TITLE')}</h2>
        {history.length > 0 && (
          <button onClick={clearHistory} className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors">
            {t('BTN_CLEAR_ALL')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {history.length === 0 ? <p className="text-slate-400">{t('EMPTY_HIST')}</p> : history.map(h => (
          <div key={h.id} className="flex justify-between items-center p-3 bg-white/40 rounded-lg border border-white/40">
            <div>
              <p className="font-medium text-slate-700">{h.query}</p>
              <p className="text-xs text-indigo-500">{h.resultTerm || t('NO_MATCH_TEXT')}</p>
            </div>
            <span className="text-[10px] text-slate-400">{new Date(h.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FavoritesPage: React.FC<{ onNavigate: (page: PageRoute) => void }> = ({ onNavigate }) => {
  const { favorites, userTerms, toggleFavorite, setNavigatedTermId } = useStore();
  const [systemTerms, setSys] = useState<Term[]>([]);
  const { t } = useTranslation();

  React.useEffect(() => { fetchSystemTerms().then(setSys); }, []);

  const allTerms = [...userTerms, ...systemTerms];
  const favTerms = allTerms.filter(t => favorites.includes(t.id));

  const handleTermClick = (termId: string) => {
    setNavigatedTermId(termId);
    onNavigate('dictionary');
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('SAVED_TITLE')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {favTerms.length === 0 ? <p className="text-slate-400 col-span-2 text-center py-10">{t('EMPTY_SAVED')}</p> : favTerms.map(term => (
          <div 
            key={term.id} 
            onClick={() => handleTermClick(term.id)}
            className="p-4 bg-white/70 rounded-xl border border-indigo-100 shadow-sm relative group cursor-pointer hover:bg-white transition-all"
          >
             <div className="flex justify-between items-start">
               <div>
                 <h4 className="font-bold text-lg text-slate-800 group-hover:text-indigo-700 transition-colors">{term.chinese_term}</h4>
                 <p className="text-indigo-600 font-medium">{term.english_term}</p>
               </div>
               <div className="flex gap-1">
                 <button 
                  onClick={(e) => { e.stopPropagation(); speakText(term.english_term); }} 
                  className="p-1.5 text-slate-400 hover:text-indigo-600 z-10"
                 >
                   <Volume2 className="w-4 h-4" />
                 </button>
                 <button 
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(term.id); }} 
                  className="p-1.5 text-amber-400 hover:text-slate-300 z-10"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
             </div>
             {term.pinyin_full && <p className="text-xs text-slate-400 mt-2 font-mono">{term.pinyin_full}</p>}
             
             <ArrowRight className="w-4 h-4 text-indigo-300 absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const { settings, updateSettings, auth, setAuth, logout } = useStore();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    provider: auth?.provider || 'gemini',
    apiKey: auth?.apiKey || '',
    baseUrl: auth?.baseUrl || '',
    model: auth?.model || '',
    userName: auth?.userName || ''
  });

  useEffect(() => {
     if (auth) {
         setForm({
            provider: auth.provider,
            apiKey: auth.apiKey,
            baseUrl: auth.baseUrl || '',
            model: auth.model || '',
            userName: auth.userName
         });
     }
  }, [auth]);

  const handleAuthSave = () => {
    if (!form.apiKey) return;
    setAuth({
      provider: form.provider as any,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl,
      model: form.model,
      userName: form.userName || 'User'
    });
  };

  const handleLogout = () => {
    logout();
    setForm({ provider: 'gemini', apiKey: '', baseUrl: '', model: '', userName: '' });
  };
  
  const getHintText = () => {
     if (form.provider === 'gemini') return t('HINT_GEMINI_KEY');
     if (form.provider === 'glm') return t('HINT_GLM_KEY');
     return t('HINT_OPENAI_KEY');
  };

  const getKeyUrl = () => {
    if (form.provider === 'gemini') return 'https://aistudio.google.com/app/apikey';
    if (form.provider === 'glm') return 'https://open.bigmodel.cn/';
    return 'https://platform.openai.com/api-keys';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('SETTINGS_TITLE')}</h2>
        <p className="text-slate-500 text-sm bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-100 flex gap-2">
           <Info className="w-4 h-4 shrink-0 mt-0.5" />
           {t('SET_NOTE')}
        </p>
      </div>

      <div className="bg-white/60 p-6 rounded-2xl border border-white/60 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-indigo-500" />
          {t('SET_API_TITLE')}
        </h3>

        {!auth ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('SET_PROVIDER')}</label>
              <div className="grid grid-cols-3 gap-2">
                 {['gemini', 'openai-compatible', 'glm'].map((p) => (
                   <button 
                     key={p}
                     onClick={() => setForm({ ...form, provider: p as any })}
                     className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                       form.provider === p 
                       ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                       : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                     }`}
                   >
                     {p === 'gemini' ? t('PROVIDER_GEMINI') : p === 'glm' ? t('PROVIDER_GLM') : t('PROVIDER_OPENAI_LOCAL')}
                   </button>
                 ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center flex-wrap gap-2">
                <span>{t('SET_API_KEY')}</span>
                
                <div className="group relative">
                   <HelpCircle className="w-4 h-4 text-slate-400 hover:text-indigo-500 cursor-help" />
                   <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none whitespace-pre-wrap font-normal leading-relaxed">
                     {t('HELP_GET_KEY')}
                     <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                   </div>
                </div>

                <a href={getKeyUrl()} target="_blank" rel="noreferrer" className="ml-auto text-xs text-indigo-500 hover:underline inline-flex items-center gap-1">
                  {t('BTN_GET_KEY')} <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all"
                  placeholder="sk-..."
                />
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs text-slate-400 mt-1">{getHintText()}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {form.provider !== 'gemini' && (
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">{t('SET_MODEL')}</label>
                   <div className="relative">
                      <input
                        type="text"
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none"
                        placeholder="gpt-4, claude-3, etc."
                      />
                      <Cpu className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                   </div>
                </div>
              )}
               <div className={form.provider === 'gemini' ? 'col-span-2' : ''}>
                   <label className="block text-sm font-medium text-slate-700 mb-1">{t('SET_USERNAME')}</label>
                   <div className="relative">
                      <input
                        type="text"
                        value={form.userName}
                        onChange={(e) => setForm({ ...form, userName: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none"
                        placeholder={t('PH_USERNAME')}
                      />
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                   </div>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <input
                type="checkbox"
                id="rememberKey"
                checked={settings.rememberApiKey}
                onChange={(e) => updateSettings({ rememberApiKey: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="rememberKey" className="flex-1 cursor-pointer">
                <div className="text-sm font-medium text-slate-700">{t('SET_REMEMBER_KEY')}</div>
                <div className="text-xs text-slate-500">{t('SET_REMEMBER_KEY_DESC')}</div>
              </label>
            </div>

            <button 
              onClick={handleAuthSave}
              disabled={!form.apiKey}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
            >
              <Save className="w-4 h-4" /> {t('BTN_SAVE_CONFIG')}
            </button>
            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <Key className="w-3 h-3" /> {t('HINT_LOCAL_STORAGE')}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-emerald-800">{t('STATUS_CONNECTED')}</p>
                <p className="text-xs text-emerald-600">{auth.provider.toUpperCase()} • {auth.userName}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 bg-white text-rose-500 border border-rose-100 hover:bg-rose-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> {t('BTN_LOGOUT')}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="bg-white/60 p-5 rounded-2xl border border-white/60">
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('SET_FUZZY')}</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="0" max="0.6" step="0.1"
                value={settings.searchFuzzyThreshold}
                onChange={(e) => updateSettings({ searchFuzzyThreshold: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <span className="font-mono text-sm font-bold bg-white px-2 py-1 rounded border border-slate-200 w-12 text-center">
                {settings.searchFuzzyThreshold}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">{t('SET_FUZZY_DESC')}</p>
         </div>

         <div className="bg-white/60 p-5 rounded-2xl border border-white/60 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">{t('SET_AUTOPLAY')}</div>
              <div className="text-xs text-slate-400">{t('SET_AUTOPLAY_DESC')}</div>
            </div>
            <input 
              type="checkbox"
              checked={settings.autoPlayAudio}
              onChange={(e) => updateSettings({ autoPlayAudio: e.target.checked })}
              className="w-5 h-5"
            />
         </div>
         
         <div className="bg-white/60 p-5 rounded-2xl border border-white/60 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">{t('SET_AUTOCOPY')}</div>
              <div className="text-xs text-slate-400">{t('SET_AUTOCOPY_DESC')}</div>
            </div>
            <input 
              type="checkbox"
              checked={settings.autoCopy}
              onChange={(e) => updateSettings({ autoCopy: e.target.checked })}
              className="w-5 h-5"
            />
         </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activePage, setActivePage] = useState<PageRoute>('translate');
  const [popupQuery, setPopupQuery] = useState<string | null>(null);

  const handleSelectionTranslate = (text: string) => {
    setPopupQuery(text);
    setActivePage('translate');
  };

  const handlePopupConsumed = () => {
    setPopupQuery(null);
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {activePage === 'translate' && <Translator initialQuery={popupQuery} onQueryConsumed={handlePopupConsumed} />}
      {activePage === 'assistant' && <TranslationAssistant onNavigate={setActivePage} />}
      {activePage === 'batch' && <BatchTranslation />}
      {activePage === 'dictionary' && <UserDictionary />}
      {activePage === 'favorites' && <FavoritesPage onNavigate={setActivePage} />}
      {activePage === 'history' && <HistoryPage />}
      {activePage === 'settings' && <SettingsPage />}
      
      <SelectionPopup onTranslate={handleSelectionTranslate} />
    </Layout>
  );
}
