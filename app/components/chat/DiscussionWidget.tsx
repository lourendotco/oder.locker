import { useEffect, useState } from "react";
import { svgMap, type SvgMap } from "./map/svgmap";

const locations: [number, number][] = [
  [10.8978, 48.3705],
  [8.2473, 49.9929],
  [6.9603, 50.9375],
  [8.2398, 50.0782],
  [8.6821, 50.1109],
  [13.405, 52.52],
  [12.3731, 51.3397],
  [6.7735, 51.2277],
  [7.8494, 48.9977],
  [11.582, 48.1351],
  [13.7373, 51.0504],
  [8.8017, 53.0793],
  [7.0116, 51.4556],
  [7.6282, 51.9616],
  [9.1829, 48.7758],
  [9.732, 52.3759],
  [11.0767, 49.4521],
  [8.4037, 49.0069],
  [9.9937, 53.5511],
  [7.4653, 51.5136],
];

const VIEW = { width: 720, height: 540, zoom: 16 };
const STAY = 4000;

export default function DiscussionWidget() {
  // the map on show and, while it fades in, the one underneath it
  const [maps, setMaps] = useState<{ id: number; map: SvgMap }[]>([]);

  useEffect(() => {
    const abort = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    let index = 0;

    // the current map stays up until the next one is fully loaded, so there is
    // never an empty frame in between
    const next = async () => {
      const id = index++;
      try {
        const map = await svgMap({
          center: locations[id % locations.length],
          ...VIEW,
          signal: abort.signal,
        });
        setMaps((old) => [...old.slice(-1), { id, map }]);
      } catch {
        if (abort.signal.aborted) return;
        // a location that fails to load is skipped
      }
      timeout = setTimeout(next, STAY);
    };
    next();

    return () => {
      abort.abort();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="relative -mr-[20px] ml-[10px] aspect-4/3 h-auto scroll-mt-(--header-height) overflow-hidden rounded-[2.5rem] bg-white text-black shadow-md">
      <MapPatterns />
      {maps.map(({ id, map }) => (
        <MapSvg key={id} map={map} />
      ))}
      <div className="absolute top-5 right-5 flex flex-col items-center text-xl bg-primary text-white px-2 rounded-full">
        waiting...
      </div>
    </div>
  );
}

const WATER = "#a6e4f7";

/** The terrain textures, as svg patterns instead of a sprite sheet. Rendered
 * once, every map refers to them by id. */
function MapPatterns() {
  return (
    <svg aria-hidden width={0} height={0} className="absolute">
      <defs>
        {/* grass: fine ticks */}
        <pattern
          id="map-dash"
          width={5}
          height={8}
          patternUnits="userSpaceOnUse"
        >
          <rect width={5} height={8} fill="#1f1f1f" />
          <path d="M2.5 1v3" stroke="#fff" strokeWidth={9} />
        </pattern>
        {/* woods: staggered rings */}
        <pattern
          id="map-dots"
          width={14}
          height={14}
          patternUnits="userSpaceOnUse"
        >
          <rect width={14} height={14} fill="#fff" />
          <g fill="none" stroke="#555" strokeWidth={1}>
            <circle cx={3.5} cy={3.5} r={1.8} />
            <circle cx={10.5} cy={10.5} r={1.8} />
          </g>
        </pattern>
        {/* cemeteries: crosses */}
        <pattern
          id="map-cross"
          width={22}
          height={26}
          patternUnits="userSpaceOnUse"
        >
          <rect width={22} height={26} fill="#9c9c9c" />
          <path d="M11 8v10M6 13h10" stroke="#ebeaea" strokeWidth={1.5} />
        </pattern>
        {/* buildings: diagonal hatching */}
        <pattern
          id="map-hatch"
          width={7}
          height={7}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={7} height={7} fill="#000" />
          <path d="M0 3.5h7" stroke="#fff" strokeWidth={5} />
        </pattern>
      </defs>
    </svg>
  );
}

function MapSvg({ map }: { map: SvgMap }) {
  return (
    <svg
      viewBox={`0 0 ${map.width} ${map.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute inset-0 h-full w-full transition-opacity duration-700 motion-reduce:transition-none starting:opacity-0"
      style={{ background: WATER }}
    >
      <path d={map.earth} fill="#fff" />
      <path d={map.grass} fill="url(#map-dash)" />
      <path d={map.wood} fill="url(#map-dots)" />
      <path d={map.cemetery} fill="url(#map-cross)" />
      <path d={map.water} fill={WATER} />
      <path d={map.waterways} stroke="#000" strokeWidth={2} />
      {/* white, so they only show where they cut through grass and woods */}
      <path d={map.paths} stroke="#fff" strokeWidth={3} />
      <path d={map.minor} stroke="#000" strokeWidth={4} />
      <path d={map.major} stroke="#000" strokeWidth={7} />
      <path d={map.rail} stroke="#555" strokeWidth={1.5} />
      <path
        d={map.rail}
        stroke="#262626"
        strokeWidth={7}
        strokeDasharray="1.5 9"
        strokeLinecap="butt"
      />
      <path d={map.buildings} fill="url(#map-hatch)" />
      <g
        className="font-antonio"
        textAnchor="middle"
        stroke="#fff"
        strokeWidth={6}
        paintOrder="stroke"
      >
        {map.labels.map((label) => (
          <text
            key={`${label.name}-${label.x}-${label.y}`}
            x={label.x}
            y={label.y}
            fontSize={label.size}
            fontWeight={label.main ? 700 : 600}
            fill={label.main ? "black" : "#0a0a0a"}
          >
            {label.name}
          </text>
        ))}
      </g>
    </svg>
  );
}
