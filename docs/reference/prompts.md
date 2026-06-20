---
title: Prompts
description: How the system prompt is assembled.
---

`packages/ai/src/prompts/index.ts` builds one system prompt for each turn. The prompt is assembled from small sections and the current request hints.

## Prompt Order

The system prompt is joined in this order:

1. `corePrompt`
2. `personalityPrompt`
3. `sandboxPrompt`
4. `toolsPrompt`
5. `contextPrompt(hints)`
6. `customizationPrompt(hints)`

Later sections can add more specific context, but they should not fight earlier hard rules.

## Core

`corePrompt` defines Gorkie's identity, Slack output rules, important limitations, media handling, and safety floor.

The most important output rule is simple: the text the model writes is the Slack reply. There is no separate send step for the current response.

## Personality

`personalityPrompt` gives the default voice. It is only the default. User customizations from App Home override it when they are present and safe.

## Sandbox

`sandboxPrompt` explains the persistent E2B Linux workspace. It tells the model to use the sandbox for code, file work, data work, public URL processing, and verification.

## Tools

`toolsPrompt` describes the host tools: Slack reads, Slack writes, web search, images, diagrams, uploads, reminders, and skip behavior.

Tool descriptions in code still matter. The prompt gives the overall policy; each tool schema gives the exact input shape.

## Context

`contextPrompt(hints)` adds the current time, workspace, channel, thread id, channel id, message id, and source repository link.

It also tells the model to fetch earlier Slack context with tools instead of pretending it already saw the whole channel or workspace.

## Customization

`customizationPrompt(hints)` injects the user's saved App Home instructions when they exist.

Custom instructions are treated as the user's persistent preference for tone, brevity, formatting, language, or address style. They still cannot override safety requirements or hard system constraints.

## Request Hints

`apps/bot/src/lib/ai/hints.ts` builds the request hints before a turn starts. It resolves Slack channel/server names, loads user customization, and adds the current message/thread identifiers.
