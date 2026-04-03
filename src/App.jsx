import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CENTER,
  DEFAULT_TIME_RANGE,
  MAX_FLOOR,
  MIN_FLOOR,
  getSeasonDate,
} from "./constants.js";
import { DEMO_BUILDINGS_RAW } from "./data/demoBuildings.js";
import { fetchNearbyAddresses } from "./data/addresses.js";
import {
  getAddressDisplayLabel,
  getAddressMatchConfidenceLabel,
  getAddressMatchReasonLabel,
  matchAddressesToBuildings,
} from "./data/addressMatching.js";
import {
  applyBdTopoHeightOverrides,
  fetchBdTopoBuildings,
} from "./data/bdtopo.js";
import {
  applyBdnbStoreyOverrides,
  fetchBdnbBuildings,
} from "./data/bdnb.js";
import { geocodeAddress } from "./data/geocode.js";
import { fetchBuildingsFromOverpass } from "./data/osm.js";
import {
  fetchRnbBuildings,
  getRnbMatchConfidenceLabel,
  getRnbMatchReasonLabel,
  matchRnbToBuildings,
} from "./data/rnb.js";
import {
  getMaxFloorIndex,
  preprocessBuildings,
} from "./data/buildings.js";
import {
  estimateFloorCount,
  getHeightConfidenceLabel,
  getHeightSourceLabel,
  getNearbyHeightDiagnostics,
} from "./data/height.js";
import {
  getStoreysConfidenceLabel,
  getStoreysSourceLabel,
} from "./data/storeys.js";
import {
  computeSunExposure,
  evaluateFacadeAtTime,
} from "./engine/exposure.js";
import { computeSunspotVerdict } from "./engine/verdict.js";
import { getSunInfo } from "./engine/sun.js";
import {
  getFacadeAccentColor,
  getFacadeLabel,
} from "./geometry/facades.js";
import SceneViewport from "./rendering/SceneViewport.jsx";
import ControlPanel from "./ui/ControlPanel.jsx";
import FacadePanel from "./ui/FacadePanel.jsx";
import SunArc from "./ui/SunArc.jsx";

const initialBuildings = preprocessBuildings(DEMO_BUILDINGS_RAW, "demo");

export default function App() {
  const sceneRef = useRef(null);
  const hasAutoSelected = useRef(false);

  const [address, setAddress] = useState(DEFAULT_CENTER.label);
  const [buildings, setBuildings] = useState(initialBuildings);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [minutes, setMinutes] = useState(12 * 60);
  const [season, setSeason] = useState("summer");
  const [floor, setFloor] = useState(0);
  const [cameraPreset, setCameraPreset] = useState("perspective");
  const [showDebugPoints, setShowDebugPoints] = useState(true);
  const [selectedFacade, setSelectedFacade] = useState(null);
  const [summary, setSummary] = useState(null);
  const [debugEvaluation, setDebugEvaluation] = useState(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(
    "Recherchez une adresse pour charger les bâtiments ou utilisez la scène de démonstration."
  );

  const selectedBuilding =
    buildings.find((building) => building.id === selectedFacade?.buildingId) ||
    null;
  const selectedEdge =
    selectedBuilding?.edges.find((edge) => edge.index === selectedFacade?.edgeIndex) ||
    null;
  const maxFloorIndex = selectedBuilding
    ? getMaxFloorIndex(selectedBuilding)
    : MAX_FLOOR;
  const effectiveFloor = Math.min(Math.max(floor, MIN_FLOOR), maxFloorIndex);
  const isClampedFloor = selectedBuilding && effectiveFloor !== floor;
  const sunInfo = getSunInfo(
    getSeasonDate(season, minutes),
    center.lat,
    center.lng
  );

  useEffect(() => {
    if (!selectedFacade) {
      return;
    }

    const stillExists = buildings.some(
      (building) => building.id === selectedFacade.buildingId
    );
    if (!stillExists) {
      setSelectedFacade(null);
    }
  }, [buildings, selectedFacade]);

  const handleSceneReady = useCallback(() => {
    setSceneRevision((value) => value + 1);
  }, []);

  // Auto-select a meaningful demo facade on first load so the app
  // immediately demonstrates value instead of showing an empty state.
  useEffect(() => {
    if (hasAutoSelected.current || selectedFacade) {
      return;
    }
    if (!sceneRef.current?.getSimulationContext?.()?.meshes?.length) {
      return;
    }
    // Pick the main demo building and its south-facing edge
    const demoBuilding = buildings.find((b) => b.id === "b0");
    if (!demoBuilding) {
      return;
    }
    const southEdge = demoBuilding.edges.find((edge) => {
      // South-facing: normal points roughly toward +Z (nz > 0.7)
      return edge.nz > 0.7 && edge.len > 4;
    });
    if (southEdge) {
      hasAutoSelected.current = true;
      setSelectedFacade({
        buildingId: demoBuilding.id,
        edgeIndex: southEdge.index,
      });
    }
  }, [buildings, selectedFacade, sceneRevision]);

  useEffect(() => {
    if (!selectedBuilding || !selectedEdge) {
      setSummary(null);
      return;
    }

    const context = sceneRef.current?.getSimulationContext?.();
    if (!context?.meshes?.length) {
      return;
    }

    const selfMesh = context.meshById.get(selectedBuilding.id);
    if (!selfMesh) {
      return;
    }

    const exposure = computeSunExposure({
      building: selectedBuilding,
      edge: selectedEdge,
      floor: effectiveFloor,
      date: getSeasonDate(season),
      timeRange: DEFAULT_TIME_RANGE,
      center,
      meshes: context.meshes,
      selfMesh,
      raycaster: context.raycaster,
    });

    const summerReference = computeSunExposure({
      building: selectedBuilding,
      edge: selectedEdge,
      floor: effectiveFloor,
      date: getSeasonDate("summer"),
      timeRange: DEFAULT_TIME_RANGE,
      center,
      meshes: context.meshes,
      selfMesh,
      raycaster: context.raycaster,
    });

    const winterReference = computeSunExposure({
      building: selectedBuilding,
      edge: selectedEdge,
      floor: effectiveFloor,
      date: getSeasonDate("winter"),
      timeRange: DEFAULT_TIME_RANGE,
      center,
      meshes: context.meshes,
      selfMesh,
      raycaster: context.raycaster,
    });

    const verdict = computeSunspotVerdict({
      summary: exposure,
      seasonal: {
        summer: summerReference,
        winter: winterReference,
      },
    });

    setSummary({
      ...exposure,
      ...verdict,
      seasonalReferences: {
        summer: {
          hours: summerReference.hours,
          avgRatio: summerReference.avgRatio,
        },
        winter: {
          hours: winterReference.hours,
          avgRatio: winterReference.avgRatio,
        },
      },
      edgeColor: getFacadeAccentColor(selectedEdge),
      edgeLabel: getFacadeLabel(selectedEdge),
      edgeLength: selectedEdge.len,
      effectiveFloor,
    });
  }, [
    center,
    effectiveFloor,
    sceneRevision,
    season,
    selectedBuilding,
    selectedEdge,
  ]);

  useEffect(() => {
    if (!selectedBuilding || !selectedEdge) {
      setDebugEvaluation(null);
      return;
    }

    const context = sceneRef.current?.getSimulationContext?.();
    if (!context?.meshes?.length) {
      return;
    }

    const selfMesh = context.meshById.get(selectedBuilding.id);
    if (!selfMesh) {
      return;
    }

    setDebugEvaluation(
      evaluateFacadeAtTime({
        building: selectedBuilding,
        edge: selectedEdge,
        floor: effectiveFloor,
        date: getSeasonDate(season, minutes),
        center,
        meshes: context.meshes,
        selfMesh,
        raycaster: context.raycaster,
      })
    );
  }, [
    center,
    effectiveFloor,
    minutes,
    sceneRevision,
    season,
    selectedBuilding,
    selectedEdge,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedBuilding) {
      return;
    }

    const nearbyDiagnostics = getNearbyHeightDiagnostics(selectedBuilding, buildings);

    console.groupCollapsed(
      `[height] ${selectedBuilding.name || selectedBuilding.id}`
    );
    console.log("height_m", selectedBuilding.height_m);
    console.log("estimated_floors", estimateFloorCount(selectedBuilding.height_m));
    console.log("storeys", {
      value: selectedBuilding.storeys,
      source: {
        code: selectedBuilding.storeys_source,
        label: getStoreysSourceLabel(selectedBuilding.storeys_source),
      },
      confidence: {
        code: selectedBuilding.storeys_confidence,
        label: getStoreysConfidenceLabel(selectedBuilding.storeys_confidence),
      },
    });
    console.log("height_source", {
      code: selectedBuilding.height_source,
      label: getHeightSourceLabel(selectedBuilding.height_source),
    });
    console.log("height_confidence", {
      code: selectedBuilding.height_confidence,
      label: getHeightConfidenceLabel(selectedBuilding.height_confidence),
    });
    console.log("height_debug", selectedBuilding.height_debug || {});
    console.log("nearby_height_context", nearbyDiagnostics);
    console.log("available_tags", selectedBuilding.tags || {});
    if (selectedBuilding.height_source === "bdtopo") {
      console.log("bdtopo_override", {
        previous_height_m: selectedBuilding.height_debug?.previous_height_m,
        previous_height_source:
          selectedBuilding.height_debug?.previous_height_source,
        match_distance_m: selectedBuilding.height_debug?.bdtopo_match_distance_m,
        match_method: selectedBuilding.height_debug?.bdtopo_match_method,
        bdtopo_height_m: selectedBuilding.height_debug?.bdtopo_height_m,
      });
    }
    console.groupEnd();
  }, [buildings, selectedBuilding]);

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedBuilding) {
      return;
    }

    console.groupCollapsed(
      `[address] ${selectedBuilding.name || selectedBuilding.id}`
    );
    console.log("match", {
      matched_address: selectedBuilding.matched_address,
      confidence: {
        code: selectedBuilding.address_match_confidence,
        label: getAddressMatchConfidenceLabel(
          selectedBuilding.address_match_confidence
        ),
      },
      reason: {
        code: selectedBuilding.address_match_reason,
        label: getAddressMatchReasonLabel(selectedBuilding.address_match_reason),
      },
      display: getAddressDisplayLabel(selectedBuilding),
    });
    console.log("address_match_debug", selectedBuilding.address_match_debug || {});
    console.groupEnd();
  }, [selectedBuilding]);

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedBuilding) {
      return;
    }

    console.groupCollapsed(
      `[identity] ${selectedBuilding.name || selectedBuilding.id}`
    );
    console.log("building_identity", {
      address: getAddressDisplayLabel(selectedBuilding),
      rnb_id: selectedBuilding.rnb_id,
      rnb_match_confidence: {
        code: selectedBuilding.rnb_match_confidence,
        label: getRnbMatchConfidenceLabel(selectedBuilding.rnb_match_confidence),
      },
      rnb_match_reason: {
        code: selectedBuilding.rnb_match_reason,
        label: getRnbMatchReasonLabel(selectedBuilding.rnb_match_reason),
      },
      bdnb_id: selectedBuilding.bdnb_id,
      storeys: selectedBuilding.storeys,
      storeys_source: {
        code: selectedBuilding.storeys_source,
        label: getStoreysSourceLabel(selectedBuilding.storeys_source),
      },
      storeys_confidence: {
        code: selectedBuilding.storeys_confidence,
        label: getStoreysConfidenceLabel(selectedBuilding.storeys_confidence),
      },
      height_source: {
        code: selectedBuilding.height_source,
        label: getHeightSourceLabel(selectedBuilding.height_source),
      },
    });
    console.log("rnb_match_debug", selectedBuilding.rnb_match_debug || {});
    console.log("storeys_debug", selectedBuilding.storeys_debug || {});
    console.groupEnd();
  }, [selectedBuilding]);

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedBuilding || !summary?.verdict_breakdown) {
      return;
    }

    console.groupCollapsed(
      `[verdict] ${selectedBuilding.name || selectedBuilding.id}`
    );
    console.log("verdict", {
      label: summary.verdict,
      score: summary.verdict_score,
      primary: summary.verdict_primary,
      insights: summary.verdict_insights,
    });
    console.log("verdict_breakdown", summary.verdict_breakdown);
    console.groupEnd();
  }, [selectedBuilding, summary]);

  async function handleSearch() {
    const query = address.trim();
    if (!query) {
      return;
    }

    setLoading(true);
    setStatus("Géocodage de l'adresse…");

    try {
      const hit = await geocodeAddress(query);
      const liveCenter = {
        lat: hit.lat,
        lng: hit.lng,
        label: hit.label,
      };

      setStatus("Chargement des bâtiments environnants…");
      const [liveBuildings, nearbyAddressesResult, bdTopoBuildings, rnbBuildings] =
        await Promise.all([
          fetchBuildingsFromOverpass(liveCenter),
          fetchNearbyAddresses(liveCenter).catch((addressError) => {
            console.warn("[address] lookup failed", addressError);
            return [];
          }),
          fetchBdTopoBuildings(liveCenter).catch((bdTopoError) => {
            console.warn("[bdtopo] lookup failed", bdTopoError);
            return [];
          }),
          fetchRnbBuildings(liveCenter).catch((rnbError) => {
            console.warn("[rnb] lookup failed", rnbError);
            return [];
          }),
        ]);
      const buildingsWithBdTopo = applyBdTopoHeightOverrides(
        liveBuildings,
        bdTopoBuildings
      );
      const buildingsWithAddresses = matchAddressesToBuildings(
        buildingsWithBdTopo,
        nearbyAddressesResult
      );
      const buildingsWithRnb = matchRnbToBuildings(
        buildingsWithAddresses,
        rnbBuildings
      );
      const bdnbBuildings = await fetchBdnbBuildings({
        rnbIds: buildingsWithRnb.map((building) => building.rnb_id),
      }).catch((bdnbError) => {
        console.warn("[bdnb] lookup failed", bdnbError);
        return [];
      });
      const matchedBuildings = applyBdnbStoreyOverrides(
        buildingsWithRnb,
        bdnbBuildings
      );

      setCenter(liveCenter);
      setBuildings(matchedBuildings);
      setSelectedFacade(null);
      setSummary(null);
      setDebugEvaluation(null);
      setStatus(
        `${matchedBuildings.length} bâtiments chargés autour de ${hit.label}.`
      );
    } catch (error) {
      console.error(error);
      setCenter(DEFAULT_CENTER);
      setBuildings(initialBuildings);
      setSelectedFacade(null);
      setSummary(null);
      setDebugEvaluation(null);
      setStatus(
        `Chargement échoué — retour à la scène de démonstration.`
      );
    } finally {
      setLoading(false);
    }
  }

  const currentTimelineTime =
    Math.round(minutes / DEFAULT_TIME_RANGE.slotMinutes) *
    DEFAULT_TIME_RANGE.slotMinutes;
  const currentTimelineEntry =
    summary?.timeline.find((entry) => entry.time === currentTimelineTime) || null;

  return (
    <div className="app-shell">
      <ControlPanel
        address={address}
        buildingCount={buildings.length}
        cameraPreset={cameraPreset}
        center={center}
        floor={floor}
        loading={loading}
        minutes={minutes}
        onAddressChange={setAddress}
        onCameraPresetChange={setCameraPreset}
        onFloorChange={(value) =>
          setFloor(Math.min(Math.max(value, MIN_FLOOR), MAX_FLOOR))
        }
        onMinutesChange={setMinutes}
        onSearch={handleSearch}
        onSeasonChange={setSeason}
        onShowDebugPointsChange={setShowDebugPoints}
        season={season}
        showDebugPoints={showDebugPoints}
        source={buildings[0]?.source || "demo"}
        status={status}
      />

      <main className="viewport-shell">
        <SceneViewport
          ref={sceneRef}
          buildings={buildings}
          cameraPreset={cameraPreset}
          debugEvaluation={debugEvaluation}
          effectiveFloor={effectiveFloor}
          onSceneReady={handleSceneReady}
          onSelectFacade={setSelectedFacade}
          selectedFacade={selectedFacade}
          showDebugPoints={showDebugPoints}
          sunInfo={sunInfo}
        />

        <div className="viewport-badge-stack">
          <div className="status-pill">
            <span className="status-pill__label">Altitude soleil</span>
            <strong>{Math.round(sunInfo.altitudeDegrees)}°</strong>
          </div>
          <div className="status-pill">
            <span className="status-pill__label">Source</span>
            <strong>{buildings[0]?.source === "osm" ? "OpenStreetMap" : "Démo"}</strong>
          </div>
        </div>

        <SunArc sunInfo={sunInfo} />
      </main>

      <FacadePanel
        building={selectedBuilding}
        currentTimelineEntry={currentTimelineEntry}
        effectiveFloor={effectiveFloor}
        isClampedFloor={Boolean(isClampedFloor)}
        onSelectEdge={(edgeIndex) =>
          setSelectedFacade((current) =>
            current
              ? { ...current, edgeIndex }
              : selectedBuilding
                ? { buildingId: selectedBuilding.id, edgeIndex }
                : null
          )
        }
        requestedFloor={floor}
        season={season}
        summary={summary}
      />
    </div>
  );
}
