# Playwright 网页复核配置开关

## 实现

- 在 Brand 持久化配置中增加 `playwrightWebReviewEnabled`，数据库默认值为 `true`。
- 诊断配置读取响应在旧 Brand 没有该字段时也返回 `true`；保存 DTO、控制器和服务层会原子传递并保存该值。
- 基础配置的“诊断采样范围”增加受控的“使用 Playwright 网页复核”开关，默认选中，并显示指定的推荐说明。
- 基础配置保存请求会带上该字段；旧响应缺字段时前端仍按默认开启处理。

## TDD 证据

先新增服务端默认值/保存测试和 Playwright UI 场景；实施前：

- 服务端测试失败，因为响应没有 `playwrightWebReviewEnabled`。
- UI 测试失败，因为页面没有该开关。

实施后验证：

- `pnpm --dir server test`：20 suites、87 tests 全部通过。
- `pnpm --dir server build`：通过。
- `pnpm --dir ui exec tsc --noEmit`：通过。
- `pnpm --dir ui exec playwright test tests/home.spec.ts --grep "Playwright 网页复核"`：1 passed。

## 已知基线问题

运行完整 `ui/tests/home.spec.ts` 时，现有的非本任务断言失败：侧栏已由“诊断室”改为“诊断”，且部分页面当前以英文或更新后的中文文案渲染。这些失败不涉及本任务开关；新增的开关场景单独通过。
