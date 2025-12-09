
import React, { useEffect, useState, useRef } from 'react';
import { Languages, X } from 'lucide-react';
import { useTranslation } from '../services/i18n';

interface SelectionPopupProps {
  onTranslate: (text: string) => void;
}

export const SelectionPopup: React.FC<SelectionPopupProps> = ({ onTranslate }) => {
  const { t } = useTranslation();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length > 100) {
         setPosition(null);
         return;
      }

      const root = document.getElementById('root');
      if (root && selection.anchorNode && !root.contains(selection.anchorNode)) {
        setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (rect.width > 0 && rect.height > 0) {
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top
        });
        setText(selectedText);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
       if (popupRef.current && popupRef.current.contains(e.target as Node)) {
         return;
       }
       
       setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.toString().trim().length === 0) {
             setPosition(null);
          } else {
             handleSelection();
          }
       }, 10);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleMouseUp);
    };
  }, []);

  if (!position) return null;

  const handleTranslate = () => {
    onTranslate(text);
    setPosition(null);
    window.getSelection()?.removeAllRanges(); 
  };

  return (
    <div 
      ref={popupRef}
      className="fixed z-[9999] flex items-center justify-center -translate-x-1/2 -translate-y-full pb-2"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-slate-800 text-white rounded-lg shadow-xl p-1 flex items-center gap-1 animate-in fade-in zoom-in duration-200">
        <button 
          onClick={handleTranslate}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 rounded-md transition-colors text-xs font-medium whitespace-nowrap"
        >
          <Languages className="w-3.5 h-3.5" />
          {t('TOOLTIP_TRANSLATE')}
        </button>
        <div className="w-px h-4 bg-slate-600 mx-0.5"></div>
        <button 
          onClick={() => setPosition(null)}
          className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 mb-0.5 -z-10"></div>
    </div>
  );
};
