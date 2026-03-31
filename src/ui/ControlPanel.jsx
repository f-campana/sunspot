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
  season,
  showDebugPoints,
  source,
  status,
}) {
  return (
    <aside className="control-panel">
      <div className="control-panel__header">
        <div className="brand-chip">SUN</div>
        <div>
          <p className="eyebrow">Facade-level daylight analysis</p>
          <h1>Sunspot</h1>
        </div>
      </div>

      <section className="panel-section">
        <div className="section-heading">
          <span>Address search</span>
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
            {loading ? "Loading" : "Search"}
          </button>
        </div>
        <p className="panel-muted">{status}</p>
        <div className="meta-grid">
          <div>
            <span className="meta-label">Source</span>
            <strong>{source === "osm" ? "OpenStreetMap" : "Demo scene"}</strong>
          </div>
          <div>
            <span className="meta-label">Buildings</span>
            <strong>{buildingCount}</strong>
          </div>
        </div>
        <p className="panel-micro">{center.label}</p>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span>Time</span>
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
          <span>05:00</span>
          <span>12:00</span>
          <span>22:00</span>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span>Day selection</span>
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

      <section className="panel-section">
        <div className="section-heading">
          <span>Floor band</span>
          <strong>{floorLabel(floor)}</strong>
        </div>
        <div className="stepper">
          <button className="stepper__button" onClick={() => onFloorChange(floor - 1)}>
            -
          </button>
          <div className="stepper__value">
            <strong>{floorLabel(floor)}</strong>
            <span>Approx. {floor * 3} m above grade</span>
          </div>
          <button className="stepper__button" onClick={() => onFloorChange(floor + 1)}>
            +
          </button>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span>Scene view</span>
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

      <section className="panel-section panel-section--toggle">
        <label className="toggle">
          <input
            checked={showDebugPoints}
            onChange={(event) => onShowDebugPointsChange(event.target.checked)}
            type="checkbox"
          />
          <span>Show facade sample points</span>
        </label>
        <p className="panel-micro">
          Amber = lit, red = blocked, grey = inactive for the current time slot.
        </p>
      </section>
    </aside>
  );
}
