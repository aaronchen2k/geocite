function isGpt5(model: { provider: string; modelName: string }) { return /gpt[- ]?5/i.test(`${model.provider} ${model.modelName}`); }

export function completionTokenLimit(model: { provider: string; modelName: string }, value: number): { max_tokens: number } | { max_completion_tokens: number } {
  const identifiesGpt5 = isGpt5(model);
  return identifiesGpt5 ? { max_completion_tokens: value } : { max_tokens: value };
}

export function temperatureSetting(model: { provider: string; modelName: string }, value: number): { temperature?: number } {
  return isGpt5(model) ? {} : { temperature: value };
}

export function upstreamErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  }
  return `默认模型返回 HTTP ${status}。`;
}
