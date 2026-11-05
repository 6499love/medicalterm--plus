import { afterEach, expect, it, vi } from 'vitest';
import { batchLiteratureBlocks, translateLiteratureBatches, LiteratureBatchError } from '../services/literatureTranslation';
import { getCompletion } from '../services/llm';
import { literatureErrorMessage, type PdfBlock } from '../services/literature';
vi.mock('../services/llm', () => ({ getCompletion: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const blocks = Array.from({ length: 7 }, (_, id) => ({ id, text: 'a'.repeat(500), x: 0, y: id * 20, width: 100, height: 10, fontSize: 10 } as PdfBlock));
const config = { provider: 'glm' as const, apiKey: 'synthetic' };
const respond = (_config: unknown, prompt: string) => Promise.resolve(JSON.stringify(JSON.parse(prompt).blocks.map((b: PdfBlock) => ({ id: b.id, translation: '译文' }))));
it('groups without losing IDs or exceeding three blocks / target characters', () => {
  expect(batchLiteratureBlocks(blocks).map(b => b.length)).toEqual([3, 3, 1]);
  expect(batchLiteratureBlocks(blocks).flat().map(b => b.id)).toEqual(blocks.map(b => b.id));
  expect(batchLiteratureBlocks(blocks.map(b => ({ ...b, text: 'x'.repeat(1000) })))).toHaveLength(7);
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
it('keeps partial results untouched when the next response has invalid IDs', async () => {
  vi.mocked(getCompletion).mockImplementationOnce(respond).mockResolvedValueOnce('[]');
  const progress = vi.fn();
  await expect(translateLiteratureBatches(config, blocks, [], {}, progress, () => true)).rejects.toBeInstanceOf(LiteratureBatchError);
  expect(progress).toHaveBeenCalledTimes(1);
});
it('distinguishes the three timeout sources without leaking content', () => {
  expect(literatureErrorMessage(new Error('GLM_PROXY_TIMEOUT'))).toContain('主动中止');
  expect(literatureErrorMessage(new Error('GLM_UPSTREAM_TIMEOUT'))).toContain('上游返回');
  expect(literatureErrorMessage(new Error('FUNCTION_INVOCATION_TIMEOUT'))).toContain('Vercel');
});
