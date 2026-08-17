export type GeneratedDiagnosisQuestion = { text: string; group: string };

export function parseGeneratedQuestions(text: string, limit = 20): GeneratedDiagnosisQuestion[] {
  let values: unknown = [];
  try {
    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = fenced.indexOf('{');
    const end = fenced.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced) as { questions?: unknown };
    values = parsed.questions ?? [];
  } catch {
    values = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''));
  }
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.map((value): GeneratedDiagnosisQuestion | null => {
    if (typeof value === 'string') return { text: value.trim(), group: '推荐' };
    if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
      const group = 'category' in value && typeof value.category === 'string'
        ? value.category.trim().slice(0, 30)
        : 'group' in value && typeof value.group === 'string' ? value.group.trim().slice(0, 30) : '推荐';
      return { text: value.text.trim(), group: group || '推荐' };
    }
    return null;
  }).filter((value): value is GeneratedDiagnosisQuestion => Boolean(value?.text) && !seen.has(value.text) && Boolean(seen.add(value.text))).slice(0, limit);
}
