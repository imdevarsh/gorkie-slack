export interface SandboxContext {
  session: {
    readBinaryFile(input: { path: string }): PromiseLike<Uint8Array | null>;
    writeBinaryFile(input: {
      content: Uint8Array;
      path: string;
    }): PromiseLike<void>;
  };
  sessionWorkDir: string;
}
