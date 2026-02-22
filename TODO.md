# TODO

- Audit security: authentication boundaries, data access, and tool permissions.
- Check With User DMs
- Fix ratelimiting
- fix lint
- TODO: Langfuse shows daytona tools run in sandbox tool? it is very cursed
- TODO: Test multiple prompt / queue
- TODO: Test if it self-timeouts without interaction
- TODO: re-eval pricing
- TODO: add observability and better logging sandbox
- add a path function to join paths rather than ${config.runtime.workdir}/xyz
- remove unused unwanted db fields
- Use typed ACP event schemas instead of manual casting in events.ts
- Fix updateStatus to not clear historical timestamps
- Delete unused getSandbox() and reconnectSandbox() exports
- Status update logic is half broken lol, fix that and cleanup RPC code, support custom mcps
- extend / bump timeouts tus: "is creating assets and rendering video"
[2026-02-22 18:27:47.441 +0000] ERROR: [C0AGZCRSTCY:1771784425.830749] [sandbox] Sandbox run failed
    task: "1. Initialize a new directory 'dog-jump-video'.\n2. Download a transparent dog PNG from 'https://static.vecteezy.com/system/resources/previews/020/899/519/non_2x/happy-dog-transparent-background-png.png' as 'dog.png'.\n3. Download a plop sound effect from 'https://www.myinstants.com/media/sounds/plop_1.mp3' as 'plop.mp3'.\n4. Setup a basic Remotion project (installing remotion, @remotion/cli, etc.).\n5. Create a Remotion composition 'DogJump':\n   - Background: Sky (blue), Land (green rectangle on the left, full height), Water (blue/cyan rectangle on the right, full height).\n   - Dog (dog.png):\n     - Starts at x= -200, y= middle.\n     - Walks (animates x) from left to the edge of the land.\n     - Jumps (animates x and y in a parabola) into the water.\n     - Audio: Trigger 'plop.mp3' when the dog hits the water (at the end of the jump).\n6. Render the composition to 'output/dog_jump.mp4' using remotion cli.\n7. Upload 'output/dog_jump.mp4' to Slack using showFile.\nIf 'npx skills add remotion-dev/skills' works, use it, otherwise just build it with standard Remotion."
    message: "[pi-rpc] Timeout waiting for agent_end (60000ms)"
    err: {
      "type": "Error",
      "message": "[pi-rpc] Timeout waiting for agent_end (60000ms)",
      "stack":
          Error: [pi-rpc] Timeout waiting for agent_end (60000ms)
              at <anonymous> (/workspaces/gorkie-slack/server/lib/sandbox/rpc.ts:264:15)
    }