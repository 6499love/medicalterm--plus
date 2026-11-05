import { afterEach, expect, it, vi } from 'vitest';
import { resolveSiliconFlowModel } from '../services/siliconflow';
import { literatureErrorMessage } from '../services/literature';
afterEach(() => vi.unstubAllGlobals());
it('uses the alternate recommended model if the first is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'Qwen/Qwen3.5-4B' }] }) }));
  expect(await resolveSiliconFlowModel('test-only')).toBe('Qwen/Qwen3.5-4B');
});
it('stops rather than choosing a Pro model or arbitrary model', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'Pro/THUDM/GLM-4-9B-0414' }, { id: 'other' }] }) });
  vi.stubGlobal('fetch', request);
  await expect(resolveSiliconFlowModel('test-only')).rejects.toThrow('当前未找到推荐模型');
  expect(request).toHaveBeenCalledTimes(1);
});
it('handles rejected credentials without exposing response contents', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  await expect(resolveSiliconFlowModel('test-only')).rejects.toThrow('未接受此 Key');
});
it('keeps an explicit custom model without silently replacing it', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  expect(await resolveSiliconFlowModel('test-only', ' custom-model ')).toBe('custom-model');
  expect(request).not.toHaveBeenCalled();
});
it('fails safely on malformed model lists', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) }));
  await expect(resolveSiliconFlowModel('test-only')).rejects.toThrow('当前未找到推荐模型');
});
it('preserves useful automatic configuration errors in literature UI', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  try { await resolveSiliconFlowModel('test-only'); throw new Error('unexpected success'); }
  catch (error) { expect(literatureErrorMessage(error)).toContain('无需填写模型 ID'); }
});
