import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CENTER,
  DEFAULT_TIME_RANGE,
  MAX_FLOOR,
  MIN_FLOOR,
  getSeasonDate,
} from "./constants.js";
import { DEMO_BUILDINGS_RAW } from "./data/demoBuildings.js";
import { geocodeAddress } from "./data/geocode.js";
import { fetchBuildingsFromOverpass } from "./data/osm.js";
import {
  getMaxFloorIndex,
  preprocessBuildings,
} from "./data/buildings.js";
import {
  computeSunExposure,
  evaluateFacadeAtTime,
} from "./engine/exposure.js";
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
    "Ready. Search an address to load live OSM buildings or use the fallback block."
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

  // Auto-select a meaningful demo facade on first load so the app
  // immediately demonstrates value instead of showing an empty state.
  const hasAutoSelected = useRef(false);
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

    setSummary({
      ...exposure,
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

  async function handleSearch() {
    const query = address.trim();
    if (!query) {
      return;
    }

    setLoading(true);
    setStatus("Geocoding address...");

    try {
      const hit = await geocodeAddress(query);
      const liveCenter = {
        lat: hit.lat,
        lng: hit.lng,
        label: hit.label,
      };

      setStatus("Fetching nearby buildings from Overpass...");
      const liveBuildings = await fetchBuildingsFromOverpass(liveCenter);

      setCenter(liveCenter);
      setBuildings(liveBuildings);
      setSelectedFacade(null);
      setSummary(null);
      setDebugEvaluation(null);
      setStatus(
        `Loaded ${liveBuildings.length} buildings around ${hit.label} (${hit.source}).`
      );
    } catch (error) {
      console.error(error);
      setCenter(DEFAULT_CENTER);
      setBuildings(initialBuildings);
      setSelectedFacade(null);
      setSummary(null);
      setDebugEvaluation(null);
      setStatus(
        `Live fetch failed. Falling back to demo block (${error.message || "unknown error"}).`
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
          onSceneReady={() => setSceneRevision((value) => value + 1)}
          onSelectFacade={setSelectedFacade}
          selectedFacade={selectedFacade}
          showDebugPoints={showDebugPoints}
          sunInfo={sunInfo}
        />

        <div className="viewport-badge-stack">
          <div className="status-pill">
            <span className="status-pill__label">Sun altitude</span>
            <strong>{Math.round(sunInfo.altitudeDegrees)}°</strong>
          </div>
          <div className="status-pill">
            <span className="status-pill__label">Loaded source</span>
            <strong>{buildings[0]?.source === "osm" ? "OpenStreetMap" : "Demo"}</strong>
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
