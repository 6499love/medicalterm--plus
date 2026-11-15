import { describe,it,expect,vi,afterEach } from 'vitest';
import { browserConnectionError,checkBrowserConnection,literatureModelConfig,numbersMatch,overlapsNative,preserveSource,resultCounts } from '../services/browserLiterature';
import { getCompletion } from '../services/llm';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('browser literature safety',()=>{
  it('does not count retained and review entries as translated',()=>{
    expect(resultCounts({0:'【有意保留原文】13',1:'【待核对：数字不符】text',2:'灰区'})).toEqual({translated:1,retained:1,review:1});
  });
  it('fails the direct connection check without proxy fallback or paper text',async()=>{
    const request=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch',request);
    await expect(checkBrowserConnection({provider:'glm',apiKey:'fake-only',baseUrl:'https://example.test/v4'})).rejects.toThrow('Failed to fetch');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('https://example.test/v4/chat/completions');
    expect(JSON.parse(request.mock.calls[0][1].body).messages).toEqual([{role:'user',content:'Reply with OK only.'}]);
  });
  it('keeps authentication failures separate from network or CORS errors',()=>{
    const config={provider:'glm' as const,apiKey:'fake-only'};
    expect(browserConnectionError(new Error('GLM API Error (401)'),config)).toContain('401');
    expect(browserConnectionError(new Error('Failed to fetch'),config)).toContain('智谱转发接口');
    expect(browserConnectionError(new Error('Failed to fetch'),{...config,baseUrl:'https://example.test'})).toContain('网页直连失败');
  });
  it('uses the existing site route for the default GLM connection check and translation',async()=>{
    const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'ok'}}]})});
    vi.stubGlobal('fetch',request);
    const config={provider:'glm' as const,apiKey:'fake-only'};
    await checkBrowserConnection(config);
    await getCompletion(literatureModelConfig({...config,baseUrl:'https://open.bigmodel.cn/api/paas/v4/'}),'test');
    expect(request.mock.calls.map(([url])=>url)).toEqual(['/api/glm/chat/completions','/api/glm/chat/completions']);
  });
  it.each([
    ['1113', '账号欠费'], ['1308', '使用额度已达上限'], ['1311', '未开通所选模型'],
  ])('shows the GLM reason %s without repeating a blocked request', async (code, reason) => {
    const request=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({error:{code,message:'private detail'}}),{status:429}));
    vi.stubGlobal('fetch',request);
    const config={provider:'glm' as const,apiKey:'fake-only'};
    const failure=await checkBrowserConnection(config).catch(error=>error);
    const message=browserConnectionError(failure,config);
    expect(message).toContain(reason);
    expect(message).toContain(code);
    expect(message).not.toContain('private detail');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('preserves the model busy reason after delayed retries',async()=>{
    vi.useFakeTimers();
    const request=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({error:{code:'1305'}}),{status:429}));
    vi.stubGlobal('fetch',request);
    const config={provider:'glm' as const,apiKey:'fake-only'};
    const failure=checkBrowserConnection(config).catch(error=>error);
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(4);
    expect(browserConnectionError(await failure,config)).toContain('模型当前繁忙');
  });
  it('rejects changed or dropped numeric values while allowing date order',()=>{
    expect(numbersMatch('2×2 13 9','2-7 13 9')).toBe(false);
    expect(numbersMatch('13 9','13')).toBe(false);
    expect(numbersMatch('-5','5')).toBe(false);
    expect(numbersMatch('45°','45℃')).toBe(false);
    expect(numbersMatch('14 January 2015','2015年1月14日')).toBe(false);
    expect(numbersMatch('2023 11 24','24 11 2023')).toBe(true);
  });
  it('keeps pure numbers and recognizable references',()=>{
    expect(preserveSource('13')).toBe(true);
    expect(preserveSource('7. Levin MA, McCormick PJ, Lin HM. Title')).toBe(true);
    expect(preserveSource('GREY ZONE')).toBe(false);
  });
  it('filters OCR duplicates but keeps labels outside native text',()=>{
    const native={id:0,text:'body',x:10,y:10,width:100,height:20,fontSize:10};
    expect(overlapsNative({...native,id:1,x:12},[native])).toBe(true);
    expect(overlapsNative({...native,id:1,y:100},[native])).toBe(false);
  });
});
