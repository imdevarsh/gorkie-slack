---
title: Prompts
description: How the system prompt is assembled.
---

`packages/ai/src/prompts/index.ts` builds one system prompt for each turn. The prompt is assembled from small sections and the current request hints.

## Prompt Order

The system prompt is joined in this order:

1. [Core](#core)
2. [Personality](#personality)
3. [Sandbox](#sandbox)
4. [Tools](#tools)
5. [Context](#context)
6. [Customization](#customization)

Later sections can add more specific context, but they should not fight earlier hard rules.

## Core

Core defines Gorkie's identity, Slack output rules, important limitations, media handling, and safety floor.

The most important output rule is simple: the text the model writes is the Slack reply. There is no separate send step for the current response.

## Personality

Personality gives the default voice. It is only the default. User customizations from App Home override it when they are present and safe.

## Sandbox

Sandbox explains the persistent E2B Linux workspace. It tells the model to use the sandbox for code, file work, data work, public URL processing, and verification.

## Tools

Tools describes the host tools: Slack reads, Slack writes, web search, images, diagrams, uploads, reminders, and skip behavior.

Tool descriptions in code still matter. The prompt gives the overall policy; each tool schema gives the exact input shape.

## Context

Context adds the current time, workspace, channel, thread id, channel id, message id, and source repository link.

It also tells the model to fetch earlier Slack context with tools instead of pretending it already saw the whole channel or workspace.

## Customization

Customization injects the user's saved App Home instructions when they exist.

Custom instructions are treated as the user's persistent preference for tone, brevity, formatting, language, or address style. They still cannot override safety requirements or hard system constraints.

## Request Hints

`apps/bot/src/lib/ai/hints.ts` builds the request hints before a turn starts. It resolves Slack channel/server names, loads user customization, and adds the current message/thread identifiers.

## Implementation Map

| Prompt section | File |
| --- | --- |
| Core | `packages/ai/src/prompts/core.ts` |
| Personality | `packages/ai/src/prompts/personality.ts` |
| Sandbox | `packages/ai/src/prompts/sandbox.ts` |
| Tools | `packages/ai/src/prompts/tools.ts` |
| Context | `packages/ai/src/prompts/context.ts` |
| Customization | `packages/ai/src/prompts/customization.ts` |
| Assembly | `packages/ai/src/prompts/index.ts` |
