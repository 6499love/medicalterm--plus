import { reflectOnTranslation, improveTranslation } from './textProcessing';
import { protectPdfLinks } from './literatureLinks';
import { LiteratureResponseError, type PdfBlock } from './literature';
import { reviewBrowserTranslation } from './browserLiterature';
import type { LLMConfig } from './llm';
import type { Term } from '../types';

export interface ExpertReview { draft:string; notes:string; final?:string }

export async function reviewLiteratureBlock(
  block:PdfBlock, draft:string, config:LLMConfig, terms:Term[], saved:ExpertReview|undefined,
  onUpdate:(review:ExpertReview)=>void, progress:(stage:string)=>void, current:()=>boolean,
) {
  const source=protectPdfLinks(block.text);
  const maskedDraft=source.maskKnown(draft);
  const review=saved?.draft===draft ? saved : {draft,notes:''};
  if (!current()) return;
  if (!review.notes) {
    progress('专家审校');
    const notes=await reflectOnTranslation(source.text,maskedDraft,'English','Simplified Chinese',config);
    if (!current()) return;
    if (!notes.trim()) throw new LiteratureResponseError('审校意见为空，可继续审校已有初稿。');
    review.notes=notes;
    onUpdate({...review});
  }
  progress('修订定稿');
  const english=block.text.toLowerCase();
  const glossary=terms.filter(t=>t.english_term?.length>1 && english.includes(t.english_term.toLowerCase()))
    .slice(0,80).map(t=>({id:t.id,source:t.english_term,target:t.chinese_term}));
  const revised=await improveTranslation(source.text,maskedDraft,review.notes+'\n逐字保留原文中的 ⟦LINK_n⟧ 标记。','English','Simplified Chinese',config,glossary);
  if (!current()) return;
  const restored=source.restore(revised.trim());
  if (!restored || !/\p{Script=Han}/u.test(restored))
    throw new LiteratureResponseError('专家定稿未返回完整中文或链接。初稿及审校意见已保留，可继续定稿。');
  const final=reviewBrowserTranslation(block.text,restored);
  onUpdate({...review,final});
  return final;
}
