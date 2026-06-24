export interface SandboxContext {
  session: {
    readBinaryFile(input: { path: string }): PromiseLike<Uint8Array | null>;
    writeBinaryFile(input: {
      content: Uint8Array;
      path: string;
    }): PromiseLike<void>;
    run(input: {
      command: string;
      env?: Record<string, string>;
      workingDirectory?: string;
    }): PromiseLike<{ exitCode: number; stderr: string; stdout: string }>;
  };
  sessionWorkDir: string;
}
