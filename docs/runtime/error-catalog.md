---
title: Runtime Error Catalog
description: Observed Gorkie runtime errors, likely causes, and fixes.
---

# Runtime Error Catalog

This page tracks recent production and dev runtime failures seen in bot logs or Slack UI. Keep entries evidence based. If the same symptom can have multiple causes, list each separately.

## Final Stream Metadata Failed

**Symptom:** The bot visibly replies in Slack, then logs:

```text
[agent] failed to read final stream metadata after text output
finishReason: metadata_unavailable
```

**Observed count:** 14 entries in `apps/bot/logs` on 2026-06-24.

| Count | Cause | Evidence |
| --- | --- | --- |
| 8 | Provider gateway timeout | Hack Club returned a Cloudflare 504 HTML error page after text output had streamed. |
| 4 | Turn interruption | The final metadata read rejected with `Request was aborted`. |
| 1 | Spending limit | Provider returned `429 Daily spending limit of $3 reached`. |
| 1 | Credits or token budget | OpenRouter returned `402 This request requires more credits, or fewer max_tokens`. |

**Why it happens:** `result.stream` can finish enough to render Slack output, but later awaits for `result.text` or `result.finishReason` can still reject while the provider finalizes metadata. After visible output, posting a generic final error is noisy, so the bot logs the failure and records `metadata_unavailable`.

**Implemented behavior:**

1. The bot only swallows the final metadata error after text or progress has streamed.
2. The completion log uses `metadata_unavailable` so it does not look like a model finish reason.
3. Provider 504, 429, and 402 remain separate provider or account failures, not Slack rendering failures.
4. Aborts should be checked against newer messages or stop actions before treating them as bugs.

## Image Generation Failed

**Symptom:** `generateImage` completes with an error, or Slack says image generation failed.

**Observed causes:**

| Cause | Evidence | Fix path |
| --- | --- | --- |
| Gateway timeout | `AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: Gateway Timeout`. | Retry later, improve user-facing error copy, and do not present zero uploads as success. |
| Credits or token budget | `AI_APICallError: This request requires more credits, or fewer max_tokens`. | Fix the provider account limit or route image generation to a provider key with enough credits. |

**Notes:** The 402 is not a local image upload bug. It happens before an image exists.

## Raw Slack Channel Id Passed To Chat Tools

**Symptom:** Tool returns:

```text
Adapter "C0793T42XV4" not found for channel ID "C0793T42XV4"
```

**Cause:** Chat SDK channel ids include the platform prefix, for example `slack:C123456`. A raw Slack channel id like `C123456` is not a Chat SDK id.

**Fix path:**

1. Keep ID format guidance in the global Slack prompt.
2. Keep individual tool fields short, for example `Channel id.`
3. Keep validation errors direct and short.

## Model Not Found

**Symptom:** Attempt fallback logs:

```text
Model minimax/minimax-m3 was not found.
```

**Cause:** The selected provider route did not expose that model id at that moment.

**Fix path:**

1. Check the provider model registry before changing code.
2. Keep fallback order stable unless the provider is consistently broken.
3. If a provider alias changes, update `packages/ai/src/providers/pi.ts` and document the provider-side change.

## Provider Route Missing API Key

**Symptom:** Attempt failure says:

```text
No API key found for nvidia.
```

**Cause:** The provider routed the selected model through Nvidia, but the runtime did not have a matching Nvidia key.

**Fix path:**

1. Treat this as provider route configuration unless local code explicitly selected Nvidia.
2. Either provide the expected key or use a model route backed by configured credentials.
3. Do not confuse this with Slack or sandbox failures.

## Too Much Tool Activity

**Symptom:** Slack UI becomes noisy or fragile when a turn emits many tool and reasoning events. A log or UI summary may show a large activity count.

**Cause:** Reasoning rows were not counted against the same visible activity limit as tool rows, so the UI could exceed the intended 45 visible task cap.

**Fix path:**

1. Count reasoning and tool tasks through the same activity budget.
2. Show one overflow row for hidden activity.
3. Keep the overflow label generic, because it can include reasoning and tools.

## Custom Instructions Follow The Wrong User

**Symptom:** In a shared thread, Gorkie follows the first speaker's saved instructions even after another user pings it.

**Cause:** Per-user customization was embedded in the persisted system prompt for the thread. A later turn by another user could resume the same session with stale user-specific instructions in history.

**Fix path:**

1. Keep global customization behavior rules in the static system prompt.
2. Put only the current speaker's saved customization in a live turn prelude.
3. Tell the model to treat older turn instruction blocks as historical context only.

## Long Running Command Input Missing In UI

**Symptom:** A task row says `Running command`, but the command details are missing or too small to identify the command.

**Likely cause:** Long command inputs, dense comments, or task renderer detail truncation can leave the UI with little useful command text.

**Fix path:**

1. Render command details from the first meaningful non-comment shell lines.
2. Clamp details only after extracting the useful lines.
3. If the UI has an independent input length cutoff, make the cutoff explicit and render a stable summary instead of an empty detail.
