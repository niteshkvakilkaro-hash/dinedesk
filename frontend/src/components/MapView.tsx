import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * A small OpenStreetMap map (Leaflet, no API key). Loaded lazily (import('@/components/MapView')) so
 * Leaflet only downloads on screens that show a map. Tiles come from tile.openstreetmap.org with the
 * attribution visible, as the OSM tile usage policy asks.
 */
export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  /** Shown next to the dot (rider name, order number). */
  label?: string;
  /** live = fresh rider position, stale = old one (grey), drop = delivery address, shop = the restaurant. */
  tone: 'live' | 'stale' | 'drop' | 'shop';
}

const COLORS: Record<MapMarker['tone'], { fill: string; stroke: string; radius: number }> = {
  live: { fill: '#16a34a', stroke: '#ffffff', radius: 9 },
  stale: { fill: '#9ca3af', stroke: '#ffffff', radius: 8 },
  drop: { fill: '#c2410c', stroke: '#ffffff', radius: 7 },
  shop: { fill: '#14110f', stroke: '#ffffff', radius: 7 },
};

export default function MapView({
  markers,
  trail = [],
  fitKey,
  className = 'h-80 rounded-xl border border-line',
  label,
  onSelect,
  zoom = 15,
}: {
  markers: MapMarker[];
  /** A route to draw (oldest first). */
  trail?: [number, number][];
  /** The view re-fits when this changes (not on every live update, so the map doesn't jump). */
  fitKey?: string;
  className?: string;
  /** Accessible name of the map. */
  label: string;
  onSelect?: (id: MapMarker['id']) => void;
  /** Zoom when there is a single point. */
  zoom?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.setView([20.59, 78.96], 4); // India until there is something to show
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The box may change size (sidebar, dialogs): keep the tiles filling it.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(box.current);
    return () => {
      ro?.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Draw the markers and the route.
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (trail.length > 1) L.polyline(trail, { color: '#2563eb', weight: 4, opacity: 0.75 }).addTo(g);
    for (const mk of markers) {
      const c = COLORS[mk.tone];
      const dot = L.circleMarker([mk.lat, mk.lng], { radius: c.radius, color: c.stroke, weight: 3, fillColor: c.fill, fillOpacity: 1 }).addTo(g);
      if (mk.label) dot.bindTooltip(mk.label, { permanent: mk.tone === 'live' || mk.tone === 'stale', direction: 'top', offset: [0, -8] });
      dot.on('click', () => select.current?.(mk.id));
    }
  }, [markers, trail]);

  // Fit everything in view when what is shown changes.
  const points = [...markers.map((m) => [m.lat, m.lng] as [number, number]), ...trail];
  const key = fitKey ?? points.length.toString();
  useEffect(() => {
    const m = map.current;
    if (!m || points.length === 0) return;
    if (points.length === 1) m.setView(points[0], zoom);
    else m.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} role="region" aria-label={label} className={`isolate z-0 w-full overflow-hidden bg-[#eae6df] ${className}`} />;
}
