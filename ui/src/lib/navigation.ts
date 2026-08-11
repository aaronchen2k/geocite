export type NavigationNode = { key: string; title: string; href?: string; children?: NavigationNode[] };
const group = (key: string, title: string, children: [string, string, string][]): NavigationNode => ({ key, title, children: children.map(([childKey, childTitle, href]) => ({ key: childKey, title: childTitle, href })) });
export const navigationTree: NavigationNode[] = [
  { key: 'dashboard', title: '仪表盘', href: '/dashboard' },
  group('diagnosis', '诊断', [['citation-detection','引用检测','/diagnosis/citation-detection'],['competitor-comparison','竞品对比','/diagnosis/competitor-comparison'],['asset-audit','资产审计','/diagnosis/asset-audit'],['channel-map','渠道地图','/diagnosis/channel-map'],['comprehensive-report','综合报告','/diagnosis/comprehensive-report']]),
  group('improvement', '提升', [['optimization-work-orders','优化工单','/improvement/optimization-work-orders'],['keyword-matrix','关键矩阵','/improvement/keyword-matrix'],['source-building','信源建设','/improvement/source-building'],['technical-adaptation','技术适配','/improvement/technical-adaptation'],['content-production','内容生产','/improvement/content-production']]),
  group('verification', '验证', [['visibility-trend','可见趋势','/verification/visibility-trend'],['rank-tracking','排名追踪','/verification/rank-tracking'],['attribution','效果归因','/verification/attribution'],['comparison-test','对比测试','/verification/comparison-test'],['periodic-retest','周期复测','/verification/periodic-retest']]),
  group('admin', '系统管理', [['brands','品牌管理','/admin/brands'],['engines','目标引擎','/admin/engines'],['models','模型管理','/admin/models'],['rag-agents','RAG智能体','/admin/rag-agents']]),
];
