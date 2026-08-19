// ─── 输出目录 + 日志/保存公共工具（三引擎共享） ───
// 引擎脚本在 exec 开头调用 setOutDir(RUN_DIR) 指定本次产物根目录；
// 多问题模式下每问前调用 setOutDir(q-NN 子目录)。save/截图均落到当前输出目录。
import fs from 'node:fs';
import path from 'node:path';

let outDir: string | null = null;

/** 设置当前输出目录（顺带确保目录存在）；多问题模式每问前调用一次 */
export function setOutDir(dir: string): void {
  outDir = dir;
  fs.mkdirSync(dir, { recursive: true });
}

/** 当前输出目录（截图等 path.join 用；未设置时抛错） */
export function getOutDir(): string {
  if (!outDir) throw new Error('fs-utils: 未设置输出目录，请先调用 setOutDir(dir)');
  return outDir;
}

/** 本地时间戳（yyyy-MM-dd HH:mm:ss，机器本地时区），供日志/结果目录/时间字段统一使用 */
export function localTimestamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 带时间戳日志（本地时间） */
export function log(msg: string): void {
  console.log(`[${localTimestamp()}] ${msg}`);
}

/** 保存文本产物到当前输出目录（每个文件只打一条日志） */
export function save(name: string, content: string): void {
  fs.writeFileSync(path.join(getOutDir(), name), content, 'utf-8');
  log(`已保存: ${name}`);
}

/** 保存 result.json（泛型，三引擎各自的 RunResult 结构不同） */
export function saveResult<T>(result: T): void {
  save('result.json', JSON.stringify(result, null, 2));
}
