
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  type: 'success' | 'error';
  showToast: (message: string, type?: 'success' | 'error') => void;
  hideToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'success',
  showToast: (message, type = 'success') => {
    set({ message, type });
    setTimeout(() => {
      set({ message: null });
    }, 3000);
  },
  hideToast: () => set({ message: null }),
}));
