import { afterEach, expect, it, vi } from 'vitest';
import { batchLiteratureBlocks, prepareLiteratureTranslationBlocks, translateLiteratureBatches, LiteratureBatchError } from '../services/literatureTranslation';
import { getCompletion } from '../services/llm';
import { literatureErrorMessage, type PdfBlock } from '../services/literature';
vi.mock(import('../services/llm'), async importOriginal => ({
  ...await importOriginal(),
  getCompletion: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const blocks = Array.from({ length: 7 }, (_, id) => ({ id, text: 'a'.repeat(500), x: 0, y: id * 20, width: 100, height: 10, fontSize: 10 } as PdfBlock));
const config = { provider: 'glm' as const, apiKey: 'synthetic' };
const respond = (_config: unknown, prompt: string) => Promise.resolve(JSON.stringify(JSON.parse(prompt).blocks.map((b: PdfBlock) => ({ id: b.id, translation: '译文' }))));
it('groups without losing IDs or exceeding three blocks / target characters', () => {
  expect(batchLiteratureBlocks(blocks).map(b => b.length)).toEqual([3, 3, 1]);
  expect(batchLiteratureBlocks(blocks).flat().map(b => b.id)).toEqual(blocks.map(b => b.id));
  expect(batchLiteratureBlocks(blocks.map(b => ({ ...b, text: 'x'.repeat(1000) })))).toHaveLength(7);
});
it('sends each sentence cut across columns or pages exactly once without changing source blocks', async () => {
  const request = vi.mocked(getCompletion).mockImplementation(respond);
  const left = { ...blocks[0], y: 400, kind: 'body', readingZone: 'left',
    text: 'What was the result at 7–9 ml/kg? Would PPV above 13' } as const;
  const right = { ...blocks[1], x: 260, y: 200, kind: 'body', readingZone: 'right',
    text: 'and SVV predict fluid responsiveness?' } as const;
  const tail = { ...right, id: 2, y: 590,
    text: 'Otherwise, the analysis may be misleading. When these limitations are' };
  const next = { ...left, id: 1, y: 150,
    text: 'respected, the variables may improve management [10].' };
  const page = [left,right,tail], nextPage = [next];
  const prepared = prepareLiteratureTranslationBlocks(page, undefined, nextPage);
  const preparedNext = prepareLiteratureTranslationBlocks(nextPage, page);
  expect(prepared[2].continuesOnNextPage).toBe(true);
  expect(preparedNext[0].continuesOnNextPage).toBeUndefined();
  expect(left.text).toContain('Would PPV above 13');
  expect(tail.text).toContain('When these limitations are');
  expect(next.text).toMatch(/^respected,/);
  await translateLiteratureBatches(config, prepared, [], {}, () => {}, () => true);
  await translateLiteratureBatches(config, preparedNext, [], {}, () => {}, () => true);
  const requested = request.mock.calls.flatMap(call => JSON.parse(call[1]).blocks);
  expect(requested).toEqual([
    {id:left.id,text:'What was the result at 7–9 ml/kg?'},
    {id:right.id,text:'Would PPV above 13 and SVV predict fluid responsiveness?'},
    {id:tail.id,text:'Otherwise, the analysis may be misleading.'},
    {id:next.id,text:'When these limitations are respected, the variables may improve management [10].'},
  ]);
});
it.each([
  ['The treatment levels were', 'not significantly different.'],
  ['The levels were reviewed by Dr. Smith and her', 'colleagues.'],
])('keeps an incomplete first block without a clear prior sentence boundary', (text, continuation) => {
  const left = { ...blocks[0], y:400, kind:'body',readingZone:'left',text } as const;
  const right = { ...blocks[1], x:260,y:200,kind:'body',readingZone:'right',text:continuation } as const;
  expect(prepareLiteratureTranslationBlocks([left,right])).toEqual([left,right]);
});
it('retains successful results and resumes only missing IDs after timeout', async () => {
  const request = vi.mocked(getCompletion);
  request.mockImplementationOnce(respond).mockRejectedValueOnce(new Error('GLM_PROXY_TIMEOUT'));
  let saved: Record<number, string> = {};
  await expect(translateLiteratureBatches(config, blocks, [], {}, result => { saved = result; }, () => true)).rejects.toBeInstanceOf(LiteratureBatchError);
  expect(Object.keys(saved)).toEqual(['0', '1', '2']);
  expect(request).toHaveBeenCalledTimes(2);
  request.mockReset().mockImplementation(respond);
  await translateLiteratureBatches(config, blocks, [], saved, result => { saved = result; }, () => true);
  const requested = request.mock.calls.flatMap(call => JSON.parse(call[1]).blocks.map((b: PdfBlock) => b.id));
  expect(requested).toEqual([3, 4, 5, 6]);
  expect(Object.keys(saved)).toHaveLength(7);
});
it('does not start another batch or deliver results after the reader is closed', async () => {
  let active = true;
  vi.mocked(getCompletion).mockImplementation(async () => { active = false; return '[]'; });
  const progress = vi.fn();
  await translateLiteratureBatches(config, blocks, [], {}, progress, () => active);
  expect(progress).not.toHaveBeenCalled();
  expect(getCompletion).toHaveBeenCalledTimes(1);
});
it('saves unambiguous IDs, retries only missing IDs and continues past a failed paragraph', async () => {
  const request=vi.mocked(getCompletion).mockImplementation(respond)
    .mockResolvedValueOnce('[{"id":1,"translation":"第二段"}]')
    .mockResolvedValueOnce('[]');
  let saved: Record<number,string>={};
  await translateLiteratureBatches(config,blocks,[],{},result=>{saved=result;},()=>true);
  expect(request.mock.calls.map(call=>JSON.parse(call[1]).blocks.map((b:PdfBlock)=>b.id)))
    .toEqual([[0,1,2],[0],[2],[3,4,5],[6]]);
  expect(saved[0]).toMatch(/^【待重译/);
  expect(saved[1]).toBe('第二段');
  expect(saved[6]).toBe('译文');
});
it('distinguishes the three timeout sources without leaking content', () => {
  expect(literatureErrorMessage(new Error('GLM_PROXY_TIMEOUT'))).toContain('主动中止');
  expect(literatureErrorMessage(new Error('GLM_UPSTREAM_TIMEOUT'))).toContain('上游返回');
  expect(literatureErrorMessage(new Error('FUNCTION_INVOCATION_TIMEOUT'))).toContain('Vercel');
});
