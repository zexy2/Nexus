// CI-only proof that the Temporal in-place upgrade keeps workflow data.
// Runs inside the nexus-worker image (it carries @temporalio/* from
// packages/workflows), mounted at /app/packages/workflows/ci-probe:
//
//   node ci-probe/probe.cjs seed     # against the OLD server (auto-setup)
//   node ci-probe/probe.cjs verify   # against the NEW server, same database
//
// seed:   completes one workflow (closed history + visibility row) and leaves a
//         second one open: its timer has fired and it waits for a signal.
// verify: the open run is still RUNNING and its pre-upgrade history is
//         readable and replays deterministically; the closed run is still
//         COMPLETED; visibility lists both; then a fresh worker signals the
//         open run and it completes on the new server.
"use strict";

const { Client, Connection } = require("@temporalio/client");
const { NativeConnection, Worker } = require("@temporalio/worker");

const address = process.env.TEMPORAL_ADDRESS || "temporal:7233";
const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const taskQueue = "ci-upgrade-probe";
const workflowsPath = require.resolve("./workflows.cjs");
const OPEN_ID = "ci-upgrade-probe-open";
const CLOSED_ID = "ci-upgrade-probe-closed";

const deadline = setTimeout(() => {
  console.error("probe: timed out");
  process.exit(1);
}, 180_000);

function assert(cond, message) {
  if (!cond) throw new Error(`probe assertion failed: ${message}`);
}

async function withWorker(fn) {
  const nativeConnection = await NativeConnection.connect({ address });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      namespace,
      taskQueue,
      workflowsPath,
    });
    return await worker.runUntil(fn);
  } finally {
    await nativeConnection.close();
  }
}

async function seed(client) {
  await withWorker(async () => {
    const closed = await client.workflow.start("upgradeProbe", {
      taskQueue,
      workflowId: CLOSED_ID,
      args: ["closed"],
    });
    await closed.signal("finish", "before-upgrade");
    const closedResult = await closed.result();
    assert(closedResult === "closed|before-upgrade", `closed result ${closedResult}`);

    const open = await client.workflow.start("upgradeProbe", {
      taskQueue,
      workflowId: OPEN_ID,
      args: ["opened-before-upgrade"],
    });
    // Wait until the timer fired and the worker finished that task, so the
    // open run's history holds real progress made on the old server.
    for (let i = 0; i < 60; i += 1) {
      const { events = [] } = await open.fetchHistory();
      const last = events[events.length - 1];
      if (events.some((e) => e.timerFiredEventAttributes) && last?.workflowTaskCompletedEventAttributes) {
        console.log(`probe: seeded ${CLOSED_ID} (completed) and ${OPEN_ID} (open, ${events.length} events)`);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("open workflow did not reach its signal wait");
  });
}

async function verify(client) {
  const open = client.workflow.getHandle(OPEN_ID);
  const openDesc = await open.describe();
  assert(openDesc.status.name === "RUNNING", `open status ${openDesc.status.name}`);
  const history = await open.fetchHistory();
  const events = history.events || [];
  assert(events.some((e) => e.timerFiredEventAttributes), "pre-upgrade TimerFired event missing");
  console.log(`probe: ${OPEN_ID} RUNNING, ${events.length} pre-upgrade events readable`);

  await Worker.runReplayHistory({ workflowsPath }, history, OPEN_ID);
  console.log("probe: pre-upgrade history replays deterministically");

  const closedDesc = await client.workflow.getHandle(CLOSED_ID).describe();
  assert(closedDesc.status.name === "COMPLETED", `closed status ${closedDesc.status.name}`);
  console.log(`probe: ${CLOSED_ID} COMPLETED`);

  const listed = new Set();
  for await (const wf of client.workflow.list({ query: `TaskQueue = '${taskQueue}'` })) {
    listed.add(wf.workflowId);
  }
  assert(listed.has(OPEN_ID) && listed.has(CLOSED_ID), `visibility lists ${[...listed].join(",")}`);
  console.log("probe: visibility lists both runs");

  // A new worker has no sticky cache, so this task replays the old history
  // before it applies the signal.
  const result = await withWorker(async () => {
    await open.signal("finish", "after-upgrade");
    return open.result();
  });
  assert(result === "opened-before-upgrade|after-upgrade", `open result ${result}`);
  console.log(`probe: ${OPEN_ID} completed on the new server -> ${result}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "seed" && mode !== "verify") throw new Error("usage: probe.cjs seed|verify");
  const connection = await Connection.connect({ address });
  try {
    const client = new Client({ connection, namespace });
    if (mode === "seed") await seed(client);
    else await verify(client);
  } finally {
    await connection.close();
  }
}

main().then(
  () => {
    clearTimeout(deadline);
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
