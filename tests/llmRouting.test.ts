import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCompletion } from '../services/llm';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('GLM same-origin routing', () => {
  it('sends default GLM requests through the local development proxy', async () => {
    vi.stubEnv('DEV', true);
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    vi.stubGlobal('fetch', request);
    expect(await getCompletion({ provider: 'glm', apiKey: 'test-only' }, 'test')).toBe('ok');
    expect(request.mock.calls[0][0]).toBe('/api/glm/chat/completions');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
  });
  it('keeps custom endpoints explicit and routes production GLM through the function', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    vi.stubGlobal('fetch', request);
    vi.stubEnv('DEV', true);
    await getCompletion({ provider: 'glm', apiKey: 'test-only', baseUrl: 'https://example.test/v1' }, 'test');
    expect(request.mock.calls[0][0]).toBe('https://example.test/v1/chat/completions');
    vi.stubEnv('DEV', false);
    await getCompletion({ provider: 'glm', apiKey: 'test-only' }, 'test');
    expect(request.mock.calls[1][0]).toBe('/api/glm/chat/completions');
  });
});


describe('SiliconFlow routing', () => {
  it('sends the chosen model and key only to SiliconFlow', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'translated' } }] }) });
    vi.stubGlobal('fetch', request);
    expect(await getCompletion({ provider: 'siliconflow', apiKey: 'test-only', model: ' selected-model ' }, 'hello')).toBe('translated');
    expect(request.mock.calls[0][0]).toBe('https://api.siliconflow.cn/v1/chat/completions');
    expect(JSON.parse(request.mock.calls[0][1].body).model).toBe('selected-model');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
  });
  it('automatically selects a recommended model before translating', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'THUDM/GLM-4-9B-0414' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    vi.stubGlobal('fetch', request);
    expect(await getCompletion({ provider: 'siliconflow', apiKey: 'test-only' }, 'hello')).toBe('ok');
    expect(request.mock.calls[0][0]).toBe('https://api.siliconflow.cn/v1/models?sub_type=chat');
    expect(JSON.parse(request.mock.calls[1][1].body).model).toBe('THUDM/GLM-4-9B-0414');
  });
});
