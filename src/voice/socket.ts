export function socketDataToString(data: unknown): Promise<string> {
  if (typeof data === "string") return Promise.resolve(data);
  if (Buffer.isBuffer(data)) return Promise.resolve(data.toString("utf8"));
  if (data instanceof ArrayBuffer) return Promise.resolve(Buffer.from(data).toString("utf8"));
  if (ArrayBuffer.isView(data)) {
    return Promise.resolve(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8"));
  }
  if (data && typeof data === "object" && "text" in data && typeof data.text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }
  return Promise.resolve(String(data));
}

export function openWebSocket(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  onMessage?: (data: unknown) => void,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const Socket = WebSocket as unknown as new (
      url: string,
      options?: { headers?: Record<string, string> },
    ) => WebSocket;
    const socket = new Socket(url, { headers });
    if (onMessage) {
      socket.addEventListener("message", (event) => onMessage(event.data));
    }
    const fail = (error: Error) => {
      cleanup();
      socket.close();
      reject(error);
    };
    const onOpen = () => {
      cleanup();
      resolve(socket);
    };
    const onError = () => fail(new Error("WebSocket connection failed"));
    const onAbort = () => fail(abortError());
    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
