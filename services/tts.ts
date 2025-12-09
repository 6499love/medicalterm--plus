export const speakText = (text: string, lang: string = 'en-US') => {
  if (!('speechSynthesis' in window)) return;

  // Cancel any current speaking
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
};