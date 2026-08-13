import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {WorkspacePage} from '@/components/workspace-page';
import {ExecutionDiagnosisPage} from '@/components/diagnosis/execution-diagnosis-page';
import {ComprehensiveReportPage} from '@/components/diagnosis/comprehensive-report-page';

const pages: Record<string, string> = {
  dashboard: 'dashboard', 'diagnosis/execution-diagnosis': 'executionDiagnosis', 'diagnosis/citation-detection': 'citationDetection', 'diagnosis/competitor-comparison': 'competitorComparison', 'diagnosis/asset-audit': 'assetAudit', 'diagnosis/channel-map': 'channelMap', 'diagnosis/comprehensive-report': 'comprehensiveReport', 'improvement/optimization-work-orders': 'optimizationWorkOrders', 'improvement/keyword-matrix': 'keywordMatrix', 'improvement/source-building': 'sourceBuilding', 'improvement/technical-adaptation': 'technicalAdaptation', 'improvement/content-production': 'contentProduction', 'verification/visibility-trend': 'visibilityTrend', 'verification/rank-tracking': 'rankTracking', 'verification/attribution': 'attribution', 'verification/comparison-test': 'comparisonTest', 'verification/periodic-retest': 'periodicRetest',
};

export default async function Page({params}: {params: Promise<{locale: string; segments: string[]}>}) {
  const {locale, segments} = await params;
  setRequestLocale(locale);
  const key = segments.join('/');
  if (key === 'diagnosis/execution-diagnosis') return <ExecutionDiagnosisPage />;
  if (key === 'diagnosis/comprehensive-report') return <ComprehensiveReportPage />;
  if (key.startsWith('admin/')) return <WorkspacePage admin={key.slice(6)} />;
  const pageKey = pages[key];
  if (!pageKey) notFound();
  const t = await getTranslations('Pages');
  return <WorkspacePage title={t(`${pageKey}.title`)} description={t(`${pageKey}.description`)} />;
}
