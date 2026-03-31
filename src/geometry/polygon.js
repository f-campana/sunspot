export function polygonSignedArea(poly) {
  let area = 0;

  for (let index = 0; index < poly.length; index += 1) {
    const [x1, z1] = poly[index];
    const [x2, z2] = poly[(index + 1) % poly.length];
    area += x1 * z2 - x2 * z1;
  }

  return area / 2;
}

export function normalizePolygonWinding(poly) {
  if (polygonSignedArea(poly) < 0) {
    return [...poly].reverse();
  }

  return [...poly];
}

export function polygonCentroid(poly) {
  let sumX = 0;
  let sumZ = 0;

  poly.forEach(([x, z]) => {
    sumX += x;
    sumZ += z;
  });

  return {
    x: sumX / poly.length,
    z: sumZ / poly.length,
  };
}

export function dedupePolygon(poly, tolerance = 0.25) {
  const deduped = [];

  poly.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(point);
      return;
    }

    const dx = previous[0] - point[0];
    const dz = previous[1] - point[1];
    if (Math.hypot(dx, dz) > tolerance) {
      deduped.push(point);
    }
  });

  if (deduped.length > 2) {
    const [firstX, firstZ] = deduped[0];
    const [lastX, lastZ] = deduped[deduped.length - 1];
    if (Math.hypot(firstX - lastX, firstZ - lastZ) <= tolerance) {
      deduped.pop();
    }
  }

  return deduped;
}
