import { DEFAULT_SEARCH_RADIUS } from "../constants.js";
import { distancePointToPolygon, pointInPolygon } from "./addressMatching.js";
import { localToLatLng, latLngToLocal } from "../geometry/coordinates.js";
import {
  dedupePolygon,
  polygonCentroid,
  polygonSignedArea,
} from "../geometry/polygon.js";
import { isValidHeightMeters } from "./height.js";

export const BDTOPO_MATCH_MAX_DISTANCE_M = 24;
const BDTOPO_WFS_URL = "https://data.geopf.fr/wfs/ows";
const BDTOPO_TYPENAME = "BDTOPO_V3:batiment";

function buildBbox(center, radius) {
  const corners = [
    localToLatLng(-radius, -radius, center),
    localToLatLng(radius, -radius, center),
    localToLatLng(radius, radius, center),
    localToLatLng(-radius, radius, center),
  ];

  return {
    minLat: Math.min(...corners.map((corner) => corner.lat)),
    maxLat: Math.max(...corners.map((corner) => corner.lat)),
    minLng: Math.min(...corners.map((corner) => corner.lng)),
    maxLng: Math.max(...corners.map((corner) => corner.lng)),
  };
}

function normalizeBdTopoHeight(properties = {}) {
  const directHeight = Number(properties.hauteur);
  if (isValidHeightMeters(directHeight)) {
    return directHeight;
  }

  const minSol = Number(properties.altitude_minimale_sol);
  const maxToit = Number(properties.altitude_maximale_toit);
  if (Number.isFinite(minSol) && Number.isFinite(maxToit)) {
    const derived = maxToit - minSol;
    if (isValidHeightMeters(derived)) {
      return derived;
    }
  }

  return null;
}

function extractLargestRing(geometry) {
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] || null;
  }

  if (geometry.type === "MultiPolygon") {
    const rings = geometry.coordinates
      .map((polygon) => polygon?.[0] || null)
      .filter(Boolean)
      .map((ring) => ({
        ring,
        area: Math.abs(
          polygonSignedArea(
            ring.map(([lon, lat]) => [lon, lat])
          )
        ),
      }))
      .sort((left, right) => right.area - left.area);

    return rings[0]?.ring || null;
  }

  return null;
}

function normalizeBdTopoGeometry(feature, origin) {
  const ring = extractLargestRing(feature.geometry);
  if (!ring || ring.length < 4) {
    return null;
  }

  const projected = ring.map(([lon, lat]) => {
    const local = latLngToLocal(lat, lon, origin);
    return [local.x, local.z];
  });

  const poly = dedupePolygon(projected);
  if (poly.length < 3 || Math.abs(polygonSignedArea(poly)) < 4) {
    return null;
  }

  return {
    poly,
    centroid: polygonCentroid(poly),
  };
}

function normalizeBdTopoFeature(feature, origin) {
  const geometry = normalizeBdTopoGeometry(feature, origin);
  const properties = feature.properties || {};
  const height_m = normalizeBdTopoHeight(properties);
  if (!height_m) {
    return null;
  }

  const centroid = geometry?.centroid || (() => {
    if (feature.geometry?.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates;
      return latLngToLocal(lat, lon, origin);
    }
    return null;
  })();

  if (!centroid) {
    return null;
  }

  const lonLat = localToLatLng(centroid.x, centroid.z, origin);

  return {
    id: properties.cleabs || feature.id || `bdtopo-${height_m}-${centroid.x}-${centroid.z}`,
    height_m,
    lon: lonLat.lng,
    lat: lonLat.lat,
    x: centroid.x,
    z: centroid.z,
    poly: geometry?.poly || null,
    centroid,
    properties,
  };
}

export async function fetchBdTopoBuildings(
  center,
  radius = DEFAULT_SEARCH_RADIUS
) {
  const bbox = buildBbox(center, radius);
  const url = new URL(BDTOPO_WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", BDTOPO_TYPENAME);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set(
    "BBOX",
    `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat},EPSG:4326`
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BD TOPO HTTP ${response.status}`);
  }

  const json = await response.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map((feature) => normalizeBdTopoFeature(feature, center))
    .filter(Boolean);
}

function rankBdTopoCandidates(building, bdTopoBuildings) {
  return bdTopoBuildings
    .map((candidate) => {
      const centroidDistanceM = Math.hypot(
        candidate.centroid.x - building.centroid.x,
        candidate.centroid.z - building.centroid.z
      );
      const centroidInBdTopo = candidate.poly
        ? pointInPolygon(building.centroid, candidate.poly)
        : false;
      const bdTopoCentroidInOsm = pointInPolygon(candidate.centroid, building.poly);
      const polygonDistanceM = candidate.poly
        ? Math.min(
            distancePointToPolygon(candidate.centroid, building.poly),
            distancePointToPolygon(building.centroid, candidate.poly)
          )
        : centroidDistanceM;

      return {
        candidate,
        centroidDistanceM,
        centroidInBdTopo,
        bdTopoCentroidInOsm,
        overlap: centroidInBdTopo || bdTopoCentroidInOsm,
        polygonDistanceM,
      };
    })
    .filter(
      (candidate) =>
        candidate.overlap || candidate.centroidDistanceM <= BDTOPO_MATCH_MAX_DISTANCE_M
    )
    .sort((left, right) => {
      if (left.overlap !== right.overlap) {
        return left.overlap ? -1 : 1;
      }
      if (left.polygonDistanceM !== right.polygonDistanceM) {
        return left.polygonDistanceM - right.polygonDistanceM;
      }
      return left.centroidDistanceM - right.centroidDistanceM;
    });
}

export function applyBdTopoHeightOverrides(buildings, bdTopoBuildings) {
  return buildings.map((building) => {
    const candidates = rankBdTopoCandidates(building, bdTopoBuildings);
    const best = candidates[0];

    if (!best) {
      return building;
    }

    return {
      ...building,
      height_m: best.candidate.height_m,
      height_source: "bdtopo",
      height_confidence: "high",
      height_debug: {
        ...(building.height_debug || {}),
        previous_height_m: building.height_m,
        previous_height_source: building.height_source,
        previous_height_confidence: building.height_confidence,
        bdtopo_feature_id: best.candidate.id,
        bdtopo_match_distance_m: Number(best.centroidDistanceM.toFixed(1)),
        bdtopo_polygon_distance_m: Number(best.polygonDistanceM.toFixed(1)),
        bdtopo_match_method: best.overlap ? "polygon_overlap" : "nearest_centroid",
        bdtopo_height_m: best.candidate.height_m,
        bdtopo_raw_hauteur: best.candidate.properties?.hauteur ?? null,
        bdtopo_altitude_maximale_toit:
          best.candidate.properties?.altitude_maximale_toit ?? null,
      },
    };
  });
}
