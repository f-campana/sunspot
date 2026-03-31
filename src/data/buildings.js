import { FLOOR_HEIGHT } from "../constants.js";
import { buildFacadeEdges } from "../geometry/facades.js";
import {
  normalizePolygonWinding,
  polygonCentroid,
} from "../geometry/polygon.js";

export function preprocessBuildings(rawBuildings, source = "demo") {
  return rawBuildings
    .map((building, index) => {
      const poly = normalizePolygonWinding(building.poly);
      const edges = buildFacadeEdges(poly);

      return {
        id: building.id || `building-${index}`,
        name: building.name || `Building ${index + 1}`,
        poly,
        edges,
        centroid: polygonCentroid(poly),
        height:
          Number.isFinite(building.height) && building.height > 2
            ? building.height
            : Number.isFinite(building.h) && building.h > 2
              ? building.h
              : 18,
        color: building.color || building.clr || "#c8c0b0",
        tags: building.tags || {},
        source,
      };
    })
    .filter((building) => building.poly.length >= 3 && building.edges.length > 0);
}

export function getMaxFloorIndex(building) {
  return Math.max(
    0,
    Math.floor((building.height - (FLOOR_HEIGHT - 0.3)) / FLOOR_HEIGHT)
  );
}
