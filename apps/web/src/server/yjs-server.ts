/**
 * Simple Yjs WebSocket Server
 * 
 * A lightweight WebSocket server for real-time collaboration using y-websocket.
 * Run with: pnpm collab:simple or node --experimental-strip-types src/server/yjs-server.ts
 */

import { WebSocketServer, type WebSocket as WSType } from "ws";
import http, { type IncomingMessage, type ServerResponse } from "http";
import { setupWSConnection } from "y-websocket/bin/utils";

const PORT = parseInt(process.env.COLLABORATION_PORT || "1234", 10);
const HOST = process.env.COLLABORATION_HOST || "0.0.0.0";

// Create HTTP server
const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("Nexus Collaboration Server\n");
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (conn: WSType, req: IncomingMessage) => {
  const docName = req.url?.slice(1) || "default";
  console.log(`[Yjs] New connection for document: ${docName}`);
  
  setupWSConnection(conn, req, { docName });
  
  conn.on("close", () => {
    console.log(`[Yjs] Connection closed for document: ${docName}`);
  });
});

// Connection tracking
const connectedClients = new Map<string, Set<WSType>>();

wss.on("connection", (ws: WSType, req: IncomingMessage) => {
  const docName = req.url?.slice(1) || "default";
  
  if (!connectedClients.has(docName)) {
    connectedClients.set(docName, new Set());
  }
  connectedClients.get(docName)!.add(ws);
  
  console.log(`[Yjs] Clients on ${docName}: ${connectedClients.get(docName)!.size}`);
  
  ws.on("close", () => {
    connectedClients.get(docName)?.delete(ws);
    console.log(`[Yjs] Clients on ${docName}: ${connectedClients.get(docName)?.size || 0}`);
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🔄 Nexus Collaboration Server                        ║
║                                                       ║
║  WebSocket: ws://${HOST}:${PORT}                           ║
║  Status: Running                                      ║
║                                                       ║
║  Ready for real-time collaboration!                   ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Yjs] Shutting down...");
  wss.close();
  server.close();
  process.exit(0);
});
