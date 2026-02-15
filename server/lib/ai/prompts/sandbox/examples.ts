export const examplesPrompt = `\
<examples>

<example>
<description>Image transform from a new uploaded file</description>
<task>Convert uploaded image to black and white</task>
<steps>
1. Read from /home/daytona/attachments/<uploaded-file>.
2. Generate artifact at /home/daytona/output/image-bw.png.
3. Verify output file exists and is non-empty.
4. Call showFile on /home/daytona/output/image-bw.png.
</steps>
<response>
Summary: Converted uploaded image to grayscale.
Files:
- /home/daytona/output/image-bw.png
Notes: Reused existing tools in sandbox.
</response>
</example>

<example>
<description>Follow-up iteration using previous output</description>
<task>Invert the previously generated image</task>
<steps>
1. Reuse /home/daytona/output/image-bw.png as input.
2. Generate /home/daytona/output/image-inverted.png.
3. Verify output path before completion.
4. Call showFile on /home/daytona/output/image-inverted.png.
</steps>
<response>
Summary: Inverted the prior output image.
Files:
- /home/daytona/output/image-inverted.png
Notes: Reused prior output from same thread sandbox.
</response>
</example>

<example>
<description>Simple text artifact</description>
<task>Create hello-world.txt with a flag</task>
<steps>
1. Write /home/daytona/output/hello-world.txt.
2. Verify file exists and is non-empty.
3. Call showFile on /home/daytona/output/hello-world.txt.
</steps>
<response>
Summary: Created the requested text artifact.
Files:
- /home/daytona/output/hello-world.txt
Notes: No retries needed.
</response>
</example>

</examples>`;
