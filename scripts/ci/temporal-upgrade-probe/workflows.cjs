// Workflow used only by the CI Temporal upgrade test (see probe.cjs).
// It records a timer and then blocks on a signal, so a run started on the old
// server is still open, with real history, when the new server takes over.
const { condition, defineSignal, setHandler, sleep } = require("@temporalio/workflow");

const finishSignal = defineSignal("finish");

async function upgradeProbe(marker) {
  let payload = null;
  setHandler(finishSignal, (value) => {
    payload = value;
  });
  await sleep("1 second");
  await condition(() => payload !== null);
  return `${marker}|${payload}`;
}

module.exports = { upgradeProbe };
