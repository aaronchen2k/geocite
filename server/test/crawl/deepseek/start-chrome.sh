#!/bin/bash
# 启动受控 Chrome
# 配置分层：上层 crawl/config.json（chromeBin/profileRoot）+ 本目录 config.json（debugPort/profileName）
# 用法: ./start-chrome.sh   （以持久后台任务方式运行本脚本，否则 Chrome 会被环境回收）
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${DIR}/config.json"
TOP_CONFIG="${DIR}/../config.json"

# Node 动态解析：优先环境变量 NODE_BIN，其次 PATH 查找（不硬编码具体版本路径）
NODE_BIN="${NODE_BIN:-$(command -v node)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 node：请安装 Node >= 22.18，或 export NODE_BIN=<node 可执行文件路径>" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]] || [[ ! -f "$TOP_CONFIG" ]]; then
  echo "缺少配置：需要引擎 config.json（${CONFIG}）与上层 config.json（${TOP_CONFIG}）"
  exit 1
fi

# 合并上层+引擎配置（profileDir = profileRoot/profileName），输出 JSON 后逐个取值（不用 eval，避免引号/空格坑）
read_env_json() {
  "$NODE_BIN" -e "
    const path = require('node:path');
    const top = require('${TOP_CONFIG}');
    const own = require('${CONFIG}');
    if (!top.chromeBin) { console.error('上层 config.json 缺少字段: chromeBin'); process.exit(1); }
    if (!top.profileRoot) { console.error('上层 config.json 缺少字段: profileRoot'); process.exit(1); }
    if (!own.profileName) { console.error('引擎 config.json 缺少字段: profileName'); process.exit(1); }
    const port = own.debugPort ?? top.debugPorts?.[own.engine];
    if (!port) { console.error('缺少 debugPort：引擎 config.json 或上层 config.json debugPorts[engine]'); process.exit(1); }
    process.stdout.write(JSON.stringify({
      chromeBin: own.chromeBin ?? top.chromeBin,
      profileDir: path.join(top.profileRoot, own.profileName),
      debugPort: port,
    }));
  "
}
ENV_JSON="$(read_env_json)"
get_env() {
  "$NODE_BIN" -e "process.stdout.write(String(JSON.parse(process.argv[1])['${1}']))" "$ENV_JSON"
}
CHROME=$(get_env chromeBin)
PROFILE=$(get_env profileDir)
PORT=$(get_env debugPort)

# 若已有实例在监听则跳过启动
if curl -s -m 2 --noproxy "*" "http://127.0.0.1:${PORT}/json/version" | grep -q "Browser"; then
  echo "Chrome 已在端口 ${PORT} 运行，跳过启动"
  exit 0
fi

echo "启动受控 Chrome (端口 ${PORT}, profile: ${PROFILE})…"
# 注意:
#  1. --no-sandbox --disable-gpu: 某些受限环境下 Chrome 自身沙箱/GPU 进程起不来会导致 FATAL 退出
#  2. unset 代理: 继承 HTTP_PROXY 会让 Chrome 网络服务异常
#  3. exec 前台常驻：脚本需以持久后台任务方式运行，否则命令结束 Chrome 会被环境回收
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
exec "$CHROME" \
  --remote-debugging-port=${PORT} \
  --no-sandbox --disable-gpu \
  --user-data-dir="$PROFILE"
