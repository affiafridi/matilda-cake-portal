import { Client } from "pg";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  // Keep a local ref so cancel() can reach the client even if pgClient outer var is nulled mid-connect
  let activeClient: Client | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
    if (activeClient) {
      activeClient.query("UNLISTEN portal_events").catch(() => {});
      activeClient.end().catch(() => {});
      activeClient = null;
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

      heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000);

      // Use a local const to avoid the race where cancel() nulls activeClient
      // between assignment and connect() resolving
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      activeClient = client;

      try {
        await client.connect();
        // If cancel() fired during connect(), bail out cleanly
        if (closed) { client.end().catch(() => {}); return; }

        await client.query("LISTEN portal_events");

        client.on("notification", (msg) => {
          if (msg.channel === "portal_events" && msg.payload) {
            send(`data: ${msg.payload}\n\n`);
          }
        });

        client.on("error", (err) => {
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
