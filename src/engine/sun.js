import * as THREE from "three";

const RAD = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;
const DAY_MS = 864e5;
const EARTH_OBLIQUITY = 23.4397 * RAD;

function toJulian(date) {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}

function toDays(date) {
  return toJulian(date) - J2000;
}

function rightAscension(lambda, beta) {
  return Math.atan2(
    Math.sin(lambda) * Math.cos(EARTH_OBLIQUITY) -
      Math.tan(beta) * Math.sin(EARTH_OBLIQUITY),
    Math.cos(lambda)
  );
}

function declination(lambda, beta) {
  return Math.asin(
    Math.sin(beta) * Math.cos(EARTH_OBLIQUITY) +
      Math.cos(beta) *
        Math.sin(EARTH_OBLIQUITY) *
        Math.sin(lambda)
  );
}

function azimuth(hourAngle, latitude, declinationValue) {
  return Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) -
      Math.tan(declinationValue) * Math.cos(latitude)
  );
}

function altitude(hourAngle, latitude, declinationValue) {
  return Math.asin(
    Math.sin(latitude) * Math.sin(declinationValue) +
      Math.cos(latitude) *
        Math.cos(declinationValue) *
        Math.cos(hourAngle)
  );
}

function solarMeanAnomaly(days) {
  return (357.5291 + 0.98560028 * days) * RAD;
}

function eclipticLongitude(meanAnomaly) {
  return (
    meanAnomaly +
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly)) *
      RAD +
    102.9372 * RAD +
    Math.PI
  );
}

function siderealTime(days, longitudeWest) {
  return (280.16 + 360.9856235 * days) * RAD - longitudeWest;
}

function sunCoordinates(days) {
  const meanAnomaly = solarMeanAnomaly(days);
  const longitude = eclipticLongitude(meanAnomaly);

  return {
    dec: declination(longitude, 0),
    ra: rightAscension(longitude, 0),
  };
}

export function getSunPosition(date, lat, lng) {
  const longitudeWest = -lng * RAD;
  const latitude = lat * RAD;
  const days = toDays(date);
  const coordinates = sunCoordinates(days);
  const hourAngle = siderealTime(days, longitudeWest) - coordinates.ra;

  return {
    azimuth: azimuth(hourAngle, latitude, coordinates.dec) + Math.PI,
    altitude: altitude(hourAngle, latitude, coordinates.dec),
  };
}

export function getSunDirection(position) {
  return new THREE.Vector3(
    Math.sin(position.azimuth) * Math.cos(position.altitude),
    Math.sin(position.altitude),
    -Math.cos(position.azimuth) * Math.cos(position.altitude)
  ).normalize();
}

export function getSunInfo(date, lat, lng) {
  const position = getSunPosition(date, lat, lng);

  return {
    ...position,
    altitudeDegrees: (position.altitude * 180) / Math.PI,
    direction: getSunDirection(position),
  };
}
