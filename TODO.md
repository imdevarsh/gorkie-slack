# TODO

- Audit security: authentication boundaries, data access, and tool permissions.
- Revisit why `sandboxId` is stored in Redis with TTL 10 minutes; confirm necessity or adjust.
- take a look at opencode, and it's tools https://github.com/anomalyco/opencode see what we wanna add to agent
- Check With User DMs
- Fix ratelimiting
- fix lint
- it shows restoring sandbox even when it's not for a split second
- enforce gorkie to SEND THE ENTIRE PROMPT to the sandbox agent not split it into smaller bits
- add is thinking tool on prepareStep / tool finish because when it's writing huge files it's stuck at the previous tool
> 
    status: "is retrying paste.rs"
[ERROR]  bolt-app 42 | exports.UnknownError = UnknownError;
43 | function asCodedError(error) {
44 |     if (error.code !== undefined) {
45 |         return error;
46 |     }
47 |     return new UnknownError(error);
                ^
error: Task timed out after 300000ms (queue has 1 running, 0 waiting)
     code: "slack_bolt_unknown_error"

      at asCodedError (/workspaces/gorkie-slack/node_modules/@slack/bolt/dist/errors.js:47:12)
      at handleError (/workspaces/gorkie-slack/node_modules/@slack/bolt/dist/App.js:707:46)

46 |            if (milliseconds === Number.POSITIVE_INFINITY) {
47 |                    return;
48 |            }
49 | 
50 |            // We create the error outside of `setTimeout` to preserve the stack trace.
51 |            const timeoutError = new TimeoutError();
                            ^
TimeoutError: Task timed out after 300000ms (queue has 1 running, 0 waiting)
      at /workspaces/gorkie-slack/node_modules/p-timeout/index.js:51:24
      at Promise (unknown:1:11)
      at pTimeout (/workspaces/gorkie-slack/node_modules/p-timeout/index.js:46:24)
      at /workspaces/gorkie-slack/node_modules/p-queue/dist/index.js:617:10
      at #tryToStartAnother (/workspaces/gorkie-slack/node_modules/p-queue/dist/index.js:375:31)
      at /workspaces/gorkie-slack/node_modules/p-queue/dist/index.js:660:15
      at Promise (unknown:1:11)
      at add (/workspaces/gorkie-slack/node_modules/p-queue/dist/index.js:568:20)
      at execute (/workspaces/gorkie-slack/server/slack/events/message-create/index.ts:184:32)
      at processTicksAndRejections (unknown:7:39)

[ERROR]   An unhandled error occurred while Bolt processed (type: event_callback, error: Error: Task timed out after 300000ms (queue has 1 running, 0 waiting))
[2026-02-10 17:27:14.440 +0000] DEBUG: Sandbox command result
- the AI still doesn't know how to use the glob tool and/or messes up thinking the file is 404
- todo: the sandbox sometimes might timeout and the snapshot might not be saved
- todo: the snapshot fails to delete sometimes?
