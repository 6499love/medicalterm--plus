// Reviewed against SiliconFlow's free-model documentation on 2026-11-05.
// /models confirms availability, not pricing. Keep this list reviewed; never
// fall back to an arbitrary model (including Pro/ variants).
const recommendedModels = ['THUDM/GLM-4-9B-0414', 'Qwen/Qwen3.5-4B'];

export class SiliconFlowConfigError extends Error {}

export async function resolveSiliconFlowModel(apiKey: string, model?: string): Promise<string> {
  if (model?.trim()) return model.trim();
  let response: Response;
  try {
    response = await fetch('https://api.siliconflow.cn/v1/models?sub_type=chat', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SiliconFlowConfigError('暂时无法读取硅基流动模型列表，请检查网络后重试。无需填写模型 ID。');
  }
  if (!response.ok) {
    const message = response.status === 401 ? '硅基流动未接受此 Key，请检查是否复制完整、是否属于硅基流动。'
      : response.status === 403 ? '硅基流动拒绝访问，请检查账号实名认证和访问权限。'
      : `硅基流动模型列表暂不可用（${response.status}），请稍后重试。`;
    throw new SiliconFlowConfigError(message);
  }
  const data = await response.json().catch(() => null);
  const ids = new Set(Array.isArray(data?.data) ? data.data.map((item: { id?: unknown }) => item?.id) : []);
  const selected = recommendedModels.find(id => ids.has(id));
  if (!selected) throw new SiliconFlowConfigError('当前未找到推荐模型，已停止调用。请稍后重试或使用智谱 GLM；网站不会自动切换到其他收费型号。');
  return selected;
}
