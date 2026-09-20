import type { Map as LeafletMap } from "leaflet";

type Position = { lat: number; lng: number };

function samePosition(a: Position, b: Position) {
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8;
}

export function bindMapCenterSelection(
  map: LeafletMap,
  initialPosition: Position,
  onChange: (position: Position) => void,
) {
  let selected = initialPosition;
  let positioning = false;

  function updateFromMap() {
    if (positioning) return;
    const center = map.getCenter().wrap();
    if (samePosition(center, selected)) return;
    selected = { lat: center.lat, lng: center.lng };
    onChange(selected);
  }

  // Keep the submitted position current even while a drag or inertia is ongoing.
  map.on("move", updateFromMap);

  return {
    setPosition(position: Position) {
      selected = position;
      if (!samePosition(map.getCenter().wrap(), position)) {
        // External location updates must not animate through intermediate selections.
        positioning = true;
        try {
          map.stop();
          map.panTo([position.lat, position.lng], { animate: false });
        } finally {
          positioning = false;
        }
      }
    },
    dispose() {
      map.off("move", updateFromMap);
    },
  };
}
