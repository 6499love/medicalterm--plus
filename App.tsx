
import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Translator } from './components/Translator';
import { BatchTranslation } from './components/BatchTranslation';
import { UserDictionary } from './components/UserDictionary';
import { TranslationAssistant } from './components/TranslationAssistant';
import { PageRoute, Term } from './types';
import { useStore } from './store';
import { Trash2, Volume2, Save, Key, User, Globe, Cpu, LogOut } from 'lucide-react';
import { fetchSystemTerms } from './services/search';
import { speakText } from './services/tts';
import { useTranslation } from './services/i18n';
import { SelectionPopup } from './components/SelectionPopup';

// Simple components for History/Favorites/Settings inside App to save file count
// In a larger app, these would be separate files.

const HistoryPage = () => {
  const { history, clearHistory, addToHistory } = useStore();
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

const FavoritesPage = () => {
  const { favorites, userTerms, toggleFavorite } = useStore();
  const [systemTerms, setSys] = useState<Term[]>([]);
  const { t } = useTranslation();

  React.useEffect(() => { fetchSystemTerms().then(setSys); }, []);

  const allTerms = [...userTerms, ...systemTerms];
  const favTerms = allTerms.filter(t => favorites.includes(t.id));

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('SAVED_TITLE')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {favTerms.length === 0 ? <p className="text-slate-400 col-span-2 text-center py-10">{t('EMPTY_SAVED')}</p> : favTerms.map(term => (
          <div key={term.id} className="p-4 bg-white/70 rounded-xl border border-indigo-100 shadow-sm relative group">
             <div className="flex justify-between">
               <div>
                 <h4 className="font-bold text-lg text-slate-800">{term.chinese_term}</h4>
                 <p className="text-indigo-600 font-medium">{term.english_term}</p>
               </div>
               <div className="flex gap-1">
                 <button onClick={() => speakText(term.english_term)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Volume2 className="w-4 h-4" /></button>
                 <button onClick={() => toggleFavorite(term.id)} className="p-1.5 text-amber-400 hover:text-slate-300"><Trash2 className="w-4 h-4" /></button>
               </div>
             </div>
             {term.pinyin_full && <p className="text-xs text-slate-400 mt-2 font-mono">{term.pinyin_full}</p>}
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
  
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('SETTINGS_TITLE')}</h2>
      
      <div className="space-y-6">

        {/* Auth Section */}
        <div className="bg-white/60 p-5 rounded-2xl border border-white/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800">API Configuration</h3>
          </div>
          
          {!auth ? (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Provider</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setForm({ ...form, provider: 'gemini' })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.provider === 'gemini' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >Gemini</button>
                  <button 
                    onClick={() => setForm({ ...form, provider: 'openai-compatible' })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.provider === 'openai-compatible' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >OpenAI Compatible</button>
                </div>

                {/* API Key Guidance */}
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                  {form.provider === 'gemini' ? (
                    <div className="flex gap-2">
                      <div className="min-w-[3px] w-[3px] bg-indigo-400 rounded-full my-1"></div>
                      <p>
                        Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-medium hover:text-indigo-800">Google AI Studio</a>.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                       <div className="min-w-[3px] w-[3px] bg-indigo-400 rounded-full my-1"></div>
                       <p>
                         Use a key from providers like OpenRouter or local LLMs. Ensure the provider supports browser-based requests (CORS).
                       </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">API Key</label>
                <input 
                  type="password"
                  value={form.apiKey}
                  onChange={e => setForm({ ...form, apiKey: e.target.value })}
                  className="w-full p-2 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono"
                  placeholder="sk-..."
                />
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Keys are stored locally in your browser and never sent to our servers.
                </p>
              </div>

              {form.provider === 'openai-compatible' && (
                <div>
                   <label className="block text-xs font-medium text-slate-500 mb-1">Base URL (Optional)</label>
                   <div className="relative">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        value={form.baseUrl}
                        onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                        className="w-full pl-9 p-2 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono"
                        placeholder="https://api.openai.com/v1"
                      />
                   </div>
                </div>
              )}

              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Model (Optional)</label>
                 <div className="relative">
                    <Cpu className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input 
                      value={form.model}
                      onChange={e => setForm({ ...form, model: e.target.value })}
                      className="w-full pl-9 p-2 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm font-mono"
                      placeholder={form.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-3.5-turbo'}
                    />
                 </div>
              </div>
              
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Username (Optional)</label>
                 <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input 
                      value={form.userName}
                      onChange={e => setForm({ ...form, userName: e.target.value })}
                      className="w-full pl-9 p-2 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 outline-none text-sm"
                      placeholder="Doctor"
                    />
                 </div>
              </div>

              <button 
                onClick={handleAuthSave}
                disabled={!form.apiKey}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-medium shadow-md transition-all flex justify-center items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Configuration
              </button>
            </div>
          ) : (
            <div className="flex justify-between items-center bg-green-50/50 p-4 rounded-xl border border-green-100">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">
                   {auth.userName.charAt(0).toUpperCase()}
                 </div>
                 <div>
                   <p className="font-bold text-slate-700">{auth.userName}</p>
                   <p className="text-xs text-slate-500 flex items-center gap-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                     {auth.provider === 'gemini' ? 'Gemini' : 'OpenAI'} Connected
                   </p>
                 </div>
               </div>
               <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                 <LogOut className="w-5 h-5" />
               </button>
            </div>
          )}
        </div>

        {/* Existing Settings */}
        <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/50">
          <div>
            <h4 className="font-medium text-slate-800">{t('SET_FUZZY')}</h4>
            <p className="text-xs text-slate-500">{t('SET_FUZZY_DESC')}</p>
          </div>
          <div className="w-32">
             <input 
               type="range" 
               min="0.0" max="0.6" step="0.1"
               value={settings.searchFuzzyThreshold}
               onChange={(e) => updateSettings({ searchFuzzyThreshold: parseFloat(e.target.value) })}
               className="w-full accent-indigo-600"
             />
             <div className="text-center text-xs font-mono mt-1">{settings.searchFuzzyThreshold}</div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/50">
          <div>
            <h4 className="font-medium text-slate-800">{t('SET_AUTOPLAY')}</h4>
            <p className="text-xs text-slate-500">{t('SET_AUTOPLAY_DESC')}</p>
          </div>
          <input 
            type="checkbox"
            checked={settings.autoPlayAudio}
            onChange={(e) => updateSettings({ autoPlayAudio: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 rounded"
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/50">
          <div>
            <h4 className="font-medium text-slate-800">{t('SET_AUTOCOPY')}</h4>
            <p className="text-xs text-slate-500">{t('SET_AUTOCOPY_DESC')}</p>
          </div>
          <input 
            type="checkbox"
            checked={settings.autoCopy}
            onChange={(e) => updateSettings({ autoCopy: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 rounded"
          />
        </div>
        
        <div className="p-4 bg-indigo-50 rounded-xl text-xs text-indigo-800 leading-relaxed">
          <strong>{t('SET_NOTE')}</strong>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageRoute>('translate');
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  const handleSelectionTranslate = (text: string) => {
    setPendingQuery(text);
    setActivePage('translate');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'translate': return <Translator initialQuery={pendingQuery} onQueryConsumed={() => setPendingQuery(null)} />;
      case 'batch': return <BatchTranslation />;
      case 'assistant': return <TranslationAssistant />;
      case 'dictionary': return <UserDictionary />;
      case 'history': return <HistoryPage />;
      case 'favorites': return <FavoritesPage />;
      case 'settings': return <SettingsPage />;
      default: return <Translator />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      <SelectionPopup onTranslate={handleSelectionTranslate} />
      {renderPage()}
    </Layout>
  );
};

export default App;
