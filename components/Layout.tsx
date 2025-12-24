import React from 'react';
import { Search, Book, Star, History as HistoryIcon, Settings as SettingsIcon, Layers, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import { PageRoute } from '../types';
import { useLanguageStore, useTranslation } from '../services/i18n';
import { useToastStore } from '../services/toast';

interface LayoutProps {
  activePage: PageRoute;
  onNavigate: (page: PageRoute) => void;
  children: React.ReactNode;
}

const ToastContainer = () => {
  const { message, type } = useToastStore();
  if (!message) return null;
  
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce duration-300 w-[90%] max-w-sm justify-center ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
    }`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
      <span className="font-medium text-sm truncate">{message}</span>
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({ activePage, onNavigate, children }) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const navItems: { id: PageRoute; label: string; icon: React.ReactNode }[] = [
    { id: 'translate', label: t('NAV_TRANSLATE'), icon: <Search className="w-5 h-5" /> },
    { id: 'assistant', label: t('NAV_ASSISTANT'), icon: <Wand2 className="w-5 h-5" /> },
    { id: 'dictionary', label: t('NAV_DICTIONARY'), icon: <Book className="w-5 h-5" /> },
    { id: 'batch', label: t('NAV_BATCH'), icon: <Layers className="w-5 h-5" /> },
    { id: 'favorites', label: t('NAV_SAVED'), icon: <Star className="w-5 h-5" /> },
    { id: 'history', label: t('NAV_HISTORY'), icon: <HistoryIcon className="w-5 h-5" /> },
    { id: 'settings', label: t('NAV_SETTINGS'), icon: <SettingsIcon className="w-5 h-5" /> },
  ];

  const LanguageToggle = () => (
    <div className="flex items-center bg-blue-100/50 p-1 rounded-lg border border-blue-100 shrink-0">
      <button
        onClick={() => setLanguage('zh-CN')}
        className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
          language === 'zh-CN' 
            ? 'bg-white text-blue-700 shadow-sm' 
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        中
      </button>
      <button
        onClick={() => setLanguage('en-US')}
        className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
          language === 'en-US' 
            ? 'bg-white text-blue-700 shadow-sm' 
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        EN
      </button>
    </div>
  );

  return (
    <div className="min-h-screen p-3 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 max-w-7xl mx-auto relative">
      <ToastContainer />
      
      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-lg border border-white/40 shadow-2xl rounded-2xl p-2 z-50 flex justify-between items-center overflow-x-auto no-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`p-3 rounded-xl transition-all duration-200 whitespace-nowrap shrink-0 ${
              activePage === item.id
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-slate-500 hover:bg-white/50'
            }`}
          >
            {item.icon}
          </button>
        ))}
      </nav>
      
      {/* Mobile Language Toggle (Absolute Top Right) */}
      <div className="md:hidden fixed top-3 right-3 z-50">
        <div className="bg-white/80 backdrop-blur-md p-1 rounded-xl shadow-lg border border-white/40">
           <LanguageToggle />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0">
        <div className="mb-8 pl-2 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-600">
              {t('APP_TITLE')}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">{t('APP_SUBTITLE')}</p>
          </div>
        </div>

        <div className="mb-6 px-2">
          <div className="flex items-center justify-between bg-white/40 p-3 rounded-xl border border-white/50">
            <span className="text-xs font-bold text-slate-500 uppercase">{t('LBL_LANGUAGE')}</span>
            <LanguageToggle />
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                activePage === item.id
                  ? 'bg-white/70 shadow-lg border border-white/50 text-blue-700 backdrop-blur-md'
                  : 'text-slate-600 hover:bg-white/30 hover:text-slate-900'
              }`}
            >
              <span className={`${activePage === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
          <p className="text-xs text-blue-900/60 leading-relaxed">
            {t('FOOTER_NOTE')}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-[calc(100vh-6rem)] md:min-h-[80vh] pb-24 md:pb-0 pt-12 md:pt-0">
         <div className="bg-white/40 backdrop-blur-xl border border-white/50 shadow-xl rounded-2xl md:rounded-3xl p-4 md:p-10 h-full overflow-auto flex flex-col">
           {children}
         </div>
      </main>
    </div>
  );
};