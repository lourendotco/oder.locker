import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const PROTOMAPS_KEY = "60f4fa84b14d1301";
// a vector tile covers 512 CSS px at its own zoom level
const TILE = 512;
// the deepest tiles protomaps has, anything closer is these scaled up
const MAX_TILE_ZOOM = 15;
// rough glyph width as a fraction of the font size, for label collisions
const GLYPH = 0.56;

export const LABEL_SIZE = { main: 34, minor: 19 };

const GRASS =
  /^(park|grass|grassland|meadow|garden|village_green|scrub|wetland|allotments|recreation_ground|golf_course)$/;
const WOOD = /^(forest|wood)$/;
// place=locality in OSM is any named spot (car parks, urn fields, ...), so only
// real settlements count
const SETTLEMENT = /^(city|town|village|hamlet)$/;

export type SvgMapLabel = {
  x: number;
  y: number;
  name: string;
  size: number;
  main: boolean;
};

/** Everything needed to draw a map as an svg: one path `d` per layer, in
 * viewBox units of `0 0 width height`. Plain data, so it serializes. */
export type SvgMap = {
  width: number;
  height: number;
  // areas
  earth: string;
  grass: string;
  wood: string;
  farmland: string;
  cemetery: string;
  water: string;
  buildings: string;
  // lines
  waterways: string;
  paths: string;
  minor: string;
  rail: string;
  major: string;
  labels: SvgMapLabel[];
};

export async function svgMap({
  center: [lng, lat],
  zoom,
  width,
  height,
  signal,
}: {
  center: [lng: number, lat: number];
  /** may be fractional or beyond the deepest tiles, those get scaled */
  zoom: number;
  width: number;
  height: number;
  signal?: AbortSignal;
}): Promise<SvgMap> {
  // web mercator, in px of the whole world at this zoom
  const world = 2 ** zoom * TILE;
  const tileZoom = Math.min(Math.floor(zoom), MAX_TILE_ZOOM);
  // px one tile covers in this view
  const size = TILE * 2 ** (zoom - tileZoom);
  const left = ((lng + 180) / 360) * world - width / 2;
  const top =
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * world -
    height / 2;

  const map: SvgMap = {
    width,
    height,
    earth: "",
    grass: "",
    wood: "",
    farmland: "",
    cemetery: "",
    water: "",
    buildings: "",
    waterways: "",
    paths: "",
    minor: "",
    rail: "",
    major: "",
    labels: [],
  };
  const places: (SvgMapLabel & { rank: number })[] = [];

  const jobs: Promise<void>[] = [];
  for (let tx = Math.floor(left / size); tx * size < left + width; tx++) {
    for (let ty = Math.floor(top / size); ty * size < top + height; ty++) {
      jobs.push(
        fetchTile(tileZoom, tx, ty, signal).then((tile) =>
          addTile(tile, tx * size - left, ty * size - top),
        ),
      );
    }
  }
  await Promise.all(jobs);

  // biggest places first, whatever overlaps an already placed one is dropped
  places.sort((a, b) => b.rank - a.rank);
  const boxes: [number, number, number, number][] = [];
  for (const { rank, ...label } of places) {
    const half = (label.name.length * label.size * GLYPH) / 2;
    const box: (typeof boxes)[number] = [
      label.x - half,
      label.y - label.size,
      label.x + half,
      label.y + label.size * 0.3,
    ];
    // a name cut off by the edge reads worse than no name
    if (box[0] < 0 || box[2] > width) continue;
    if (
      boxes.some(
        (b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1],
      )
    ) {
      continue;
    }
    boxes.push(box);
    map.labels.push(label);
  }

  return map;

  function addTile(tile: VectorTile, ox: number, oy: number) {
    const each = (layer: string, fn: (f: VectorTileFeature) => void) => {
      const l = tile.layers[layer];
      for (let i = 0; i < (l?.length ?? 0); i++) fn(l.feature(i));
    };

    const path = (f: VectorTileFeature, close: boolean) => {
      const scale = size / f.extent;
      let d = "";
      for (const ring of f.loadGeometry()) {
        let px = NaN;
        let py = NaN;
        for (const p of ring) {
          // a tenth of a px: whole px make curves and shallow angles wobble
          const x = Math.round((ox + p.x * scale) * 10) / 10;
          const y = Math.round((oy + p.y * scale) * 10) / 10;
          // points that land on the same spot add bytes and nothing else
          if (x === px && y === py) continue;
          d += (Number.isNaN(px) ? "M" : "L") + x + " " + y;
          px = x;
          py = y;
        }
        if (close) d += "Z";
      }
      return d;
    };

    each("earth", (f) => (map.earth += path(f, true)));
    const land = (f: VectorTileFeature) => {
      const kind = String(f.properties.kind);
      if (GRASS.test(kind)) map.grass += path(f, true);
      else if (WOOD.test(kind)) map.wood += path(f, true);
      else if (kind === "farmland") map.farmland += path(f, true);
      else if (kind === "cemetery") map.cemetery += path(f, true);
    };
    each("landcover", land);
    each("landuse", land);
    each("water", (f) => {
      // polygons are the water bodies, lines the centre of rivers and streams
      if (f.type === 3) map.water += path(f, true);
      else if (f.type === 2) map.waterways += path(f, false);
    });
    each("buildings", (f) => {
      if (f.type === 3) map.buildings += path(f, true);
    });
    each("roads", (f) => {
      const kind = f.properties.kind;
      if (kind === "highway" || kind === "major_road") {
        map.major += path(f, false);
      } else if (kind === "minor_road") map.minor += path(f, false);
      else if (kind === "rail") map.rail += path(f, false);
      else if (kind === "path") map.paths += path(f, false);
    });
    each("places", (f) => {
      const { kind, kind_detail, name, population_rank } = f.properties;
      const main = kind === "locality" && SETTLEMENT.test(String(kind_detail));
      if (!name || !(main || kind === "neighbourhood")) return;

      const point = f.loadGeometry()[0][0];
      const x = Math.round(ox + (point.x * size) / f.extent);
      const y = Math.round(oy + (point.y * size) / f.extent);
      // tiles overlap a little, which also brings in places outside the view
      if (x < 0 || y < 0 || x > width || y > height) return;

      places.push({
        x,
        y,
        name: String(name),
        size: main ? LABEL_SIZE.main : LABEL_SIZE.minor,
        main,
        // settlements always win over the quarters inside them
        rank: Number(population_rank ?? 0) + (main ? 100 : 0),
      });
    });
  }
}

async function fetchTile(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `https://api.protomaps.com/tiles/v4/${z}/${x}/${y}.mvt?key=${PROTOMAPS_KEY}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`map tile ${z}/${x}/${y}: ${response.status}`);
  }
  return new VectorTile(
    new PbfReader(new Uint8Array(await response.arrayBuffer())),
  );
}
