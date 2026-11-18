"use client";

import { MapPin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Input } from "~/components/ui/input";
import { useAppConfig } from "~/hooks/use-app-config";
import { usePlaceSearch } from "~/hooks/use-places";
import type { Place } from "../../../../api/src/contracts/places";

/**
 * District search through the app's Photon geocoder. Optional help only: with
 * no geocoder configured, or offline, the field hides or lists nothing and the
 * selects below stay the way to fill the address.
 */
export function PlaceSuggestField({
	onPick,
}: {
	onPick: (place: Place) => void;
}) {
	const t = useTranslations("Addresses");
	const { photonUrl } = useAppConfig();
	const [text, setText] = useState("");
	const [open, setOpen] = useState(false);
	const { places, searching } = usePlaceSearch(text);
	const listId = useId();
	if (!photonUrl) return null;

	return (
		<div className="relative space-y-1">
			<label
				htmlFor={`${listId}-input`}
				className="font-semibold text-ink-soft text-sm"
			>
				{t("searchPlace")}
			</label>
			<div className="relative">
				<Search
					aria-hidden
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-ink-faint"
				/>
				<Input
					id={`${listId}-input`}
					aria-controls={listId}
					autoComplete="off"
					className="pl-9"
					placeholder={t("searchPlaceHint")}
					value={text}
					onChange={(event) => {
						setText(event.target.value);
						setOpen(true);
					}}
					onBlur={() => setTimeout(() => setOpen(false), 150)}
				/>
			</div>
			{open && text.trim().length >= 2 ? (
				<ul
					id={listId}
					className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
				>
					{places.map((place) => (
						<li key={`${place.name}|${place.district ?? ""}|${place.region}`}>
							<button
								type="button"
								className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-canvas"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => {
									onPick(place);
									setText(
										place.district
											? `${place.district}, ${place.name}`
											: place.name,
									);
									setOpen(false);
								}}
							>
								<MapPin aria-hidden className="h-4 w-4 text-ink-muted" />
								<span className="text-ink">{place.district ?? place.name}</span>
								<span className="text-ink-muted">
									{place.district ? place.name : place.region}
								</span>
							</button>
						</li>
					))}
					{places.length === 0 ? (
						<li className="px-3 py-2 text-ink-muted text-sm">
							{searching ? t("searching") : t("noPlace")}
						</li>
					) : null}
				</ul>
			) : null}
		</div>
	);
}
