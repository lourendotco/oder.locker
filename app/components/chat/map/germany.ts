// Germany's mainland outline as [lng, lat], from Natural Earth 1:50m (public
// domain) simplified to ~5km. Islands are left out, and towns right on the
// border may fall on either side.
// prettier-ignore
// https://chatgpt.com/share/6ac74408-8188-83eb-914a-e82094d4ca28

const OUTLINE: [number, number][] = [
  [9.52, 47.52], [8.57, 47.78], [8.4, 47.69], [8.57, 47.64], [8.43, 47.59], [7.57, 47.61],
  [7.62, 48.16], [7.84, 48.64], [8.14, 48.89], [8.13, 48.97], [7.45, 49.15], [6.74, 49.16],
  [6.53, 49.39], [6.34, 49.45], [6.49, 49.8], [6.26, 49.87], [6.11, 50.09], [6.18, 50.23],
  [6.36, 50.32], [6.34, 50.45], [6.18, 50.52], [6.24, 50.6], [5.99, 50.75], [6.05, 50.9],
  [5.86, 51.03], [6.13, 51.15], [6.08, 51.22], [6.2, 51.45], [5.95, 51.8], [6.74, 51.91],
  [6.8, 51.98], [6.72, 52.08], [7.02, 52.27], [7, 52.42], [6.69, 52.53], [6.75, 52.63],
  [7.01, 52.63], [7.18, 52.97], [7.2, 53.28], [7.05, 53.38], [7.21, 53.65], [8.01, 53.69],
  [8.17, 53.54], [8.11, 53.47], [8.25, 53.45], [8.33, 53.61], [8.49, 53.51], [8.5, 53.39],
  [8.53, 53.78], [8.62, 53.88], [9.21, 53.86], [9.78, 53.55], [9.31, 53.86], [8.98, 53.93],
  [8.91, 54.26], [8.64, 54.29], [8.65, 54.4], [8.95, 54.47], [8.96, 54.54], [8.67, 54.9],
  [9.74, 54.83], [10.02, 54.67], [10.03, 54.58], [9.87, 54.47], [10.14, 54.49], [10.73, 54.32],
  [11.01, 54.38], [11.06, 54.28], [10.81, 54.08], [10.85, 54.01], [11.4, 53.94], [11.8, 54.15],
  [12.11, 54.17], [12.58, 54.47], [13.03, 54.41], [13.45, 54.14], [13.72, 54.15], [13.87, 53.85],
  [14.26, 53.73], [14.41, 53.2], [14.13, 52.88], [14.62, 52.53], [14.55, 52.36], [14.75, 52.08],
  [14.6, 51.83], [14.72, 51.52], [14.91, 51.46], [15.02, 51.25], [14.77, 50.82], [14.61, 50.86],
  [14.55, 50.99], [14.32, 51.04], [14.26, 51], [14.37, 50.9], [13.56, 50.7], [12.94, 50.41],
  [12.55, 50.39], [12.28, 50.18], [12.09, 50.3], [12.21, 50.1], [12.51, 49.9], [12.39, 49.74],
  [12.68, 49.41], [13.81, 48.77], [13.72, 48.54], [13.49, 48.58], [13.37, 48.36], [12.76, 48.11],
  [12.95, 47.89], [12.9, 47.72], [13.05, 47.66], [13.01, 47.48], [12.69, 47.67], [12.21, 47.72],
  [12.19, 47.62], [11.04, 47.39], [10.87, 47.52], [10.44, 47.55], [10.37, 47.37], [10.18, 47.28],
  [10.2, 47.36], [9.97, 47.51], [9.75, 47.58],
];

const WEST = 5.86;
const EAST = 15.02;
const SOUTH = 47.28;
const NORTH = 54.9;
const RAD = Math.PI / 180;
const SIN_SOUTH = Math.sin(SOUTH * RAD);
const SIN_NORTH = Math.sin(NORTH * RAD);

export function isInGermany(lng: number, lat: number) {
  // ray casting: a point is inside when a ray from it crosses the outline an
  // odd number of times
  let inside = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i];
    const [xj, yj] = OUTLINE[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** A random point of the bounding box, drawn again until it is in Germany;
 * about two in three are. */
export function randomGermanLocation(): [lng: number, lat: number] {
  for (;;) {
    const lng = WEST + Math.random() * (EAST - WEST);
    // even over sin(lat), not lat: a degree of longitude is narrower in the
    // north, which would otherwise get more points per km²
    const lat =
      Math.asin(SIN_SOUTH + Math.random() * (SIN_NORTH - SIN_SOUTH)) / RAD;
    if (isInGermany(lng, lat)) return [lng, lat];
  }
}
