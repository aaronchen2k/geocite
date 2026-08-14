import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {WorkspacePage} from '@/components/workspace-page';
import {ExecutionDiagnosisPage} from '@/components/diagnosis/execution-diagnosis-page';
import {ComprehensiveReportPage} from '@/components/diagnosis/comprehensive-report-page';
import {DiagnosisConfigurationPage} from '@/components/diagnosis/diagnosis-configuration-page';
import {DiagnosisInsightsPage} from '@/components/diagnosis/diagnosis-insights-page';

const pages: Record<string, string> = {
  dashboard: 'dashboard', 'diagnosis/diagnosis-configuration': 'diagnosisConfiguration', 'diagnosis/execution-diagnosis': 'executionDiagnosis', 'diagnosis/diagnosis-insights': 'diagnosisInsights', 'diagnosis/comprehensive-report': 'comprehensiveReport', 'improvement/optimization-work-orders': 'optimizationWorkOrders', 'improvement/keyword-matrix': 'keywordMatrix', 'improvement/source-building': 'sourceBuilding', 'improvement/technical-adaptation': 'technicalAdaptation', 'improvement/content-production': 'contentProduction', 'verification/visibility-trend': 'visibilityTrend', 'verification/rank-tracking': 'rankTracking', 'verification/attribution': 'attribution', 'verification/comparison-test': 'comparisonTest', 'verification/periodic-retest': 'periodicRetest',
};

export default async function Page({params}: {params: Promise<{locale: string; segments: string[]}>}) {
  const {locale, segments} = await params;
  setRequestLocale(locale);
  const key = segments.join('/');
  if (key === 'diagnosis/execution-diagnosis') return <ExecutionDiagnosisPage />;
  if (key === 'diagnosis/diagnosis-configuration') return <DiagnosisConfigurationPage />;
  if (key === 'diagnosis/diagnosis-insights') return <DiagnosisInsightsPage />;
  if (key === 'diagnosis/comprehensive-report') return <ComprehensiveReportPage />;
  if (key.startsWith('admin/')) return <WorkspacePage admin={key.slice(6)} />;
  const pageKey = pages[key];
  if (!pageKey) notFound();
  const t = await getTranslations('Pages');
  return <WorkspacePage title={t(`${pageKey}.title`)} description={t(`${pageKey}.description`)} />;
}
