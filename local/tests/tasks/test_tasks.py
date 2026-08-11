import json
import os
import re
from pathlib import Path


def extract_section(text: str, heading: str, next_heading: str | None = None) -> str:
    if next_heading:
        pattern = rf"## {re.escape(heading)}\n\n(.*?)(?=\n## {re.escape(next_heading)}\n|\Z)"
    else:
        pattern = rf"## {re.escape(heading)}\n\n(.*)"
    match = re.search(pattern, text, re.S)
    return match.group(1).strip() if match else ""


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def build_artifact(title: str, input_text: str, kind: str) -> str:
    if kind == "proposal":
        return f"""# {title} - 需求提案

## 摘要

围绕“{title}”梳理需求，输入内容为：{input_text or '暂无明确输入'}。

## 需求要点

- 支持单页 TodoList 的基础交互。
- 允许新增、编辑、完成和删除待办事项。
- 需要有清晰的状态展示与后续扩展入口。

## 风险

- 需求范围过大时，容易把单页应用做成过重的管理后台。
- 未明确数据持久化策略前，可能影响设计收敛。
"""
    if kind == "design":
        return f"""# {title} - 系统设计

## 架构

采用 React 作为 UI 层，围绕单页交互拆分组件。

## 组件建议

- TodoList 入口页
- TodoForm 输入区
- TodoItem 条目
- FilterBar 过滤器

## 数据模型

- id
- title
- completed
- createdAt
"""
    return f"""# {title} - 任务拆解

## 任务列表

- 初始化 React 工程并接入页面路由。
- 实现待办事项新增、编辑、删除和完成切换。
- 增加过滤与空状态展示。
- 补充基础验证与回归检查。
"""


def main() -> None:
    project_root = Path(os.environ.get("COMET_PROJECT_ROOT", Path.cwd().parent)).resolve()
    task = os.environ.get("COMET_TASK", "").strip()
    title = extract_section(task, "项目名称", "任务描述") or "comet-open"
    input_text = extract_section(task, "输入内容", "本命令执行要求")
    summary = f"围绕“{title}”梳理需求，输入内容为：{input_text or '暂无明确输入'}。"
    result = {
        "command": "comet-open",
        "finalResponse": json.dumps(
            {
                "status": "continue",
                "summary": summary,
                "nextCommand": "comet-design",
                "artifacts": ["proposal.md", "design.md", "tasks.md"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        "stdout": "",
        "stderr": "",
        "exitCode": 0,
    }

    write_file(project_root / "proposal.md", build_artifact(title, input_text, "proposal"))
    write_file(project_root / "design.md", build_artifact(title, input_text, "design"))
    write_file(project_root / "tasks.md", build_artifact(title, input_text, "tasks"))
    write_file(
        project_root / "comet-open-result.json",
        json.dumps(result, ensure_ascii=False, indent=2),
    )
    write_file(
        project_root / ".runner" / "comet-result.json",
        json.dumps(result, ensure_ascii=False, indent=2),
    )


def test_tasks() -> None:
    main()
    project_root = Path(os.environ.get("COMET_PROJECT_ROOT", Path.cwd().parent)).resolve()
    assert (project_root / "proposal.md").exists()
    assert (project_root / "design.md").exists()
    assert (project_root / "tasks.md").exists()


if __name__ == "__main__":
    main()
