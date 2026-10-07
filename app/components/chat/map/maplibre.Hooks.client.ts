import { atom, useSetAtom } from "jotai";
import { Map, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
const PROTOMAPS_KEY = "60f4fa84b14d1301";
const mapInstanceAtom = atom<Map | null>(null);

export function useMaplibre({
  center,
  zoom,
}: {
  center: [lng: number, lat: number];
  zoom: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const setMap = useSetAtom(mapInstanceAtom);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new Map({
      style: `https://api.protomaps.com/styles/v5/white/en.json?key=${PROTOMAPS_KEY}`,
      container: container.current,
      center,
      zoom,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () =>
      setMap((oldMap) => {
        if (oldMap) {
          throw new Error("only instantiate maplibre once!");
        }
        return map;
      }),
    );

    return () => {
      map.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);
  return { container, mapRef };
}
