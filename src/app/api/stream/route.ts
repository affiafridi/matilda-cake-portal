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
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
    if (pgClient) {
      pgClient.query("UNLISTEN portal_events").catch(() => {});
      pgClient.end().catch(() => {});
      pgClient = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        if (!closed) {
          try { controller.enqueue(enc.encode(data)); } catch { /* stream closed */ }
        }
      };

      // Keep-alive comment every 25 s (Cloud Run times out idle connections at 60 s)
      heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000);

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
          cleanup();
          try { controller.close(); } catch { /* ok */ }
        });
      } catch (err) {
        console.error("[stream] pg connect error:", err);
        cleanup();
        try { controller.close(); } catch { /* ok */ }
      }
    },

    // Called when the browser disconnects or the response is garbage-collected
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
