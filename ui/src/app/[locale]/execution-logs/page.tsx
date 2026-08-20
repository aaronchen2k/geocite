import {ExecutionDebugLogPage} from '@/components/diagnosis/execution-debug-log-page';
import {Suspense} from 'react';

export default function ExecutionLogsPage() {
  return <Suspense fallback={null}><ExecutionDebugLogPage /></Suspense>;
}
