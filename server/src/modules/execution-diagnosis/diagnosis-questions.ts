export function parseGeneratedQuestions(text: string, limit = 20): string[] {
  let values: unknown = [];
  try {
    const parsed = JSON.parse(text) as { questions?: unknown };
    values = parsed.questions ?? [];
  } catch {
    values = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''));
  }
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}
