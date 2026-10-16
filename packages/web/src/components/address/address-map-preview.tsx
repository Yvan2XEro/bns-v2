"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";
const LEAFLET_JS_SRI = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
const LEAFLET_CSS_SRI = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";

interface LeafletMap {
	remove(): void;
}
interface LeafletGlobal {
	map(
		el: HTMLElement,
		options: Record<string, unknown>,
	): LeafletMap & {
		setView(center: [number, number], zoom: number): unknown;
	};
	tileLayer(
		url: string,
		options: Record<string, unknown>,
	): {
		addTo(map: unknown): unknown;
	};
	circleMarker(
		at: [number, number],
		options: Record<string, unknown>,
	): { addTo(map: unknown): unknown };
	circle(
		at: [number, number],
		options: Record<string, unknown>,
	): { addTo(map: unknown): unknown };
}

let leafletLoad: Promise<LeafletGlobal> | null = null;

/** Leaflet from its pinned CDN build, once per page, only when a preview is shown. */
function loadLeaflet(): Promise<LeafletGlobal> {
	const existing = (window as { L?: LeafletGlobal }).L;
	if (existing) return Promise.resolve(existing);
	leafletLoad ??= new Promise<LeafletGlobal>((resolve, reject) => {
		const css = document.createElement("link");
		css.rel = "stylesheet";
		css.href = `${LEAFLET}/leaflet.css`;
		css.integrity = LEAFLET_CSS_SRI;
		css.crossOrigin = "";
		document.head.appendChild(css);
		const script = document.createElement("script");
		script.src = `${LEAFLET}/leaflet.js`;
		script.integrity = LEAFLET_JS_SRI;
		script.crossOrigin = "";
		script.async = true;
		script.onload = () => {
			const L = (window as { L?: LeafletGlobal }).L;
			if (L) resolve(L);
			else reject(new Error("leaflet missing"));
		};
		script.onerror = () => {
			leafletLoad = null;
			reject(new Error("leaflet failed"));
		};
		document.head.appendChild(script);
	});
	return leafletLoad;
}

/**
 * A read-only OpenStreetMap preview of the pin. Loaded when it scrolls into
 * view, never on a save-data connection; when it cannot load, nothing shows
 * and the coordinates line beside it is the address.
 */
export function AddressMapPreview({
	lat,
	lng,
	accuracyMeters,
	className,
}: {
	lat: number;
	lng: number;
	accuracyMeters?: number | null;
	className?: string;
}) {
	const t = useTranslations("Addresses");
	const box = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<"idle" | "ready" | "failed">("idle");

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const saveData = (
			navigator as Navigator & { connection?: { saveData?: boolean } }
		).connection?.saveData;
		if (saveData) {
			setState("failed");
			return;
		}
		let map: LeafletMap | null = null;
		let cancelled = false;
		const draw = () =>
			loadLeaflet()
				.then((L) => {
					if (cancelled || !box.current) return;
					const created = L.map(box.current, {
						dragging: false,
						zoomControl: false,
						scrollWheelZoom: false,
						doubleClickZoom: false,
						boxZoom: false,
						keyboard: false,
						touchZoom: false,
						attributionControl: true,
					});
					created.setView([lat, lng], 16);
					L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
						maxZoom: 19,
						attribution: "© OpenStreetMap",
					}).addTo(created);
					if (accuracyMeters && accuracyMeters > 0 && accuracyMeters < 500) {
						L.circle([lat, lng], {
							radius: accuracyMeters,
							color: "#1E40AF",
							weight: 1,
							fillOpacity: 0.08,
						}).addTo(created);
					}
					L.circleMarker([lat, lng], {
						radius: 8,
						color: "#FFFFFF",
						weight: 3,
						fillColor: "#1E40AF",
						fillOpacity: 1,
					}).addTo(created);
					map = created;
					setState("ready");
				})
				.catch(() => {
					if (!cancelled) setState("failed");
				});
		if (!("IntersectionObserver" in window)) {
			void draw();
			return () => {
				cancelled = true;
				map?.remove();
			};
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				observer.disconnect();
				void draw();
			}
		});
		observer.observe(el);
		return () => {
			cancelled = true;
			observer.disconnect();
			map?.remove();
		};
	}, [lat, lng, accuracyMeters]);

	if (state === "failed") return null;
	return (
		<div
			ref={box}
			role="img"
			aria-label={t("mapPreview")}
			className={`relative z-0 h-40 w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] ${className ?? ""}`}
		/>
	);
}
