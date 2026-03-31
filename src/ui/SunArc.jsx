export default function SunArc({ sunInfo }) {
  const width = 220;
  const height = 70;
  const altitudeRatio = Math.max(0.05, Math.min(1, sunInfo.altitudeDegrees / 55));
  const azimuthDegrees = (sunInfo.azimuth * 180) / Math.PI;
  const azimuthRatio = Math.max(0, Math.min(1, (azimuthDegrees - 50) / 240));
  const arcAngle = azimuthRatio * Math.PI;
  const dotX = width / 2 + Math.cos(Math.PI - arcAngle) * (width / 2 - 8);
  const dotY = height - Math.sin(arcAngle) * height * altitudeRatio;

  return (
    <div className="sun-arc">
      <div className="sun-arc__curve" />
      <div
        className="sun-arc__dot"
        style={{
          backgroundColor: sunInfo.altitudeDegrees > 0 ? "#f6b444" : "#7f8798",
          boxShadow:
            sunInfo.altitudeDegrees > 0
              ? "0 0 18px rgba(246, 180, 68, 0.65)"
              : "none",
          left: `${dotX}px`,
          top: `${dotY}px`,
        }}
      />
      <div className="sun-arc__labels">
        <span>E</span>
        <strong>{Math.round(sunInfo.altitudeDegrees)}°</strong>
        <span>W</span>
      </div>
    </div>
  );
}
