import { DEFAULT_SEARCH_RADIUS } from "../constants.js";
import { latLngToLocal, localToLatLng } from "../geometry/coordinates.js";
import {
  dedupePolygon,
  polygonCentroid,
  polygonSignedArea,
} from "../geometry/polygon.js";
import { distancePointToPolygon, pointInPolygon } from "./addressMatching.js";

const RNB_API_URL = "https://rnb-api.beta.gouv.fr/api/alpha/buildings/";
export const RNB_MATCH_MAX_DISTANCE_M = 20;
export const RNB_MATCH_AMBIGUITY_DELTA_M = 4;
const RNB_PAGE_LIMIT = 100;
const MAX_RNB_PAGES = 5;

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

function extractLargestRing(shape) {
  if (!shape?.type || !Array.isArray(shape.coordinates)) {
    return null;
  }

  if (shape.type === "Polygon") {
    return shape.coordinates[0] || null;
  }

  if (shape.type === "MultiPolygon") {
    const largest = shape.coordinates
      .map((polygon) => polygon?.[0] || null)
      .filter(Boolean)
      .map((ring) => ({
        ring,
        area: Math.abs(
          polygonSignedArea(ring.map(([lon, lat]) => [lon, lat]))
        ),
      }))
      .sort((left, right) => right.area - left.area);

    return largest[0]?.ring || null;
  }

  return null;
}

function normalizeRnbGeometry(record, origin) {
  const ring = extractLargestRing(record.shape);
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

function getPrimaryPoint(record, origin) {
  const coordinates = record.point?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return latLngToLocal(coordinates[1], coordinates[0], origin);
  }

  return null;
}

function formatRnbAddress(address) {
  if (!address) {
    return null;
  }

  const parts = [
    [address.street_number, address.street_rep].filter(Boolean).join(" ").trim(),
    address.street,
  ].filter(Boolean);
  const streetLabel = parts.join(" ").trim();
  const localityLabel = [address.city_zipcode, address.city_name]
    .filter(Boolean)
    .join(" ");

  return {
    id: address.id || null,
    ban_id: address.ban_id || null,
    label: [streetLabel, localityLabel].filter(Boolean).join(", ") || null,
    housenumber: address.street_number || null,
    street: address.street || null,
    city: address.city_name || null,
    postcode: address.city_zipcode || null,
    source: address.source || null,
  };
}

function normalizeAddressKey(address) {
  const housenumber = String(
    address?.housenumber || address?.street_number || ""
  )
    .trim()
    .toLowerCase();
  const street = String(address?.street || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!street) {
    return null;
  }

  return `${housenumber}|${street}`;
}

function getBdnbId(extIds = []) {
  return (
    extIds.find((entry) => String(entry?.source).toLowerCase() === "bdnb")?.id ||
    null
  );
}

function normalizeRnbRecord(record, origin) {
  if (!record?.rnb_id) {
    return null;
  }

  const geometry = normalizeRnbGeometry(record, origin);
  const centroid = geometry?.centroid || getPrimaryPoint(record, origin);
  if (!centroid) {
    return null;
  }

  const lonLat = localToLatLng(centroid.x, centroid.z, origin);
  const addresses = Array.isArray(record.addresses)
    ? record.addresses.map(formatRnbAddress).filter(Boolean)
    : [];

  return {
    rnb_id: record.rnb_id,
    lon: lonLat.lng,
    lat: lonLat.lat,
    x: centroid.x,
    z: centroid.z,
    centroid,
    poly: geometry?.poly || null,
    geometry: record.shape || null,
    address_label: addresses[0]?.label || null,
    addresses,
    address_keys: addresses.map(normalizeAddressKey).filter(Boolean),
    bdnb_id: getBdnbId(record.ext_ids),
    ext_ids: Array.isArray(record.ext_ids) ? record.ext_ids : [],
    status: record.status || null,
  };
}

async function fetchRnbPage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RNB HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchRnbBuildings(
  center,
  radius = DEFAULT_SEARCH_RADIUS
) {
  const bbox = buildBbox(center, radius);
  const url = new URL(RNB_API_URL);
  url.searchParams.set(
    "bbox",
    `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`
  );
  url.searchParams.set("limit", String(RNB_PAGE_LIMIT));

  const records = [];
  let nextUrl = url.toString();
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_RNB_PAGES) {
    const payload = await fetchRnbPage(nextUrl);
    const pageResults = Array.isArray(payload?.results) ? payload.results : [];
    records.push(...pageResults);
    nextUrl = payload?.next || null;
    pageCount += 1;
  }

  const normalized = records
    .map((record) => normalizeRnbRecord(record, center))
    .filter(Boolean);

  if (import.meta.env.DEV && normalized.length > 0) {
    console.debug("[rnb] fetch summary", {
      count: normalized.length,
      sample: normalized.slice(0, 5).map((record) => ({
        rnb_id: record.rnb_id,
        address_label: record.address_label,
        bdnb_id: record.bdnb_id,
      })),
    });
  }

  return normalized;
}

function rankRnbCandidates(building, rnbBuildings) {
  const buildingAddressKey = normalizeAddressKey(building.matched_address);

  return rnbBuildings
    .map((candidate) => {
      const centroidDistanceM = Math.hypot(
        candidate.centroid.x - building.centroid.x,
        candidate.centroid.z - building.centroid.z
      );
      const centroidInRnb = candidate.poly
        ? pointInPolygon(building.centroid, candidate.poly)
        : false;
      const rnbCentroidInOsm = pointInPolygon(candidate.centroid, building.poly);
      const overlap = centroidInRnb || rnbCentroidInOsm;
      const polygonDistanceM = candidate.poly
        ? Math.min(
            distancePointToPolygon(candidate.centroid, building.poly),
            distancePointToPolygon(building.centroid, candidate.poly)
          )
        : centroidDistanceM;
      const addressAgreement =
        Boolean(buildingAddressKey) &&
        candidate.address_keys.includes(buildingAddressKey);

      return {
        candidate,
        overlap,
        addressAgreement,
        polygonDistanceM,
        centroidDistanceM,
      };
    })
    .filter(
      (candidate) =>
        candidate.overlap ||
        candidate.addressAgreement ||
        candidate.centroidDistanceM <= RNB_MATCH_MAX_DISTANCE_M
    )
    .sort((left, right) => {
      if (left.overlap !== right.overlap) {
        return left.overlap ? -1 : 1;
      }
      if (left.addressAgreement !== right.addressAgreement) {
        return left.addressAgreement ? -1 : 1;
      }
      if (left.polygonDistanceM !== right.polygonDistanceM) {
        return left.polygonDistanceM - right.polygonDistanceM;
      }
      return left.centroidDistanceM - right.centroidDistanceM;
    });
}

function formatRnbMatch(result) {
  return {
    rnb_id: result.candidate?.rnb_id || null,
    bdnb_id: result.candidate?.bdnb_id || null,
    rnb_address_label: result.candidate?.address_label || null,
    rnb_match_confidence: result.confidence,
    rnb_match_reason: result.reason,
    rnb_match_debug: result.debug,
  };
}

export function matchRnbToBuilding(building, rnbBuildings) {
  const candidates = rankRnbCandidates(building, rnbBuildings);
  const best = candidates[0];
  const second = candidates[1] || null;

  if (!best) {
    return formatRnbMatch({
      candidate: null,
      confidence: "none",
      reason: "none",
      debug: {
        candidate_count: 0,
      },
    });
  }

  const ambiguous =
    second &&
    second.overlap === best.overlap &&
    second.addressAgreement === best.addressAgreement &&
    second.polygonDistanceM - best.polygonDistanceM <=
      RNB_MATCH_AMBIGUITY_DELTA_M &&
    second.centroidDistanceM - best.centroidDistanceM <=
      RNB_MATCH_AMBIGUITY_DELTA_M;

  if (best.overlap) {
    return formatRnbMatch({
      candidate: best.candidate,
      confidence: ambiguous ? "medium" : "high",
      reason: "overlap",
      debug: {
        candidate_count: candidates.length,
        polygon_distance_m: Number(best.polygonDistanceM.toFixed(1)),
        centroid_distance_m: Number(best.centroidDistanceM.toFixed(1)),
        address_agreement: best.addressAgreement,
        competing_candidates: candidates.slice(0, 5).map((candidate) => ({
          rnb_id: candidate.candidate.rnb_id,
          overlap: candidate.overlap,
          address_agreement: candidate.addressAgreement,
          polygon_distance_m: Number(candidate.polygonDistanceM.toFixed(1)),
          centroid_distance_m: Number(candidate.centroidDistanceM.toFixed(1)),
        })),
      },
    });
  }

  if (best.addressAgreement && best.centroidDistanceM <= RNB_MATCH_MAX_DISTANCE_M) {
    return formatRnbMatch({
      candidate: best.candidate,
      confidence: ambiguous ? "medium" : "high",
      reason: "address",
      debug: {
        candidate_count: candidates.length,
        centroid_distance_m: Number(best.centroidDistanceM.toFixed(1)),
        polygon_distance_m: Number(best.polygonDistanceM.toFixed(1)),
        competing_candidates: candidates.slice(0, 5).map((candidate) => ({
          rnb_id: candidate.candidate.rnb_id,
          address_agreement: candidate.addressAgreement,
          polygon_distance_m: Number(candidate.polygonDistanceM.toFixed(1)),
          centroid_distance_m: Number(candidate.centroidDistanceM.toFixed(1)),
        })),
      },
    });
  }

  if (best.centroidDistanceM > RNB_MATCH_MAX_DISTANCE_M || ambiguous) {
    return formatRnbMatch({
      candidate: null,
      confidence: "none",
      reason: "none",
      debug: {
        candidate_count: candidates.length,
        nearest_distance_m: Number(best.centroidDistanceM.toFixed(1)),
        ambiguous: Boolean(ambiguous),
      },
    });
  }

  return formatRnbMatch({
    candidate: best.candidate,
    confidence: best.centroidDistanceM <= 12 ? "medium" : "low",
    reason: "nearest",
    debug: {
      candidate_count: candidates.length,
      centroid_distance_m: Number(best.centroidDistanceM.toFixed(1)),
      polygon_distance_m: Number(best.polygonDistanceM.toFixed(1)),
      competing_candidates: candidates.slice(0, 5).map((candidate) => ({
        rnb_id: candidate.candidate.rnb_id,
        overlap: candidate.overlap,
        address_agreement: candidate.addressAgreement,
        polygon_distance_m: Number(candidate.polygonDistanceM.toFixed(1)),
        centroid_distance_m: Number(candidate.centroidDistanceM.toFixed(1)),
      })),
    },
  });
}

export function matchRnbToBuildings(buildings, rnbBuildings) {
  return buildings.map((building) => ({
    ...building,
    ...matchRnbToBuilding(building, rnbBuildings),
  }));
}

const RNB_MATCH_REASON_LABELS = {
  overlap: "recouvrement géométrique",
  address: "adresse concordante",
  nearest: "bâtiment RNB le plus proche",
  none: "aucune correspondance fiable",
};

const RNB_MATCH_CONFIDENCE_LABELS = {
  high: "élevée",
  medium: "moyenne",
  low: "faible",
  none: "indisponible",
};

export function getRnbMatchReasonLabel(reason) {
  return RNB_MATCH_REASON_LABELS[reason] || reason || "aucune correspondance fiable";
}

export function getRnbMatchConfidenceLabel(confidence) {
  return (
    RNB_MATCH_CONFIDENCE_LABELS[confidence] || confidence || "indisponible"
  );
}
