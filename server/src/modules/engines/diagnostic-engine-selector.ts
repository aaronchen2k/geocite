export type DiagnosticEngineCandidate = {
  id: number;
  code: string;
  disabled: boolean;
  apiKey: string | null;
};

export type SkippedDiagnosticEngine = {
  id: number;
  code: string;
  reason: 'engine-disabled' | 'api-key-not-configured';
};

export function selectDiagnosticEngines<T extends DiagnosticEngineCandidate>(engines: T[]) {
  const eligible: T[] = [];
  const skipped: SkippedDiagnosticEngine[] = [];

  for (const engine of engines) {
    if (engine.disabled) {
      skipped.push({ id: engine.id, code: engine.code, reason: 'engine-disabled' });
    } else if (!engine.apiKey?.trim()) {
      skipped.push({ id: engine.id, code: engine.code, reason: 'api-key-not-configured' });
    } else {
      eligible.push(engine);
    }
  }

  return { eligible, skipped };
}
