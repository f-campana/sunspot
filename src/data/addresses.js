import { DEFAULT_SEARCH_RADIUS } from "../constants.js";
import { latLngToLocal, localToLatLng } from "../geometry/coordinates.js";

const ADDRESS_QUERY_RADIUS_M = 42;
const ADDRESS_QUERY_LIMIT = 12;
const ADDRESS_LOOKUP_OFFSETS_M = [
  [0, 0],
  [ADDRESS_QUERY_RADIUS_M, 0],
  [-ADDRESS_QUERY_RADIUS_M, 0],
  [0, ADDRESS_QUERY_RADIUS_M],
  [0, -ADDRESS_QUERY_RADIUS_M],
  [ADDRESS_QUERY_RADIUS_M, ADDRESS_QUERY_RADIUS_M],
  [ADDRESS_QUERY_RADIUS_M, -ADDRESS_QUERY_RADIUS_M],
  [-ADDRESS_QUERY_RADIUS_M, ADDRESS_QUERY_RADIUS_M],
  [-ADDRESS_QUERY_RADIUS_M, -ADDRESS_QUERY_RADIUS_M],
];

function normalizeAddressFeature(feature, origin) {
  if (!feature?.geometry?.coordinates) {
    return null;
  }

  const [lon, lat] = feature.geometry.coordinates;
  const local = latLngToLocal(lat, lon, origin);
  const properties = feature.properties || {};

  return {
    id:
      feature.properties?.id ||
      `${properties.housenumber || ""}-${properties.street || ""}-${lon}-${lat}`,
    label:
      properties.label ||
      [properties.housenumber, properties.street].filter(Boolean).join(" ") ||
      "Adresse inconnue",
    housenumber: properties.housenumber || null,
    street: properties.street || null,
    city: properties.city || properties.citycode || null,
    postcode: properties.postcode || null,
    lon,
    lat,
    x: local.x,
    z: local.z,
    source: "BAN",
  };
}

function dedupeAddresses(addresses) {
  const byId = new Map();

  addresses.forEach((address) => {
    const key = address.id || `${address.label}-${address.lon}-${address.lat}`;
    if (!byId.has(key)) {
      byId.set(key, address);
    }
  });

  return [...byId.values()];
}

async function reverseLookupAddressPoint(lat, lng) {
  const response = await fetch(
    `https://api-adresse.data.gouv.fr/reverse/?lon=${lng}&lat=${lat}&limit=${ADDRESS_QUERY_LIMIT}`
  );
  if (!response.ok) {
    throw new Error(`BAN reverse HTTP ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json?.features) ? json.features : [];
}

export async function fetchNearbyAddresses(
  center,
  radius = DEFAULT_SEARCH_RADIUS
) {
  const queryRadiusM = Math.min(radius, ADDRESS_QUERY_RADIUS_M);
  const queries = ADDRESS_LOOKUP_OFFSETS_M.map(([x, z]) =>
    localToLatLng(x, z, center)
  );

  const responses = await Promise.allSettled(
    queries.map((query) => reverseLookupAddressPoint(query.lat, query.lng))
  );

  const features = responses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  const normalized = dedupeAddresses(
    features
      .map((feature) => normalizeAddressFeature(feature, center))
      .filter(Boolean)
      .filter(
        (address) => Math.hypot(address.x, address.z) <= radius + queryRadiusM
      )
  );

  if (import.meta.env.DEV && normalized.length > 0) {
    console.debug("[address] nearby BAN addresses", {
      center: center.label,
      count: normalized.length,
      sample: normalized.slice(0, 5).map((address) => ({
        label: address.label,
        x: Math.round(address.x),
        z: Math.round(address.z),
      })),
    });
  }

  return normalized;
}
