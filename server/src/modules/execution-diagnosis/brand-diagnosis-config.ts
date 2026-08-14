export function normalizeDiagnosisQuestions(inputs: string[]): string[] {
  return [...new Set(inputs.map((item) => item.trim()).filter(Boolean))].slice(0, 50);
}
