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

/**
 * Opens a persistent SSE connection to /api/stream and calls `onEvent`
 * whenever the server pushes an event. Auto-reconnects on drop.
 */
export function useSSE(onEvent: SSEHandler) {
  const handlerRef = useRef<SSEHandler>(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
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
        if (!destroyed) {
          // Exponential back-off: 1s → 2s → 4s → … capped at 30s
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect();
          }, retryDelay);
        }
      };

      es.onopen = () => {
        retryDelay = 1000; // reset back-off on successful connect
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []); // intentionally empty — handler updates via ref
}
