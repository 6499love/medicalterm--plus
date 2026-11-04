import type { IncomingHttpHeaders } from 'node:http';

interface ApiRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body: string): unknown;
}

// Vercel parses JSON bodies. This endpoint only forwards to the fixed GLM API.
export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  const fail = (status: number, message: string) => {
    response.statusCode = status;
    response.end(JSON.stringify({ error: { message } }));
  };
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return fail(405, 'Only POST is supported.');
  }
  const authorization = request.headers.authorization;
  if (!authorization || !/^Bearer \S+$/.test(authorization)) return fail(401, 'API key is required.');
  const body = request.body;
  if (!body || typeof body !== 'object' || !('model' in body) || typeof body.model !== 'string' ||
    !('messages' in body) || !Array.isArray(body.messages) || !body.messages.length) {
    return fail(400, 'A model and messages are required.');
  }
  if (!body.messages.every(message => message && typeof message === 'object' &&
    ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')) {
    return fail(400, 'Only text messages are supported.');
  }
  // Forward only supported fields; clients cannot select an upstream or enable streaming.
  const payload = JSON.stringify({ model: body.model, messages: body.messages.map(message => ({ role: message.role, content: message.content })), temperature: 0.1, stream: false });
  if (Buffer.byteLength(payload, 'utf8') > 256_000) return fail(413, 'Request is too large.');
  try {
    const upstream = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'error',
      signal: AbortSignal.timeout(50000),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return fail(upstream.status, 'GLM rejected the request. Check credentials, model permissions or quota.');
    }
    const data = await upstream.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return fail(502, 'GLM returned no translation content.');
    response.statusCode = 200;
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  } catch (error) {
    return fail(error instanceof Error && error.name === 'TimeoutError' ? 504 : 502, 'GLM service could not be reached or returned an invalid response.');
  }
}
