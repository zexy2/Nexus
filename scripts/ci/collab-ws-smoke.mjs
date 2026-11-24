// CI smoke for the collaboration image: opens an authorised Yjs websocket for
// an existing document and waits for the server's first sync message. That
// proves the bundled server verified the token, hydrated the document from
// Postgres (drizzle + postgres inside the bundle) and speaks the y-protocols
// wire format. Uses only Node built-ins (global WebSocket, Node >= 22).
//
// Env: COLLAB_URL (ws://host:1234), COLLAB_AUTH_SECRET, DOC_ID.
import { createHmac } from "node:crypto";

const url = process.env.COLLAB_URL || "ws://127.0.0.1:1234";
const secret = process.env.COLLAB_AUTH_SECRET;
const docId = process.env.DOC_ID;
if (!secret || !docId) throw new Error("COLLAB_AUTH_SECRET and DOC_ID are required");

// Same format as apps/web/src/lib/collab-token.ts.
const body = Buffer.from(
  JSON.stringify({ d: docId, u: "ci-smoke", e: Date.now() + 60_000 })
).toString("base64url");
const token = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;

function connect(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target);
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timed out waiting for a sync message"));
    }, 10_000);
    ws.addEventListener("message", (event) => {
      clearTimeout(timer);
      const bytes = new Uint8Array(event.data);
      ws.close();
      resolve(bytes);
    });
    ws.addEventListener("close", (event) => {
      clearTimeout(timer);
      reject(new Error(`closed before sync: ${event.code} ${event.reason}`));
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    });
  });
}

// An unauthorised upgrade must be refused.
const refused = await connect(`${url}/${docId}?token=invalid`).then(
  () => false,
  () => true
);
if (!refused) throw new Error("unauthorised connection was accepted");
console.log("unauthorised connection refused: ok");

const message = await connect(`${url}/${docId}?token=${encodeURIComponent(token)}`);
// y-protocols: message type 0 = sync.
if (message[0] !== 0) throw new Error(`unexpected first message type ${message[0]}`);
console.log(`authorised sync message received (${message.length} bytes): ok`);
