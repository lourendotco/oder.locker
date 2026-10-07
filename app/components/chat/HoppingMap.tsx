import { useEffect, useState } from "react";
import { randomGermanLocation } from "./map/germany";
import { svgMap, type SvgMap } from "./map/svgmap";

const VIEW = { width: 720, height: 540 };
const STAY = 4000;
// change to 4000

/** A map that hops from one place in Germany to the next. It fills the
    nearest positioned ancestor, which is also what clips it. */
export default function HoppingMap() {
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
        const random = Math.random() * 2;
        const map = await svgMap({
          center: randomGermanLocation(),
          ...VIEW,
          zoom: Math.random() > 0.2 ? 12 + random : 15,
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
    <div aria-hidden className="absolute inset-0">
      <MapPatterns />
      {maps.map(({ id, map }) => (
        <MapSvg key={id} map={map} />
      ))}
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
        {/* grass: horizontal stripes. The pattern's height is the distance from
            one stripe to the next, the green rect's height the stripe itself */}
        <pattern
          id="map-dash"
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
        >
          <rect width={8} height={8} fill="#fff" />
          <rect width={8} height={2} fill="#5cb811" />
        </pattern>
        {/* woods: staggered rings */}
        <pattern
          id="map-dots"
          width={14}
          height={14}
          patternUnits="userSpaceOnUse"
        >
          <rect width={14} height={14} fill="#fff" />
          <g fill="none" stroke="#5cb811" strokeWidth={3}>
            <circle cx={3.5} cy={3.5} r={1.8} />
            <circle cx={10.5} cy={10.5} r={1.8} />
          </g>
        </pattern>
        {/* farmland: the woods' rings, in yellow */}
        <pattern
          id="map-farmland"
          width={14}
          height={14}
          patternUnits="userSpaceOnUse"
        >
          <rect width={14} height={14} fill="#fff" />
          <g fill="none" stroke="#e6b800" strokeWidth={3}>
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
          <path d="M0 3.5h7" stroke="#fff" strokeWidth={3} />
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
      className="absolute inset-0 h-full w-full "
      style={{ background: WATER }}
    >
      <path d={map.earth} fill="#fff" />
      <path d={map.grass} fill="url(#map-dash)" />
      <path d={map.wood} fill="url(#map-dots)" />
      <path d={map.farmland} fill="url(#map-farmland)" />
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