# Codex crawler error artifact handling

## Goal

When a Codex-SDK-directed DeepSeek crawl cannot be completed, require the agent to leave machine-readable error evidence in the dynamically created run directory.

## Design

`buildCrawlerPrompt()` will instruct Codex to obtain the actual `playwright-exec/run-*` directory created by the current `./run.sh` invocation from its output. It must not use a timestamped directory from a previous run.

If an error cannot be resolved within the crawler task, Codex must update that run directory's existing `summary.json` without discarding existing fields or successful results. The summary will identify the failed result with status `error` and a diagnostic error reason.

Codex must copy any error screenshot it creates into the same `run-*` directory root so consumers can locate it alongside `summary.json`.

## Verification

Add a focused unit test for the generated SDK prompt. It will require the prompt to mention discovery of the current dynamic run directory, error status and reason in its `summary.json`, preservation of existing summary data, and copying error screenshots to the run-directory root.
