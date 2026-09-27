import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestStore {
  requestId: string;
  conversationId?: string;
  sessionId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function updateRequestStore(patch: Partial<RequestStore>): void {
  const store = requestContext.getStore();
  if (!store) return;
  Object.assign(store, patch);
}
