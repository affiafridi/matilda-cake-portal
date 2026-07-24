/**
 * GET /api/stream
 *
 * Server-Sent Events endpoint. Each authenticated client holds one
 * long-lived connection here. When any server route calls pgNotify(),
 * Postgres broadcasts to all connected pg clients which then push the
 * event to their SSE response stream.
 *
 * Event shape sent to browser:
 *   data: {"type":"message_new","conversationId":"...","waId":"..."}
 *
 * The browser-side hook (useSSE) listens and triggers refetches.
 */
import { Client } from "pg";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let pgClient: Client | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send an initial heartbeat so the browser knows the connection is live
      const enc = new TextEncoder();
      const send = (data: string) => {
        if (!closed) {
          try { controller.enqueue(enc.encode(data)); } catch { /* stream closed */ }
        }
      };

      // Keep-alive comment every 25 s (Cloud Run times out idle connections at 60 s)
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000);

      // Open a dedicated pg connection for LISTEN (cannot use the shared pool)
      pgClient = new Client({ connectionString: process.env.DATABASE_URL });
      try {
        await pgClient.connect();
        await pgClient.query("LISTEN portal_events");

        pgClient.on("notification", (msg) => {
          if (msg.channel === "portal_events" && msg.payload) {
            send(`data: ${msg.payload}\n\n`);
          }
        });

        pgClient.on("error", (err) => {
          console.error("[stream] pg error:", err.message);
          clearInterval(heartbeat);
          if (!closed) { closed = true; try { controller.close(); } catch { /* ok */ } }
        });
      } catch (err) {
        console.error("[stream] pg connect error:", err);
        clearInterval(heartbeat);
        closed = true;
        try { controller.close(); } catch { /* ok */ }
      }

      // Cleanup when the browser disconnects
      return () => {
        closed = true;
        clearInterval(heartbeat);
        if (pgClient) {
          pgClient.query("UNLISTEN portal_events").catch(() => {});
          pgClient.end().catch(() => {});
          pgClient = null;
        }
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/proxy buffering
    },
  });
}
