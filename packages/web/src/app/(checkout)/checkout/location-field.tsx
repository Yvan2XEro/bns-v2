"use client";

import { LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { googleMapsUrl } from "~/lib/checkout-form";

export interface GpsValue {
	lat: number;
	lng: number;
	accuracyMeters?: number;
}

/**
 * "Utiliser ma position". A refusal, a timeout or a browser without
 * geolocation all read the same way: the landmark is enough, so none of
 * them is an error.
 */
export function LocationField({
	value,
	onChange,
}: {
	value: GpsValue | undefined;
	onChange: (next: GpsValue | undefined) => void;
}) {
	const t = useTranslations("Checkout");
	const [status, setStatus] = useState<"idle" | "locating" | "unavailable">(
		"idle",
	);

	const locate = () => {
		if (!("geolocation" in navigator)) {
			setStatus("unavailable");
			return;
		}
		setStatus("locating");
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				setStatus("idle");
				onChange({
					lat: coords.latitude,
					lng: coords.longitude,
					accuracyMeters: Math.round(coords.accuracy),
				});
			},
			() => setStatus("unavailable"),
			{ enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
		);
	};

	return (
		<div className="space-y-2 rounded-xl border border-[#DBEAFE] p-3">
			<Button
				type="button"
				variant="outline"
				className="min-h-11"
				onClick={locate}
				disabled={status === "locating"}
			>
				<LocateFixed className="mr-2 h-4 w-4" />
				{status === "locating" ? t("locating") : t("useMyLocation")}
			</Button>
			{value && (
				<div className="space-y-1 text-sm">
					<p className="text-[#166534]">{t("locationCaptured")}</p>
					{value.accuracyMeters !== undefined && (
						<p className="text-[#64748B]">
							{t("locationAccuracy", { accuracy: value.accuracyMeters })}
						</p>
					)}
					<div className="flex flex-wrap gap-3">
						<a
							href={googleMapsUrl(value.lat, value.lng)}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex min-h-11 items-center text-[#1E40AF] underline"
						>
							{t("openInGoogleMaps")}
						</a>
						<button
							type="button"
							className="min-h-11 text-[#64748B] underline"
							onClick={() => onChange(undefined)}
						>
							{t("clearLocation")}
						</button>
					</div>
				</div>
			)}
			{status === "unavailable" && !value && (
				<p className="text-[#64748B] text-sm">{t("locationUnavailable")}</p>
			)}
		</div>
	);
}
