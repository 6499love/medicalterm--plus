import { expect,it,vi } from 'vitest';
import { reviewLiteratureBlock,type ExpertReview } from '../services/literatureExpert';
import { getCompletion } from '../services/llm';
vi.mock('../services/llm',async original=>({...await original<typeof import('../services/llm')>(),getCompletion:vi.fn()}));
it('resumes revision with the literature credentials and restores protected links',async()=>{
  const config={provider:'glm' as const,apiKey:'synthetic'};
  const block={id:1,text:'See https://example.org/test',x:0,y:0,width:100,height:10,fontSize:10};
  const draft='见 https://example.org/test';
  let saved:ExpertReview|undefined;
  const request=vi.mocked(getCompletion).mockResolvedValueOnce('建议使用“参见”。').mockResolvedValueOnce('参见链接。');
  const run=()=>reviewLiteratureBlock(block,draft,config,[],saved,r=>{saved=r;},()=>{},()=>true);
  await expect(run()).rejects.toThrow('链接');
  expect(saved?.notes).toContain('参见');
  request.mockResolvedValueOnce('参见 ⟦LINK_0⟧。');
  expect(await run()).toBe('参见 https://example.org/test。');
  expect(request).toHaveBeenCalledTimes(3);
  for (const [actual,prompt] of request.mock.calls) {
    expect(actual).toEqual(config);
    expect(prompt).not.toContain('example.org');
  }
});
