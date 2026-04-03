import {
  CAMERA_PRESETS,
  SEASONS,
  floorLabel,
  formatMinutes,
} from "../constants.js";

export default function ControlPanel({
  address,
  buildingCount,
  cameraPreset,
  center,
  floor,
  loading,
  minutes,
  onAddressChange,
  onCameraPresetChange,
  onFloorChange,
  onMinutesChange,
  onSearch,
  onSeasonChange,
  onShowDebugPointsChange,
  panelRef,
  season,
  showDebugPoints,
  source,
  status,
}) {
  return (
    <aside className="control-panel" ref={panelRef}>
      <div className="control-panel__header">
        <div className="brand-chip">SUN</div>
        <div>
          <p className="eyebrow">Analyse d'ensoleillement</p>
          <h1>Sunspot</h1>
        </div>
      </div>

      <section className="panel-section panel-section--address">
        <div className="section-heading">
          <span>Adresse</span>
        </div>
        <div className="address-row">
          <input
            className="text-input"
            onChange={(event) => onAddressChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="12 rue Anatole France, Levallois-Perret"
            value={address}
          />
          <button className="primary-button" disabled={loading} onClick={onSearch}>
            {loading ? "Chargement" : "Rechercher"}
          </button>
        </div>
        <p className="panel-muted desktop-only-control">{status}</p>
        <div className="meta-grid desktop-only-control">
          <div className="meta-card">
            <span className="meta-label">Source</span>
            <strong>{source === "osm" ? "OpenStreetMap" : "Démo"}</strong>
          </div>
          <div className="meta-card">
            <span className="meta-label">Bâtiments</span>
            <strong>{buildingCount}</strong>
          </div>
        </div>
        <p className="panel-micro desktop-only-control">{center.label}</p>
      </section>

      <section className="panel-section desktop-only-control">
        <div className="section-heading">
          <span>Heure</span>
          <strong>{formatMinutes(minutes)}</strong>
        </div>
        <input
          className="range-input"
          max={22 * 60}
          min={5 * 60}
          onChange={(event) => onMinutesChange(Number(event.target.value))}
          step={5}
          type="range"
          value={minutes}
        />
        <div className="range-labels">
          <span>05h</span>
          <span>12h</span>
          <span>22h</span>
        </div>
      </section>

      <section className="panel-section desktop-only-control">
        <div className="section-heading">
          <span>Saison</span>
        </div>
        <div className="button-grid button-grid--four">
          {Object.entries(SEASONS).map(([key, definition]) => (
            <button
              className={key === season ? "segmented-button is-active" : "segmented-button"}
              key={key}
              onClick={() => onSeasonChange(key)}
            >
              {definition.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section desktop-only-control">
        <div className="section-heading">
          <span>Étage</span>
          <strong>{floorLabel(floor)}</strong>
        </div>
        <div className="stepper">
          <button className="stepper__button" onClick={() => onFloorChange(floor - 1)}>
            −
          </button>
          <div className="stepper__value">
            <strong>{floorLabel(floor)}</strong>
            <span>Environ {floor * 3} m</span>
          </div>
          <button className="stepper__button" onClick={() => onFloorChange(floor + 1)}>
            +
          </button>
        </div>
      </section>

      <section className="panel-section desktop-only-control">
        <div className="section-heading">
          <span>Vue</span>
        </div>
        <div className="button-grid">
          {Object.entries(CAMERA_PRESETS).map(([key, preset]) => (
            <button
              className={cameraPreset === key ? "segmented-button is-active" : "segmented-button"}
              key={key}
              onClick={() => onCameraPresetChange(key)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section panel-section--toggle desktop-only-control">
        <label className="toggle">
          <input
            checked={showDebugPoints}
            onChange={(event) => onShowDebugPointsChange(event.target.checked)}
            type="checkbox"
          />
          <span>Points d'échantillonnage</span>
        </label>
      </section>
    </aside>
  );
}
