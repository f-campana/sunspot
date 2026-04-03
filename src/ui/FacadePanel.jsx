import {
  CAMERA_PRESETS,
  SEASONS,
  floorLabel,
  formatMinutes,
} from "../constants.js";
import {
  getAddressDisplayLabel,
} from "../data/addressMatching.js";
import {
  getHeightConfidenceLabel,
  getHeightSourceLabel,
} from "../data/height.js";
import {
  getStoreysConfidenceLabel,
  getStoreysSourceLabel,
} from "../data/storeys.js";
import {
  getFacadeAccentColor,
  getFacadeLabel,
} from "../geometry/facades.js";

function timelineSlotStyle(entry, isCurrent) {
  const background =
    entry.state === "night"
      ? "#0e0f13"
      : entry.ratio > 0
        ? `rgba(245,166,35,${0.12 + entry.ratio * 0.68})`
        : "rgba(255,255,255,0.03)";

  return {
    background,
    outline: isCurrent ? "1.5px solid rgba(255,255,255,0.85)" : "none",
    outlineOffset: isCurrent ? "-1px" : undefined,
  };
}

export default function FacadePanel({
  building,
  currentTimelineEntry,
  effectiveFloor,
  isClampedFloor,
  buildingCount,
  cameraPreset,
  mobileSheetMode,
  onSelectEdge,
  onCameraPresetChange,
  onFloorChange,
  onMobileSheetModeChange,
  onMinutesChange,
  onSeasonChange,
  onShowDebugPointsChange,
  requestedFloor,
  minutes,
  season,
  showDebugPoints,
  source,
  summary,
}) {
  const hasSelection = Boolean(building && summary);
  const sheetState = hasSelection ? mobileSheetMode : "idle";
  const detailOpen = sheetState === "details";

  function formatDirectSunHours(hours) {
    return new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: hours < 10 && hours % 1 !== 0 ? 1 : 0,
    }).format(hours);
  }

  function handleSheetHandleClick() {
    if (!hasSelection) {
      return;
    }
    onMobileSheetModeChange(detailOpen ? "result" : "details");
  }

  if (!hasSelection) {
    return (
      <aside
        className={`facade-panel facade-panel--empty facade-panel--sheet facade-panel--${sheetState}`}
      >
        <button
          aria-hidden="true"
          className="sheet-handle-button"
          tabIndex={-1}
          type="button"
        >
          <div className="sheet-handle" />
        </button>
        <div className="empty-state empty-state--sheet">
          <p className="eyebrow">Interaction</p>
          <h2>Sélectionnez une façade</h2>
          <p>
            Touchez une face du bâtiment pour voir immédiatement si la lumière y est bonne.
          </p>
        </div>
      </aside>
    );
  }

  const addressDisplay = getAddressDisplayLabel(building);
  const verdictMeta = summary.verdict_meta;
  const lowConfidenceHeight = building.height_confidence === "low";
  const lowConfidenceStoreys = building.storeys_confidence === "low";

  return (
    <aside
      className={`facade-panel facade-panel--sheet facade-panel--${sheetState}`}
    >
      <button
        aria-expanded={detailOpen}
        aria-label={detailOpen ? "Réduire le détail" : "Déployer le détail"}
        className="sheet-handle-button"
        onClick={handleSheetHandleClick}
        type="button"
      >
        <div className="sheet-handle" />
      </button>
      {/* Block A — Identity */}
      <div className="facade-panel__header">
        <div
          className="edge-swatch"
          style={{ backgroundColor: summary.edgeColor }}
        />
        <div style={{ flex: 1 }}>
          <div className="facade-panel__title-row">
            <h2>
              {building.name || "Bâtiment"} —{" "}
              <span style={{ color: summary.edgeColor }}>
                Façade {summary.edgeLabel.toLowerCase()}
              </span>
            </h2>
          </div>
          {addressDisplay.label && (
            <p className="facade-panel__address-line" style={{ marginTop: 6 }}>
              {addressDisplay.label}
            </p>
          )}
        </div>
      </div>

      {/* Block B — Verdict Card (hero) */}
      <section className="facade-section facade-section--verdict">
        <div
          className={`verdict-card verdict-card--${verdictMeta.tone}`}
          style={{
            "--verdict-color": verdictMeta.color,
            "--verdict-accent": verdictMeta.accent,
          }}
        >
          <div className="verdict-card__row">
            <div>
              <p className="verdict-card__eyebrow">Verdict Sunspot</p>
              <h3 className="verdict-card__label">{summary.verdict}</h3>
            </div>
            <div className="verdict-score">
              <span className="verdict-score__value">{summary.verdict_score}</span>
              <span className="verdict-score__suffix">/100</span>
            </div>
          </div>
          <p className="verdict-card__primary">{summary.verdict_primary}</p>
          {summary.verdict_insights?.length > 0 && (
            <div className="verdict-insights">
              {summary.verdict_insights.slice(0, 3).map((line) => (
                <p className="verdict-insight" key={line}>
                  {line}
                </p>
              ))}
            </div>
          )}
          <p className="verdict-card__summary-line">
            {formatDirectSunHours(summary.hours)} h de soleil direct
            {summary.bestWindow
              ? ` • meilleur créneau ${formatMinutes(summary.bestWindow.start)}–${formatMinutes(summary.bestWindow.end)}`
              : ""}
          </p>
        </div>
      </section>

      <section className="facade-section facade-section--timeline-primary">
        <div className="section-heading">
          <span>Journée</span>
          <strong className="timeline-readout">
            {currentTimelineEntry
              ? `${formatMinutes(currentTimelineEntry.time)} · ${Math.round(currentTimelineEntry.ratio * 100)}%`
              : ""}
          </strong>
        </div>
        <div className="timeline-strip">
          {summary.timeline.map((entry) => (
            <div
              className="timeline-slot"
              key={entry.time}
              style={timelineSlotStyle(
                entry,
                currentTimelineEntry?.time === entry.time
              )}
              title={`${formatMinutes(entry.time)} — ${Math.round(entry.ratio * 100)}%`}
            />
          ))}
        </div>
        <div className="timeline-ticks">
          <span>06h</span>
          <span>09h</span>
          <span>12h</span>
          <span>15h</span>
          <span>18h</span>
          <span>21h</span>
        </div>
      </section>

      <section className="facade-section sheet-controls mobile-only">
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

        <div className="sheet-controls__group">
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
        </div>

        <div className="sheet-controls__group">
          <div className="section-heading">
            <span>Étage</span>
            <strong>{floorLabel(requestedFloor)}</strong>
          </div>
          <div className="stepper">
            <button
              className="stepper__button"
              onClick={() => onFloorChange(requestedFloor - 1)}
            >
              −
            </button>
            <div className="stepper__value">
              <strong>{floorLabel(requestedFloor)}</strong>
              <span>Environ {requestedFloor * 3} m</span>
            </div>
            <button
              className="stepper__button"
              onClick={() => onFloorChange(requestedFloor + 1)}
            >
              +
            </button>
          </div>
        </div>
      </section>

      {/* Detail toggle */}
      <button
        className="detail-toggle"
        onClick={() =>
          onMobileSheetModeChange(detailOpen ? "result" : "details")
        }
        aria-expanded={detailOpen}
      >
        <span className="detail-toggle__icon">{detailOpen ? "▾" : "▸"}</span>
        {detailOpen ? "Masquer le détail" : "Voir le détail technique"}
      </button>

      {/* Expandable detail panel */}
      {detailOpen && (
        <div className="detail-panel">
          {/* Timeline */}
          <div className="detail-panel__section">
            <div className="section-heading">
              <span>Résumé</span>
            </div>
            <p className="detail-summary-line">
              {summary.hours.toFixed(1)}h de soleil direct
              {summary.bestWindow
                ? ` · meilleur créneau ${formatMinutes(summary.bestWindow.start)}–${formatMinutes(summary.bestWindow.end)}`
              : ""}
            </p>
          </div>

          {/* Vertical exposure */}
          <div className="detail-panel__section">
            <div className="section-heading">
              <span>Exposition verticale</span>
            </div>
            <div className="vertical-bars">
              <div>
                <div className="bar-row">
                  <span>Haut</span>
                  <strong>{Math.round(summary.topRatio * 100)}%</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      backgroundColor: "#f6b444",
                      width: `${summary.topRatio * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="bar-row">
                  <span>Bas</span>
                  <strong>{Math.round(summary.bottomRatio * 100)}%</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      backgroundColor: "#eb8f73",
                      width: `${summary.bottomRatio * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Trust / data reliability */}
          <div className="detail-panel__section">
            <div className="section-heading">
              <span>Fiabilité des données</span>
            </div>
            <div className="trust-compact">
              <p className="trust-line">
                <span className="trust-line__label">Hauteur</span>
                <span>{Math.round(building.height_m)} m · {getHeightSourceLabel(building.height_source)} · {getHeightConfidenceLabel(building.height_confidence)}</span>
              </p>
              <p className="trust-line">
                <span className="trust-line__label">Étages</span>
                <span>{building.storeys || 0} · {getStoreysSourceLabel(building.storeys_source)} · {getStoreysConfidenceLabel(building.storeys_confidence)}</span>
              </p>
              {building.rnb_id && (
                <p className="trust-line">
                  <span className="trust-line__label">RNB</span>
                  <span>{building.rnb_id}</span>
                </p>
              )}
              {building.bdnb_id && building.storeys_source === "bdnb" && (
                <p className="trust-line">
                  <span className="trust-line__label">BDNB</span>
                  <span>{building.bdnb_id}</span>
                </p>
              )}
            </div>
          </div>

          <div className="detail-panel__section mobile-only">
            <div className="section-heading">
              <span>Réglages avancés</span>
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
            <label className="toggle toggle--detail">
              <input
                checked={showDebugPoints}
                onChange={(event) => onShowDebugPointsChange(event.target.checked)}
                type="checkbox"
              />
              <span>Points d’échantillonnage</span>
            </label>
          </div>

          <div className="detail-panel__section mobile-only">
            <div className="section-heading">
              <span>Contexte</span>
            </div>
            <div className="trust-compact">
              <p className="trust-line">
                <span className="trust-line__label">Source</span>
                <span>{source === "osm" ? "OpenStreetMap" : "Démo"}</span>
              </p>
              <p className="trust-line">
                <span className="trust-line__label">Bâtiments</span>
                <span>{buildingCount}</span>
              </p>
            </div>
          </div>

          <div className="detail-panel__section mobile-only">
            <div className="section-heading">
              <span>Façades</span>
            </div>
            <div className="edge-list">
              {building.edges
                .filter((edge) => edge.len > 4)
                .map((edge) => {
                  const isActive = edge.index === summary.edgeIndex;
                  const color = getFacadeAccentColor(edge);
                  return (
                    <button
                      className={
                        isActive ? "edge-button is-active" : "edge-button"
                      }
                      key={edge.index}
                      onClick={() => {
                        onMobileSheetModeChange("result");
                        onSelectEdge(edge.index);
                      }}
                      style={
                        isActive
                          ? {
                              borderColor: color,
                              backgroundColor: `${color}20`,
                              color,
                            }
                          : undefined
                      }
                    >
                      {getFacadeLabel(edge)} {Math.round(edge.len)}{"\u00a0"}m
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Floor clamp warning */}
      {isClampedFloor && (
        <p className="panel-micro" style={{ marginTop: 8 }}>
          Étage demandé : {floorLabel(requestedFloor)} — limité
          à {floorLabel(effectiveFloor)} selon le nombre d'étages estimé du bâtiment
          {lowConfidenceStoreys || lowConfidenceHeight
            ? " (donnée approximative)."
            : "."}
        </p>
      )}

      {/* Block C — Facade Switcher */}
      <section className="facade-section desktop-only">
        <div className="section-heading">
          <span>
            Façades ({building.edges.filter((e) => e.len > 4).length})
          </span>
        </div>
        <div className="edge-list">
          {building.edges
            .filter((edge) => edge.len > 4)
            .map((edge) => {
              const isActive = edge.index === summary.edgeIndex;
              const color = getFacadeAccentColor(edge);
              return (
                <button
                  className={
                    isActive ? "edge-button is-active" : "edge-button"
                  }
                  key={edge.index}
                  onClick={() => {
                    onMobileSheetModeChange("result");
                    onSelectEdge(edge.index);
                  }}
                  style={
                    isActive
                      ? {
                          borderColor: color,
                          backgroundColor: `${color}20`,
                          color,
                        }
                      : undefined
                  }
                >
                  {getFacadeLabel(edge)} {Math.round(edge.len)}{"\u00a0"}m
                </button>
              );
            })}
        </div>
      </section>
    </aside>
  );
}
