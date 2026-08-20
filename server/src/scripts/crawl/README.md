# crawl — 多引擎 AI 采样脚本

对 deepseek / doubao / qwen 三个 AI 引擎执行「联网搜索」采样，抓取回答文本与参考文献引用，落到各自 `results/` 目录。

## 目录结构

```
crawl/
├── config.json              # 上层共享配置（query / batchQueries / 端口 / 目标 URL / 等待参数）
├── deepseek/  qwen/  doubao/   # 三引擎，各自含 crawl.mts / config.json / run.sh / results/
└── utils/                   # 共享工具（load-config / ensure-browser / fs-utils / domain）
```

## 直接运行（调试 / 采样 / 第三方调用）

```bash
cd crawl

# 无参数：用 config.json 的 batchQueries（批量），未配置则退回 query（单问题）
node deepseek/crawl.mts

# 传 JSON 字符串数组：批量采样这几个问题
node deepseek/crawl.mts '["问题1","问题2","问题3"]'

# 第二个参数指定运行目录名，第三个参数是 isDebug；结果写到
# server/data/playwright-exec/<运行目录名>/<engine>/
node doubao/crawl.mts '["问题1","问题2"]' run-2026-08-19_12-18-36 false
# 直接 node 调用不传目录时，crawl.mts 默认按当前时间生成 run-<本地时间戳>
```

也可用 `run.sh`（等价，默认脚本 `crawl.mts`，参数透传）：

```bash
./deepseek/run.sh crawl.mts '["问题1","问题2"]' run-xxx false
# 不传运行目录时，run.sh 会清空并复用 server/data/playwright-exec/sampling-debug/
./deepseek/run.sh crawl.mts '["问题1","问题2"]'
```

三个引擎命令相同，替换目录名即可：`deepseek` / `qwen` / `doubao`。

**第三方系统统一采用上面的 `node <engine>/crawl.mts '["问题1","问题2"]'` 方式执行**（无编译步骤，`.mts` 源文件即运行产物）。

## 结果产物

每次运行在 `server/data/playwright-exec/<目录名>/<engine>/` 下生成。由诊断服务发起的一轮采样会为所有引擎共用同一个带日期的 `<目录名>`；直接用 `run.sh` 且未给目录时使用并清空 `sampling-debug`：

- 单问题：`question.txt`、`01~04 截图.png`、`response-text.txt`、`citation-links.json`、`result.json`
- 多问题：每问一个 `q-NN/` 子目录，根部另有 `summary.json` 汇总

`result.json` 字段：`question` / `config`（含 `startedAt`）/ `searchToggle`（开关状态与动作）/ `response` / `citations`（标题+URL）/ `article`（恒 `null`，不点开引用链接）/ `finishedAt`。

## 后端（Node ≥ 22.18）编程调用

第三方服务也可直接动态导入 `.mts` 源文件调用 `exec`（不经过命令行）：

```ts
const { exec: deepseekExec } = await import(
  pathToFileURL(path.join(__dirname, '../../crawl/deepseek/crawl.mts')).href,
);
const results = await deepseekExec(questions, false); // isDebug=false 完整等待
```

## `exec` 签名

```ts
exec(questions: string[] = [], isDebug = true): Promise<RunResult[]>
```

- `questions`：问题数组；为空时用 `config.batchQueries`（批量）或 `config.query`（单问题）
- `isDebug`：`true`（默认）等待 6s ± 2s 抖动（不等完整回答，重点抓参考文献引用）；`false` 按 `config.responseWaitMs`（30s ± 抖动）等待并轮询回答稳定

## 配置要点

- `config.json`（上层，共享）：`query`（单问题）、`batchQueries`（批量问题数组）、`responseWaitMs`（回答等待基准）、`waitJitterMs`、`debugPorts`、`targetUrls`、`searchToggleTexts`
- 各引擎 `config.json`（引擎差异）：`engine`、`profileName`、登录检测相关

## 运行前置

- Node ≥ 22.18（`.mts` 直跑 type-stripping；含 `import.meta.dirname`，需 Node ≥ 20.11）
- 首次采样会自动拉起对应端口受控 Chrome（`ensureBrowser`），Chrome 需可写 `data/playwright-profiles/<profileName>`
