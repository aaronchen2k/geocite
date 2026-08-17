import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {WorkspacePage} from '@/components/workspace-page';
import {DiagnosisExecutionPage} from '@/components/diagnosis/diagnosis-execution-page';
import {DiagnosisConfigurationPage} from '@/components/diagnosis/diagnosis-configuration-page';
import {DiagnosisReportPage} from '@/components/diagnosis/diagnosis-report-page';
import {BasicConfigurationPage} from '@/components/configuration/basic-configuration-page';
import {CompetitorBrandsPage} from '@/components/configuration/competitor-brands-page';
import {BrandFactsPage} from '@/components/configuration/brand-facts-page';
import {DiagnosisEmptyPage} from '@/components/diagnosis/diagnosis-empty-page';
import {DiagnosisInsightsPage} from '@/components/diagnosis/diagnosis-insights-page';
import {VerificationPages} from '@/components/verification/verification-pages';
import {OptimizationWorkOrdersPage} from '@/components/optimization/optimization-work-orders-page';
import {OptimizationPlanningPage} from '@/components/optimization/optimization-planning-pages';

type VerificationGuidance = {purposeTitle: string; automaticTitle: string; manualTitle: string; purpose: string; automatic: string; manual: string};

const pages: Record<string, string> = {
  dashboard: 'dashboard', 'configuration/questions': 'diagnosisConfiguration', 'diagnosis/diagnosis-execution': 'diagnosisExecution', 'diagnosis/competitor-comparison': 'competitorComparison', 'diagnosis/samples': 'diagnosisSamples', 'diagnosis/diagnosis-report': 'diagnosisReport', 'improvement/optimization-work-orders': 'optimizationWorkOrders', 'improvement/keyword-matrix': 'keywordMatrix', 'improvement/source-building': 'sourceBuilding', 'improvement/technical-adaptation': 'technicalAdaptation', 'improvement/content-production': 'contentProduction', 'verification/visibility-trend': 'visibilityTrend', 'verification/rank-tracking': 'rankTracking', 'verification/attribution': 'attribution', 'verification/comparison-test': 'comparisonTest', 'verification/periodic-retest': 'periodicRetest',
};

export default async function Page({params}: {params: Promise<{locale: string; segments: string[]}>}) {
  const {locale, segments} = await params;
  setRequestLocale(locale);
  const key = segments.join('/');
  if (key === 'diagnosis/diagnosis-execution') return <DiagnosisExecutionPage />;
  if (key === 'configuration/questions') return <DiagnosisConfigurationPage />;
  if (key === 'configuration/basic') return <BasicConfigurationPage />;
  if (key === 'configuration/competitors') return <CompetitorBrandsPage />;
  if (key === 'configuration/brand-facts') return <BrandFactsPage />;
  if (key === 'diagnosis/problem-summary') return <DiagnosisInsightsPage variant="summary" />;
  if (key === 'diagnosis/positioning-map') return <DiagnosisInsightsPage variant="map" />;
  if (key === 'diagnosis/competitor-comparison') return <DiagnosisInsightsPage variant="competitors" />;
  if (key === 'diagnosis/samples') return <DiagnosisInsightsPage variant="samples" />;
  if (key === 'diagnosis/diagnosis-report') return <DiagnosisInsightsPage variant="report" />;
  if (key === 'improvement/optimization-work-orders') return <OptimizationWorkOrdersPage />;
  if (key === 'improvement/keyword-matrix') return <OptimizationPlanningPage variant="matrix" />;
  if (key === 'improvement/source-building') return <OptimizationPlanningPage variant="source" />;
  if (key === 'improvement/technical-adaptation') return <OptimizationPlanningPage variant="website" />;
  if (key === 'improvement/content-production') return <OptimizationPlanningPage variant="content" />;
  if (key.startsWith('admin/')) return <WorkspacePage admin={key.slice(6)} />;
  const pageKey = pages[key];
  if (key === 'verification/visibility-trend') return <VerificationPages variant="trend" />;
  if (key === 'verification/rank-tracking') return <VerificationPages variant="questions" />;
  if (key === 'verification/comparison-test') return <VerificationPages variant="comparison-test" />;
  if (key === 'verification/attribution') return <VerificationPages variant="attribution" />;
  if (key === 'verification/periodic-retest') return <VerificationPages variant="periodic-retest" />;
  if (!pageKey) notFound();
  const t = await getTranslations('Pages');
  const guidanceGroup = key.startsWith('verification/') ? 'verificationGuidance' : key.startsWith('improvement/') ? 'improvementGuidance' : null;
  const guidance = guidanceGroup ? {...t.raw(guidanceGroup) as Omit<VerificationGuidance, 'purpose' | 'automatic' | 'manual'>, ...t.raw(`${pageKey}.guidance`) as Pick<VerificationGuidance, 'purpose' | 'automatic' | 'manual'>} : undefined;
  return <WorkspacePage title={t(`${pageKey}.title`)} description={t(`${pageKey}.description`)} guidance={guidance} />;
}
