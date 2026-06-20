---
title: Architecture
description: System boundaries, request flow, and package ownership.
---

Gorkie has three major runtime pieces: Slack, the agent, and the sandbox.

Slack is the interface. The agent is the brain. The sandbox is the workspace.

## Mental Model

Pi is created by the bot process through AI SDK Harness. It is not a daemon inside E2B. When Pi reads a file, writes a file, edits code, or runs a shell command, the Harness/Pi adapter forwards that operation to the sandbox session.

That split keeps secrets on the host and keeps execution isolated:

- model provider keys stay in the bot process;
- Slack tokens stay in the bot process;
- host tools can call Slack, Exa, image generation, and file upload APIs directly;
- E2B only handles filesystem and command execution;
- a missing or stale sandbox can be recreated without changing Slack routing.

```mermaid
flowchart TB
  subgraph Slack["Slack workspace"]
    Message["Mention, DM, assistant thread, or subscribed reply"]
    Action["Stop button and App Home actions"]
  end

  subgraph Bot["apps/bot"]
    Chat["Chat SDK instance"]
    Router["Slack routing"]
    Turn["turn runner"]
    Stream["Slack output"]
    HostTools["host tools"]
  end

  subgraph Agent["packages/ai"]
    Harness["HarnessAgent"]
    Pi["Pi adapter"]
    Prompt["system prompt"]
    Session["session open/persist"]
  end

  subgraph Sandbox["packages/sandbox + E2B"]
    Provider["E2B provider"]
    Workspace["Linux workspace"]
    Skills["materialized skills"]
  end

  subgraph Data["packages/db"]
    ChatState["Chat SDK state"]
    SandboxRows["sandbox_sessions"]
    Customizations["user customizations"]
  end

  Message --> Chat --> Router --> Turn
  Action --> Router
  Turn --> Harness --> Pi
  Prompt --> Harness
  Session --> SandboxRows
  Pi --> Provider --> Workspace
  Harness --> HostTools
  Turn --> Stream --> Slack
  Chat --> ChatState
  Router --> Customizations
  Skills --> Pi
```

## Turn Flow

```mermaid
sequenceDiagram
  participant Slack
  participant Chat as Chat SDK
  participant Bot as apps/bot
  participant Agent as HarnessAgent/Pi
  participant E2B as E2B
  participant DB as Postgres

  Slack->>Chat: message event
  Chat->>Bot: normalized Thread and Message
  Bot->>Bot: route and ignore checks
  Bot->>DB: load state and resume data
  Bot->>E2B: create or resume sandbox
  Bot->>Agent: create session
  Agent->>E2B: run file and shell tools
  Agent->>Bot: text, reasoning, tool events
  Bot->>Slack: replies and task rows
  Bot->>Agent: detach session
  Bot->>DB: store resume state and session mirror
  Bot->>E2B: pause sandbox
```

## Package Ownership

`apps/bot` owns Slack runtime behavior: adapter setup, routing, App Home, stop controls, line replies, Chat SDK tool selection, bot-owned tools, and turn orchestration.

`packages/ai` owns platform-neutral agent setup: HarnessAgent creation, Pi creation, prompts, model attempts, and session persistence.

`packages/sandbox` owns the E2B Harness sandbox provider, E2B session adapter, template build, and vendored skill loading.

`packages/db` owns the Drizzle schema, Postgres client, and queries.

## Code Map

| Area | Files |
| --- | --- |
| Slack event routing | `apps/bot/src/bot.ts` |
| Chat SDK setup | `apps/bot/src/lib/chat.ts` |
| Turn orchestration | `apps/bot/src/lib/agent/index.ts` |
| Turn interruption and stop controls | `apps/bot/src/lib/agent/steering.ts`, `apps/bot/src/lib/agent/controls.ts` |
| Slack reply chunking | `apps/bot/src/lib/agent/line-reply.ts` |
| Stream and task rendering | `apps/bot/src/lib/ai/stream/**` |
| Host tools | `apps/bot/src/lib/ai/tools/**`, `apps/bot/src/lib/ai/toolset.ts` |
| Agent construction | `packages/ai/src/agent.ts` |
| Prompts and request hints | `packages/ai/src/prompts/**`, `apps/bot/src/lib/ai/hints.ts` |
| Session persistence | `packages/ai/src/sessions.ts`, `packages/ai/src/files/**` |
| E2B provider | `packages/sandbox/src/**` |
| Database schema and queries | `packages/db/src/**` |

## Hard Boundaries

- Do not put Slack-only behavior in `packages/ai`.
- Do not put model keys, Slack tokens, or future MCP secrets in the sandbox.
- Do not make Slack transcript storage the agent memory. Harness/Pi session history is the durable agent history.
- Do not add a new abstraction unless it removes real complexity.
