import { AsyncLocalStorage } from 'async_hooks';

interface RequestStore {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestStore>();

export function withRequestContext<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}

export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
