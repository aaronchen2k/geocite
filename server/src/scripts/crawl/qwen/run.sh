#!/bin/bash
# 运行抓取脚本（默认 crawl.mts，可传脚本名；配置见上层 config.json + 本目录 config.json）
# Node >= 22.18 原生支持 .ts 直跑（type stripping），无需 tsc/tsx
SCRIPT="${1:-crawl.mts}"

# Node 动态解析：优先环境变量 NODE_BIN，其次 PATH 查找（不硬编码具体版本路径）
NODE_BIN="${NODE_BIN:-$(command -v node)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 node：请安装 Node >= 22.18，或 export NODE_BIN=<node 可执行文件路径>" >&2
  exit 1
fi

if [[ ! -f "$SCRIPT" ]]; then
  echo "脚本不存在: $SCRIPT"
  exit 1
fi

# 关键: 绕过本地代理访问 CDP 端口，否则 connectOverCDP 报 502
# （ESM 不认 NODE_PATH，playwright 依赖靠脚本目录内 node_modules 软链解析，无需设置）
cd "$(dirname "$0")"
NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost" \
  "$NODE_BIN" "$SCRIPT"
