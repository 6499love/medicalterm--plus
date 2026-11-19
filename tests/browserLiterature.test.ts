import { describe,it,expect,vi,afterEach } from 'vitest';
import { browserConnectionError,checkBrowserConnection,isBrowserPageProcessed,literatureModelConfig,numbersMatch,overlapsNative,preserveSource,resultCounts } from '../services/browserLiterature';
import { getCompletion } from '../services/llm';
import { translatePublicationLabel, type PdfBlock } from '../services/literature';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('browser literature safety',()=>{
  it('reopens processing when OCR is enabled after translating only the native text',()=>{
    const page={blocks:[{id:0,text:'Native text',x:0,y:0,width:100,height:20,fontSize:10}]};
    const translated={0:'已翻译的正文'};
    expect(isBrowserPageProcessed(page,translated,false)).toBe(true);
    expect(isBrowserPageProcessed(page,translated,true)).toBe(false);
    expect(isBrowserPageProcessed({...page,ocrDone:true},translated,true)).toBe(true);
    expect(isBrowserPageProcessed({...page,ocrDone:true},{},true)).toBe(false);
    expect(isBrowserPageProcessed(page,undefined,false)).toBe(false);
  });
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
  it.each([400,401,403,500])('does not turn a GLM HTTP %s failure into a quota error because of the proxy message',async status=>{
    vi.useFakeTimers();
    const request=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({error:{message:'GLM rejected the request. Check credentials, model permissions or quota.'}}),{status}));
    vi.stubGlobal('fetch',request);
    const config={provider:'glm' as const,apiKey:'fake-only'};
    const failure=checkBrowserConnection(config).catch(error=>error);
    await vi.runAllTimersAsync();
    const message=browserConnectionError(await failure,config);
    expect(message).toContain(String(status));
    expect(message).not.toContain('模型调用达到限制');
    expect(request).toHaveBeenCalledTimes(1);
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
  it('shows the quota reason for a custom GLM endpoint without retrying or switching routes',async()=>{
    vi.useFakeTimers();
    const request=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({error:{code:1308,message:'private detail'}}),{status:429}));
    vi.stubGlobal('fetch',request);
    const config={provider:'glm' as const,apiKey:'fake-only',baseUrl:'https://example.test/v4'};
    const failure=checkBrowserConnection(config).catch(error=>error);
    await vi.runAllTimersAsync();
    const message=browserConnectionError(await failure,config);
    expect(message).toContain('使用额度已达上限');
    expect(message).toContain('1308');
    expect(message).not.toContain('private detail');
    expect(request.mock.calls.map(([url])=>url)).toEqual(['https://example.test/v4/chat/completions']);
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
  it('translates publication labels without changing their values',()=>{
    const block: PdfBlock={id:0,text:'',x:0,y:0,width:100,height:10,fontSize:8,kind:'metadata'};
    const examples=[
      ['Open Access','开放获取'],
      ['References','参考文献'],
      ['Page 2 of 3','第2页，共3页'],
      ['*Correspondence: A. Smith a@example.test','*通讯作者：A. Smith a@example.test'],
      ['This comment refers to the article available online at https://doi.org/10.1234/abc.','本文所评论的文章可在线阅读：https://doi.org/10.1234/abc.'],
      ['Received: 24 November 2023 Accepted: 28 November 2023','收稿：24 November 2023 接收：28 November 2023'],
    ];
    for (const [text,expected] of examples) {
      expect(preserveSource({...block,text})).toBe(false);
      expect(translatePublicationLabel({...block,text})).toBe(expected);
      expect(numbersMatch(text,expected)).toBe(true);
    }
    expect(translatePublicationLabel({...block,kind:undefined,imageText:true,text:'Published online: 07 December 2023'})).toBe('在线发表：07 December 2023');
    expect(preserveSource({...block,text:'A. Smith',retainSource:true})).toBe(true);
  });
  it('filters OCR duplicates but keeps labels outside native text',()=>{
    const native={id:0,text:'body',x:10,y:10,width:100,height:20,fontSize:10};
    expect(overlapsNative({...native,id:1,x:12},[native])).toBe(true);
    expect(overlapsNative({...native,id:1,y:100},[native])).toBe(false);
  });
});
