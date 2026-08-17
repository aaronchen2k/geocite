# 两层问题分类交付报告

- 分类规则由 `diagnosis_question_taxonomy` 系统表保存并由 seed 写入：3 个一级分类、8 个二级分类，权重总和严格为 100。
- 默认 AI 补充题数为 20；提示词从分类定义渲染全部二级分类、权重、示例和哈密顿配额。模型结果必须包含有效的 `primaryCategory` / `secondaryCategory`，服务端校验总数及每个二级配额，且只发起一次模型请求。
- 品牌题目保存一级与二级标签；历史题目不删除文本，不能准确识别时迁移为“核心业务能力提问 / 能力确认”。
- 基础配置只读展示系统题数和固定分类权重；题库手工编辑的二级下拉项随一级分类约束。
- 执行快照保存每题两级标签与 taxonomy version `v1`。

验证：

- `pnpm --dir server test`：22 suites、102 tests passed（其中分类相关 4 suites、27 tests）。
- `pnpm --dir server build`：通过。
- `pnpm --dir ui exec tsc --noEmit`：通过。
- UI Playwright 未运行：共享端口 `8101` 已被并行任务占用；未终止他人进程。
