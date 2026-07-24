"use client";

import { useEffect, useRef } from "react";

export type SSEEventType =
  | "message_new"
  | "message_status"
  | "conv_updated"
  | "conv_new";

export interface SSEPayload {
  type:            SSEEventType;
  conversationId?: string;
  waId?:           string;
}

type SSEHandler = (payload: SSEPayload) => void;

const MAX_RETRIES = 8; // stop after ~4 min of retries (1+2+4+8+16+30+30+30s)

/**
 * Opens a persistent SSE connection to /api/stream and calls `onEvent`
 * whenever the server pushes an event. Auto-reconnects on drop with
 * exponential back-off. Stops retrying if the server repeatedly rejects
 * (e.g. session expired — browser reload will remount and restart).
 * Pass `enabled: false` to skip the connection entirely (hooks-safe).
 */
export function useSSE(onEvent: SSEHandler, { enabled = true }: { enabled?: boolean } = {}) {
  const handlerRef = useRef<SSEHandler>(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let retries    = 0;
    let destroyed  = false;

    function connect() {
      if (destroyed) return;
      es = new EventSource("/api/stream");

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as SSEPayload;
          handlerRef.current(payload);
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (destroyed) return;

        retries++;
        if (retries > MAX_RETRIES) {
          // Session likely expired — stop retrying silently.
          // A full page reload (login redirect) will remount and restart.
          return;
        }

        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          connect();
        }, retryDelay);
      };

      es.onopen = () => {
        retryDelay = 1000; // reset back-off on successful connect
        retries    = 0;
      };
    }

    if (enabled) connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // re-run only if enabled changes (e.g. route change)
}
