/**
 * Thin wrapper around pg NOTIFY so any server route can broadcast
 * a real-time event to all connected SSE clients.
 *
 * Channel: "portal_events"
 * Payload: JSON string  { type, conversationId?, waId? }
 */
import { Pool } from "pg";

// One shared pool just for NOTIFY calls — lightweight, one connection max.
let notifyPool: Pool | null = null;
function getPool() {
  if (!notifyPool) {
    notifyPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  }
  return notifyPool;
}

export type SSEEventType =
  | "message_new"        // new inbound or outbound message
  | "message_status"     // delivery/read receipt updated
  | "conv_updated"       // conversation metadata changed (status, assignedTo, unread …)
  | "conv_new";          // brand-new conversation created

export interface SSEPayload {
  type:            SSEEventType;
  conversationId?: string;
  waId?:           string;
}

export async function pgNotify(payload: SSEPayload): Promise<void> {
  try {
    const pool   = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `SELECT pg_notify('portal_events', $1)`,
        [JSON.stringify(payload)],
      );
    } finally {
      client.release();
    }
  } catch (e) {
    // Never crash a webhook because a notify failed
    console.error("[sse-notify] pg_notify error:", e);
  }
}
