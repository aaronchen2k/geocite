export type GeneratedDiagnosisQuestion = { text: string; primaryCategory: string; secondaryCategory: string };

export function parseGeneratedQuestions(text: string, limit = 20): GeneratedDiagnosisQuestion[] {
  let values: unknown = [];
  try {
    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = fenced.indexOf('{');
    const end = fenced.lastIndexOf('}');
    values = (JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced) as { questions?: unknown }).questions ?? [];
  } catch { return []; }
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.map((value): GeneratedDiagnosisQuestion | null => {
    if (!value || typeof value !== 'object' || !('text' in value) || typeof value.text !== 'string' || !('primaryCategory' in value) || typeof value.primaryCategory !== 'string' || !('secondaryCategory' in value) || typeof value.secondaryCategory !== 'string') return null;
    return { text: value.text.trim(), primaryCategory: value.primaryCategory.trim(), secondaryCategory: value.secondaryCategory.trim() };
  }).filter((value): value is GeneratedDiagnosisQuestion => Boolean(value?.text && value.primaryCategory && value.secondaryCategory) && !seen.has(value.text) && Boolean(seen.add(value.text))).slice(0, limit);
}

export function normalizeDiagnosisQuestions(inputs: string[]): string[] { return [...new Set(inputs.map((item) => item.trim()).filter(Boolean))].slice(0, 50); }
