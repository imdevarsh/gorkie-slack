# Gorkie

Gorkie is an AI assistant for Slack conversations. This glossary defines the domain language used when discussing its agent runtime and Slack behavior.

## Language

**Agent Thread**:
A conversation-scoped unit of agent memory and sandbox continuity. In Slack, it corresponds to one Slack thread or DM conversation and owns exactly one Pi session history.
_Avoid_: Conversation, session, Slack thread when discussing agent memory.

**Acting User**:
The user whose message triggered the current agent turn. Their custom instructions, future BYOK credentials, and future MCP connections shape that turn.
_Avoid_: Replying user, recipient, requester when discussing credential ownership.

**Agent Thread Memory**:
The shared memory of an Agent Thread, built from visible conversation context and prior agent work. It must not silently absorb private user context that other users are not allowed to access.
_Avoid_: Chat history, transcript when discussing the durable shared memory boundary.

**Private User Context**:
User-scoped information that may shape a turn for the Acting User but is not automatically shared with other participants in the Agent Thread. This includes custom instructions, future BYOK credentials, and future MCP-connected data.
_Avoid_: Personalization, user settings when discussing privacy boundaries.

**Custom Instructions**:
Acting User preferences that may shape an Agent Turn's style, priorities, and working approach. The raw instruction text is Private User Context; in shared Agent Threads, its use should be disclosed and must not override another user's authority or privacy.
_Avoid_: System prompt, personalization when discussing user-authored preferences.

**Private Tool Result**:
A tool result produced from Private User Context. It may inform the Acting User's current turn, but it must not become shared Agent Thread Memory unless it is intentionally made visible to the thread participants.
_Avoid_: Tool output, MCP result when discussing privacy boundaries.

**Agent Turn**:
One execution of Gorkie triggered by an Acting User message within an Agent Thread. It may stream a response, call tools, update Agent Thread Memory, and then end, stop, or be interrupted.
_Avoid_: Run, request, invocation when discussing user-visible agent execution.

**Turn Interruption**:
The replacement of an active Agent Turn by newer Acting User messages in the same Agent Thread. The interrupted turn is persisted, then all interrupting messages start the next Agent Turn in arrival order.
_Avoid_: Steering, follow-up, queueing when discussing replacement behavior.

**Interruption Batch**:
The ordered set of Acting User messages that arrive while an Agent Turn is being interrupted. An Interruption Batch starts one combined follow-up Agent Turn, not one Agent Turn per message.
_Avoid_: Pending message, latest message when discussing interrupted-turn follow-ups.

**Agent Sandbox**:
The ephemeral working environment attached to an Agent Thread for filesystem and shell work. It is always present for the Agent Thread, even when an Agent Turn does not need workspace work; Pi runs outside it. Agent Thread Memory may survive sandbox loss, but sandbox files are not durable unless explicitly persisted.
_Avoid_: Agent brain, runtime, VM when discussing where Pi thinks and decides.

**Sandbox Artifact**:
A file or generated output created inside the Agent Sandbox. It is ephemeral unless explicitly persisted or shared outside the Agent Sandbox.
_Avoid_: File, output when discussing durability expectations.

**Speaker Label**:
A human-facing name attached to a message in model-facing context when multiple people may be speaking in the same Agent Thread. Speaker Labels let Gorkie distinguish who said what without exposing platform-specific identifiers.
_Avoid_: User ID, display name when discussing model-facing participant identity.

**Fallback Speaker Label**:
A stable anonymized Speaker Label used when a person's human-facing name cannot be resolved. It preserves participant distinction without exposing platform-specific identifiers.
_Avoid_: Raw platform IDs in model-facing context.
