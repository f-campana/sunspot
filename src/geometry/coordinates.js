export function metersPerDegreeLat() {
  return 111_320;
}

export function metersPerDegreeLng(lat) {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export function latLngToLocal(lat, lng, origin) {
  return {
    x: (lng - origin.lng) * metersPerDegreeLng(origin.lat),
    z: (lat - origin.lat) * -metersPerDegreeLat(),
  };
}

export function localToLatLng(x, z, origin) {
  return {
    lat: origin.lat + z / -metersPerDegreeLat(),
    lng: origin.lng + x / metersPerDegreeLng(origin.lat),
  };
}
