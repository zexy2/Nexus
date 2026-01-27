/**
 * Y-WebSocket Collaboration Server
 * 
 * Standard WebSocket server for real-time document collaboration using Yjs.
 * Implements the standard y-websocket protocol using y-protocols.
 * Run with: pnpm collab
 */

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = parseInt(process.env.COLLABORATION_PORT || "1234", 10);
const HOST = process.env.COLLABORATION_HOST || 'localhost';

const messageSync = 0;
const messageAwareness = 1;

// Store documents in memory
const docs = new Map<string, WSSharedDoc>();

// Document cleanup timeouts (keep docs for 5 minutes after last client leaves)
const docCleanupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const DOC_CLEANUP_DELAY = 5 * 60 * 1000; // 5 minutes

class WSSharedDoc extends Y.Doc {
  name: string;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.conns = new Map();

    const awarenessChangeHandler = ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, _origin: unknown) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = encoding.toUint8Array(encoder);
      
      this.conns.forEach((_, conn) => {
        send(this, conn, buff);
      });
    };
    
    this.awareness.on('update', awarenessChangeHandler);
    
    this.on('update', (update: Uint8Array, _origin: unknown, _doc: Y.Doc) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        const buff = encoding.toUint8Array(encoder);
        
        this.conns.forEach((_, conn) => {
            if (origin !== conn) {
                send(this, conn, buff);
            }
        });
    });
  }
}

function getYDoc(docname: string, gc = true): WSSharedDoc {
    // Cancel any pending cleanup
    const existingTimeout = docCleanupTimeouts.get(docname);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        docCleanupTimeouts.delete(docname);
        console.log(`[Collab] Cancelled cleanup for: ${docname}`);
    }
    
    let doc = docs.get(docname);
    if (doc === undefined) {
        doc = new WSSharedDoc(docname);
        doc.gc = gc;
        docs.set(docname, doc);
        console.log(`[Collab] Created document: ${docname}`);
    }
    return doc;
}

function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array) {
    if (conn.readyState !== WebSocket.OPEN) {
        closeConn(doc, conn);
        return;
    }
    try {
        conn.send(m);
    } catch {
        closeConn(doc, conn);
    }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
    if (doc.conns.has(conn)) {
        const controlledIds = doc.conns.get(conn);
        doc.conns.delete(conn);
        if (controlledIds) {
            awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
        }
        if (doc.conns.size === 0) {
            // Schedule cleanup instead of immediate deletion
            console.log(`[Collab] No clients left for: ${doc.name}, scheduling cleanup in 5 minutes`);
            const timeout = setTimeout(() => {
                // Double check no new connections
                if (doc.conns.size === 0) {
                    doc.awareness.destroy();
                    docs.delete(doc.name);
                    doc.destroy();
                    docCleanupTimeouts.delete(doc.name);
                    console.log(`[Collab] Document unloaded: ${doc.name}`);
                }
            }, DOC_CLEANUP_DELAY);
            docCleanupTimeouts.set(doc.name, timeout);
        }
    }
    conn.close();
}


// Create HTTP server
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ 
    status: 'ok', 
    server: 'Nexus Collaboration',
    documents: docs.size,
  }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (conn, req) => {
  // Extract document name from URL path
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  // document name is the path without the leading slash
  const docName = url.pathname.replace(/^\//, '') || 'default';
  
  console.log(`[Collab] Client connected to: ${docName}`);
  
  const doc = getYDoc(docName);
  doc.conns.set(conn, new Set());

  // Listen for messages
  conn.on('message', (message: Buffer) => {
      try {
          const encoder = encoding.createEncoder();
          const decoder = decoding.createDecoder(new Uint8Array(message));
          const messageType = decoding.readVarUint(decoder);
          
          switch (messageType) {
              case messageSync:
                  encoding.writeVarUint(encoder, messageSync);
                  syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                  
                  // If the sync message resulted in a response, send it back
                  if (encoding.length(encoder) > 1) {
                      send(doc, conn, encoding.toUint8Array(encoder));
                  }
                  break;
              case messageAwareness: 
                  awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
                  break;
              default:
                  console.error('[Collab] Unknown message type:', messageType);
          }
      } catch (err) {
          console.error('[Collab] Error handling message', err);
          // Don't crash the server on malformed messages
      }
  });

  conn.on('close', () => {
      closeConn(doc, conn);
      console.log(`[Collab] Client disconnected from: ${docName}`);
  });

  // On connection, usually the client initiates the sync by sending Step 1.
  // But we can also send Step 1 if we wanted to be proactive.
  // Standard y-websocket client behavior is to send Step 1 immediately upon connection.
});

// Start the server
httpServer.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🔄 Nexus Collaboration Server (Standard Protocol)          ║
║                                                              ║
║   WebSocket: ws://${HOST}:${PORT}                              ║
║   HTTP:      http://${HOST}:${PORT}                            ║
║   Status:    Running                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Collab] Shutting down...");
    wss.close();
    httpServer.close();
    process.exit(0);
});
  
process.on("SIGTERM", () => {
    console.log("\n[Collab] Shutting down...");
    wss.close();
    httpServer.close();
    process.exit(0);
});
