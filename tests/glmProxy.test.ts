import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/glm/chat/completions';

afterEach(() => vi.unstubAllGlobals());

function reply() {
  return { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
}
const request = { method: 'POST', headers: { authorization: 'Bearer test-only' }, body: { model: 'glm-4-flash', messages: [{ role: 'user', content: 'test' }] } };

describe('Vercel GLM function', () => {
  it('rejects requests without authentication or valid text before contacting GLM', async () => {
    const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
    const missing = reply(); await handler({ ...request, headers: {} }, missing);
    expect(missing.statusCode).toBe(401);
    const wrong = reply(); await handler({ ...request, method: 'GET' }, wrong);
    expect(wrong.statusCode).toBe(405);
    const invalid = reply(); await handler({ ...request, body: { model: 'x', messages: [{ role: 'user', content: {} }] } }, invalid);
    expect(invalid.statusCode).toBe(400);
    const large = reply(); await handler({ ...request, body: { model: 'x', messages: [{ role: 'user', content: 'a'.repeat(260000) }] } }, large);
    expect(large.statusCode).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('uses a fixed destination and forwards only supported fields and the supplied key', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '译文' } }] })));
    vi.stubGlobal('fetch', upstream);
    const result = reply();
    await handler({ ...request, headers: { ...request.headers, cookie: 'private-cookie' }, body: { ...request.body, url: 'https://invalid.test', stream: true } }, result);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.end.mock.calls[0][0]).choices[0].message.content).toBe('译文');
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-only', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ ...request.body, temperature: 0.1, stream: false });
    expect(result.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('preserves provider error status without exposing raw response content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive provider body', { status: 403 })));
    const result = reply(); await handler(request, result);
    expect(result.statusCode).toBe(403);
    expect(result.end.mock.calls[0][0]).not.toContain('sensitive');
  });
  it('reports network failure, timeout and missing model content', async () => {
    const upstream = vi.fn().mockRejectedValueOnce(new Error('network details')).mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', upstream);
    for (const status of [502, 504, 502]) {
      const result = reply(); await handler(request, result); expect(result.statusCode).toBe(status);
    }
  });
});

it('distinguishes upstream 504 from the local deadline and returns elapsed time', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('private upstream body', { status: 504 }))
    .mockRejectedValueOnce(new DOMException('simulated', 'TimeoutError')));
  for (const code of ['GLM_UPSTREAM_TIMEOUT', 'GLM_PROXY_TIMEOUT']) {
    const result = reply(); await handler(request, result);
    expect(result.statusCode).toBe(504);
    const error = JSON.parse(result.end.mock.calls[0][0]).error;
    expect(error.code).toBe(code);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.end.mock.calls[0][0]).not.toContain('private');
  }
});
