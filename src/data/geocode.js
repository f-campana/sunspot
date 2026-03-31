const GEOCODER_ENDPOINTS = [
  {
    source: "Géoplateforme",
    url: (query) =>
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(query)}&limit=5`,
  },
  {
    source: "BAN",
    url: (query) =>
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`,
  },
];

function readFirstFeature(json) {
  if (!Array.isArray(json?.features) || json.features.length === 0) {
    return null;
  }

  return json.features.find((feature) => feature?.geometry?.coordinates) || null;
}

export async function geocodeAddress(query) {
  let lastError = null;

  for (const endpoint of GEOCODER_ENDPOINTS) {
    try {
      const response = await fetch(endpoint.url(query));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const feature = readFirstFeature(json);
      if (!feature) {
        continue;
      }

      const [lng, lat] = feature.geometry.coordinates;
      return {
        lat,
        lng,
        label: feature.properties?.label || query,
        raw: feature,
        source: endpoint.source,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to geocode the address");
}
