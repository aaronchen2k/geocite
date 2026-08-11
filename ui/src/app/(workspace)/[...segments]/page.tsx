import { notFound } from 'next/navigation';
import { WorkspacePage } from '../../../components/workspace-page';

const pages: Record<string, { title: string; description: string }> = {
  dashboard: { title: '仪表盘', description: '查看当前 Brand 的 GEO 工作台概览。' },
  'diagnosis/citation-detection': { title: '引用检测', description: '识别品牌在 AI 回答中的引用表现。' }, 'diagnosis/competitor-comparison': { title: '竞品对比', description: '比较竞品的可见性表现。' }, 'diagnosis/asset-audit': { title: '资产审计', description: '审计可用数字资产。' }, 'diagnosis/channel-map': { title: '渠道地图', description: '查看影响渠道。' }, 'diagnosis/comprehensive-report': { title: '综合报告', description: '汇总诊断结果。' },
  'improvement/optimization-work-orders': { title: '优化工单', description: '管理优化执行项。' }, 'improvement/keyword-matrix': { title: '关键矩阵', description: '规划关键主题矩阵。' }, 'improvement/source-building': { title: '信源建设', description: '规划信源建设。' }, 'improvement/technical-adaptation': { title: '技术适配', description: '检查技术适配项。' }, 'improvement/content-production': { title: '内容生产', description: '管理内容生产计划。' },
  'verification/visibility-trend': { title: '可见趋势', description: '查看可见性变化。' }, 'verification/rank-tracking': { title: '排名追踪', description: '追踪排名变化。' }, 'verification/attribution': { title: '效果归因', description: '分析优化效果归因。' }, 'verification/comparison-test': { title: '对比测试', description: '管理对比实验。' }, 'verification/periodic-retest': { title: '周期复测', description: '安排周期复测。' },
};
export default async function Page({ params }: { params: Promise<{ segments: string[] }> }) { const key=(await params).segments.join('/'); if(key.startsWith('admin/')) return <WorkspacePage admin={key.slice(6)} />; const page=pages[key]; if(!page) notFound(); return <WorkspacePage {...page} />; }
