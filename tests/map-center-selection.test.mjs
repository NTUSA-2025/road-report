import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/map-center-selection.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { bindMapCenterSelection } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function createMap() {
  let center = { lat: 25.01734, lng: 121.53975 };
  const listeners = new Set();
  const pans = [];
  const map = {
    getCenter: () => ({
      ...center,
      wrap: () => ({ ...center, lng: ((center.lng + 180) % 360 + 360) % 360 - 180 }),
    }),
    on: (event, listener) => {
      assert.equal(event, "move");
      listeners.add(listener);
    },
    off: (event, listener) => {
      assert.equal(event, "move");
      listeners.delete(listener);
    },
    moveTo(position) {
      center = position;
      for (const listener of listeners) listener();
    },
    stop() {
      // Stopping existing inertia can emit a final movement before recentering.
      map.moveTo({ lat: center.lat + 0.001, lng: center.lng });
    },
    panTo([lat, lng], options) {
      pans.push({ lat, lng, options });
      map.moveTo({ lat, lng });
    },
  };
  return { map, pans };
}

test("tracks the center throughout a drag without recentering on state updates", () => {
  const { map, pans } = createMap();
  const changes = [];
  const selection = bindMapCenterSelection(map, map.getCenter(), (position) => {
    changes.push(position);
    selection.setPosition(position);
  });

  map.moveTo({ lat: 25.018, lng: 121.54 });
  map.moveTo({ lat: 25.019, lng: 121.541 });
  assert.equal(changes.length, 2);
  assert.equal(changes.at(-1).lat, 25.019);
  assert.ok(Math.abs(changes.at(-1).lng - 121.541) < 1e-8);
  assert.equal(pans.length, 0);

  // A zoom or resize at the same center must not replace the selection.
  map.moveTo({ lat: 25.019, lng: 121.541 });
  assert.equal(changes.length, 2);
});

test("device location recenters immediately without publishing intermediate positions", () => {
  const { map, pans } = createMap();
  const changes = [];
  const selection = bindMapCenterSelection(map, map.getCenter(), (position) => changes.push(position));
  selection.setPosition({ lat: 25.02, lng: 121.55 });

  assert.deepEqual(pans, [{ lat: 25.02, lng: 121.55, options: { animate: false } }]);
  assert.deepEqual(changes, []);
  map.moveTo({ lat: 25.021, lng: 121.55 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].lat, 25.021);
});

test("wraps longitude and removes the listener when leaving the map step", () => {
  const { map } = createMap();
  const changes = [];
  const selection = bindMapCenterSelection(map, map.getCenter(), (position) => changes.push(position));
  map.moveTo({ lat: 25, lng: 181 });
  assert.deepEqual(changes, [{ lat: 25, lng: -179 }]);

  selection.dispose();
  map.moveTo({ lat: 26, lng: 180 });
  assert.equal(changes.length, 1);
});
