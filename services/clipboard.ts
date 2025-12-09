
import { useToastStore } from './toast';

export const copyToClipboard = async (text: string, successMsg: string, errorMsg: string) => {
  try {
    await navigator.clipboard.writeText(text);
    useToastStore.getState().showToast(successMsg, 'success');
  } catch (err) {
    console.error('Copy failed', err);
    useToastStore.getState().showToast(errorMsg, 'error');
  }
};
