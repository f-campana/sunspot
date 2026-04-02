const BDNB_DATA_BASE_URL = "https://api.bdnb.io/v1/bdnb/donnees";
const BDNB_CONSTRUCTION_ENDPOINT = `${BDNB_DATA_BASE_URL}/batiment_construction`;
const BDNB_GROUP_ENDPOINT = `${BDNB_DATA_BASE_URL}/batiment_groupe_complet`;
const BDNB_QUERY_CHUNK_SIZE = 40;

function getBdnbRuntimeConfig() {
  return {
    apiKey: import.meta.env.VITE_BDNB_API_KEY || "",
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

function buildInFilter(values) {
  return `in.(${values.join(",")})`;
}

function buildHeaders() {
  const { apiKey } = getBdnbRuntimeConfig();
  return {
    Accept: "application/json",
    ...(apiKey
      ? {
          "X-Gravitee-Api-Key": apiKey,
          "x-api-key": apiKey,
        }
      : {}),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`BDNB HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeStoreysValue(value) {
  const numeric = normalizeNumeric(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const normalized = Math.round(numeric);
  if (normalized < 1 || normalized > 50) {
    return null;
  }

  return normalized;
}

function normalizeHeightValue(value) {
  const numeric = normalizeNumeric(value);
  if (!Number.isFinite(numeric) || numeric < 2 || numeric > 120) {
    return null;
  }

  return numeric;
}

function normalizeStoreysConfidence(groupRecord, hasStoreys) {
  if (!hasStoreys) {
    return "low";
  }

  const reliability = String(groupRecord?.fiabilite_hauteur || "")
    .trim()
    .toLowerCase();

  if (["tres_bonne", "très_bonne", "bonne", "forte"].includes(reliability)) {
    return "high";
  }
  if (["moyenne", "moyen"].includes(reliability)) {
    return "medium";
  }
  if (["faible", "mauvaise"].includes(reliability)) {
    return "low";
  }

  return "high";
}

async function fetchConstructionRows(rnbIds) {
  const rows = [];

  for (const rnbIdChunk of chunk(rnbIds, BDNB_QUERY_CHUNK_SIZE)) {
    const url = new URL(BDNB_CONSTRUCTION_ENDPOINT);
    url.searchParams.set("select", "rnb_id,batiment_construction_id,batiment_groupe_id,hauteur");
    url.searchParams.set("rnb_id", buildInFilter(rnbIdChunk));

    const payload = await fetchJson(url);
    rows.push(...(Array.isArray(payload) ? payload : []));
  }

  return rows;
}

async function fetchGroupRows(groupIds) {
  const rows = [];

  for (const groupIdChunk of chunk(groupIds, BDNB_QUERY_CHUNK_SIZE)) {
    const url = new URL(BDNB_GROUP_ENDPOINT);
    url.searchParams.set(
      "select",
      [
        "batiment_groupe_id",
        "nb_niveau",
        "hauteur_mean",
        "fiabilite_hauteur",
        "libelle_adr_principale_ban",
        "usage_niveau_1_txt",
      ].join(",")
    );
    url.searchParams.set("batiment_groupe_id", buildInFilter(groupIdChunk));

    const payload = await fetchJson(url);
    rows.push(...(Array.isArray(payload) ? payload : []));
  }

  return rows;
}

export async function fetchBdnbBuildings({ rnbIds = [] } = {}) {
  const uniqueRnbIds = [...new Set(rnbIds.filter(Boolean))];
  if (uniqueRnbIds.length === 0) {
    return [];
  }

  const constructionRows = await fetchConstructionRows(uniqueRnbIds);
  if (constructionRows.length === 0) {
    return [];
  }

  const groupIds = [
    ...new Set(
      constructionRows
        .map((row) => row?.batiment_groupe_id)
        .filter(Boolean)
    ),
  ];
  const groupRows = await fetchGroupRows(groupIds);
  const groupById = new Map(
    groupRows
      .filter((row) => row?.batiment_groupe_id)
      .map((row) => [row.batiment_groupe_id, row])
  );

  const records = constructionRows
    .map((constructionRow) => {
      const groupRow = groupById.get(constructionRow.batiment_groupe_id);
      const storeys = normalizeStoreysValue(groupRow?.nb_niveau);
      if (!storeys) {
        return null;
      }

      return {
        rnb_id: constructionRow.rnb_id,
        bdnb_id: constructionRow.batiment_groupe_id,
        bdnb_construction_id: constructionRow.batiment_construction_id || null,
        storeys,
        storeys_confidence: normalizeStoreysConfidence(groupRow, true),
        height_m_bdnb: normalizeHeightValue(
          groupRow?.hauteur_mean ?? constructionRow?.hauteur
        ),
        raw_fields: {
          construction: constructionRow,
          group: groupRow || null,
        },
      };
    })
    .filter(Boolean);

  if (import.meta.env.DEV && records.length > 0) {
    console.debug("[bdnb] fetch summary", {
      requestedRnbCount: uniqueRnbIds.length,
      constructionCount: constructionRows.length,
      groupCount: groupRows.length,
      recordCount: records.length,
      sample: records.slice(0, 5).map((record) => ({
        rnb_id: record.rnb_id,
        bdnb_id: record.bdnb_id,
        bdnb_construction_id: record.bdnb_construction_id,
        storeys: record.storeys,
      })),
    });
  }

  return records;
}

export function applyBdnbStoreyOverrides(buildings, bdnbRecords) {
  const recordByRnbId = new Map(
    bdnbRecords
      .filter((record) => record?.rnb_id)
      .map((record) => [record.rnb_id, record])
  );

  return buildings.map((building) => {
    const record = building.rnb_id ? recordByRnbId.get(building.rnb_id) : null;
    if (!record?.storeys) {
      return building;
    }

    return {
      ...building,
      bdnb_id: record.bdnb_id || building.bdnb_id || null,
      storeys: record.storeys,
      storeys_source: "bdnb",
      storeys_confidence: record.storeys_confidence || "high",
      storeys_debug: {
        ...(building.storeys_debug || {}),
        previous_storeys: building.storeys ?? null,
        previous_storeys_source: building.storeys_source || null,
        previous_storeys_confidence: building.storeys_confidence || null,
        bdnb_id: record.bdnb_id || null,
        bdnb_construction_id: record.bdnb_construction_id || null,
        bdnb_height_m: record.height_m_bdnb,
        bdnb_address_label:
          record.raw_fields?.group?.libelle_adr_principale_ban || null,
        selection_reason: "bdnb_open_rnb_join",
      },
    };
  });
}
