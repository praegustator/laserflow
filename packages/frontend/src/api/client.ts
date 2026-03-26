import { getBackendUrl, getWsUrl } from '../store/appSettingsStore';

export const api = {
  get: (path: string) =>
    fetch(`${getBackendUrl()}${path}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  post: (path: string, body?: unknown) =>
    fetch(`${getBackendUrl()}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  postForm: (path: string, form: FormData) =>
    fetch(`${getBackendUrl()}${path}`, {
      method: 'POST',
      body: form,
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  delete: (path: string) =>
    fetch(`${getBackendUrl()}${path}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
    }),
  patch: (path: string, body?: unknown) =>
    fetch(`${getBackendUrl()}${path}`, {
      method: 'PATCH',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
};

export function createWebSocket(
  onMessage: (event: MessageEvent) => void,
  onOpen?: () => void,
  onClose?: () => void,
): WebSocket {
  const ws = new WebSocket(getWsUrl());
  ws.onmessage = onMessage;
  if (onOpen) ws.onopen = onOpen;
  if (onClose) ws.onclose = onClose;
  return ws;
}

