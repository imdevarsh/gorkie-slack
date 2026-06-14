// Small stream adapters between e2b's byte/text I/O and the harness sandbox
// session's ReadableStream surface.

export async function collectStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export interface TextStream {
  close: () => void;
  error: (error: unknown) => void;
  readable: ReadableStream<Uint8Array>;
  write: (chunk: string) => void;
}

export function streamFromText(): TextStream {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const pending: Uint8Array[] = [];
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start: (nextController) => {
      controller = nextController;
      for (const chunk of pending.splice(0)) {
        controller.enqueue(chunk);
      }
      if (closed) {
        controller.close();
      }
    },
  });

  return {
    readable,
    write: (chunk) => {
      if (closed) {
        return;
      }
      const encoded = encoder.encode(chunk);
      if (controller) {
        controller.enqueue(encoded);
        return;
      }
      pending.push(encoded);
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      controller?.close();
    },
    error: (error) => {
      if (closed) {
        return;
      }
      closed = true;
      controller?.error(error);
    },
  };
}
