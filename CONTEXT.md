# Gorkie Slack Bot — MCP Feature

A Slack bot that lets users connect Model Context Protocol (MCP) servers and use their tools within AI-assisted conversations.

## Language

### Servers & Connections

**MCP Server**:
A per-user configuration record that names a remote MCP endpoint: its URL, transport type, and auth method. One user can add the same URL as a separate record from another user — there is no workspace-shared server.
_Avoid_: Integration, plugin, service

### Approvals

**Approval**:
A paused tool call waiting for the user's decision. Posted as a card to the Slack thread when a tool's mode is `ask`. The AI response does not resume until every Approval in the same Batch is resolved.
_Avoid_: Permission request, tool request

**Batch**:
The set of Approvals created in the same AI response turn, identified by a shared `(channelId, threadTs, eventTs)`. All must be resolved — allowed or denied — before the response resumes.
_Avoid_: Group, set

**Allow Once**:
An approval decision that executes the tool this time only. Does not change the tool's stored mode.
_Avoid_: Approve once

**Allow for Thread**:
An approval decision that executes the tool and sets its mode to `allow` scoped to the current thread. Future calls to the same tool in this thread run automatically.
_Avoid_: Approve for thread

### Tool Permissions

**Tool Mode**:
The per-tool, per-user policy that governs whether a tool runs automatically, requires explicit approval, or is refused. One of `allow`, `ask`, or `block`. Stored in `mcp_tool_modes`.
_Avoid_: Permission, permission level, setting

**Allow**:
A Tool Mode that lets the tool run automatically without interrupting the conversation.

**Ask**:
A Tool Mode that pauses the entire AI response and posts an Approval card to the thread. The AI does not continue until the user responds.
_Avoid_: Pending, awaiting

**Block**:
A Tool Mode that refuses the tool outright — it is never executed, not even with user approval. Block at global scope overrides any thread-scoped setting.
_Avoid_: Denied, forbidden

**Scope**:
The context in which a Tool Mode applies. `global` applies across all threads for that server+user. `thread` applies only within one Slack thread and takes precedence over global, except when global is `block`.
_Avoid_: Level, layer

**Effective Mode**:
The resolved Tool Mode for a specific tool call: global `block` wins unconditionally; otherwise the thread-scoped mode wins if set; otherwise the global mode applies; otherwise the configured default (`ask`).
_Avoid_: Resolved mode, active mode

**Superseded**:
The status assigned to a pending Approval when a new AI response begins in the same thread. The paused context it references is stale and will never be resumed.
_Avoid_: Cancelled, expired

**Connection**:
The stored credentials (bearer token or OAuth tokens) that authorise a user's MCP Server. A server has a connection when credentials are present; losing a connection (on auth failure) disables the server and wipes the credentials.
_Avoid_: Auth, credential pair

**Connected**:
A server that has a Connection and is enabled — actively usable in conversations.

**Disabled**:
A server whose Connection is intact but which the user has manually paused. Credentials are not wiped; re-enabling requires no new credentials.
_Avoid_: Inactive, off

**Disconnected**:
A server with no Connection — either it has never been connected or its credentials were deleted after a failed connection attempt. Requires re-entering credentials to use.
_Avoid_: Failed, broken

