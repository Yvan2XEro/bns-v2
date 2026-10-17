"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SavedAddressCard } from "~/components/address/saved-address-card";
import { Button } from "~/components/ui/button";
import {
	useDeleteAddress,
	useSaveAddress,
	useSavedAddresses,
} from "~/hooks/use-addresses";
import { useMarketPhone } from "~/hooks/use-market-phone";
import { type ApiError, resolveErrorMessage } from "~/lib/apiError";
import { type AddressField, addressFieldOf } from "~/lib/checkout-form";
import {
	preselectedAddress,
	SAVED_ADDRESS_LIMIT,
	type SavedAddress,
	savedAddressBody,
	savedAddressToInput,
	savedAddressUsable,
} from "~/lib/saved-addresses";
import type {
	AddressInput,
	DeliveryMethod,
	LaunchCityOption,
} from "~/types/order";
import { AddressStep } from "./address-step";

export interface AddressChoice {
	/** The saved address used as is, when one was picked. */
	savedId: string | null;
	/** « Enregistrer cette adresse » on a new address: saved at placement. */
	save: { label: string } | null;
}

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; id: string };

/**
 * Checkout's address section: the buyer's saved addresses to pick from (the
 * default preselected), editing or deleting one in place, or a new address
 * that can be saved with the order.
 */
export function CheckoutAddressPanel({
	initial,
	selectedSavedId,
	launchCities,
	shopCity,
	method,
	rejectedField,
	rejection,
	onSubmit,
}: {
	initial: AddressInput | null;
	selectedSavedId: string | null;
	launchCities: LaunchCityOption[];
	shopCity: string | null;
	method: DeliveryMethod;
	rejectedField: AddressField | null;
	rejection: ApiError | null;
	onSubmit: (address: AddressInput, choice: AddressChoice) => void;
}) {
	const t = useTranslations("Addresses");
	const tRoot = useTranslations();
	const phoneRule = useMarketPhone();
	const saved = useSavedAddresses();
	const save = useSaveAddress();
	const remove = useDeleteAddress();
	const addresses = saved.data?.addresses ?? [];
	const servedCity = launchCities.some((c) => c.key === shopCity)
		? shopCity
		: null;
	const usable = (address: SavedAddress) =>
		savedAddressUsable(address, {
			cityKeys: launchCities.map((c) => c.key),
			servedCity,
			phonePattern: phoneRule.pattern,
		});
	const [mode, setMode] = useState<Mode | null>(null);
	const [picked, setPicked] = useState<string | null>(selectedSavedId);

	if (saved.isPending) {
		return (
			<LoaderCircle className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
		);
	}

	// A refused address goes back to the form it came from, prefilled.
	const current: Mode =
		mode ??
		(rejectedField || addresses.length === 0
			? selectedSavedId && rejectedField
				? { kind: "edit", id: selectedSavedId }
				: { kind: "new" }
			: { kind: "list" });
	const cityLabel = (key: string) =>
		launchCities.find((c) => c.key === key)?.label ?? key;
	const full = addresses.length >= SAVED_ADDRESS_LIMIT;

	if (current.kind === "edit") {
		const address = addresses.find((a) => a.id === current.id);
		if (address) {
			const saveError = save.error;
			return (
				<div className="space-y-3">
					<AddressStep
						key={address.id}
						initial={savedAddressToInput(address)}
						launchCities={launchCities}
						shopCity={shopCity}
						method={method}
						rejectedField={addressFieldOf(saveError) ?? rejectedField}
						rejection={saveError ?? rejection}
						extra="book"
						initialLabel={address.label ?? ""}
						initialDefault={address.isDefault}
						submitLabel={t("saveAndUse")}
						pending={save.isPending}
						onCancel={
							addresses.length > 0 ? () => setMode({ kind: "list" }) : undefined
						}
						onSubmit={(next, meta) =>
							save.mutate(
								{
									id: address.id,
									body: savedAddressBody(next, {
										label: meta.label,
										isDefault: meta.isDefault,
									}),
								},
								{
									onSuccess: (updated) => {
										setMode(null);
										setPicked(updated.id);
										onSubmit(savedAddressToInput(updated), {
											savedId: updated.id,
											save: null,
										});
									},
								},
							)
						}
					/>
				</div>
			);
		}
	}

	if (current.kind !== "list") {
		return (
			<AddressStep
				initial={initial}
				launchCities={launchCities}
				shopCity={shopCity}
				method={method}
				rejectedField={rejectedField}
				rejection={rejection}
				extra={full ? undefined : "save"}
				onCancel={
					addresses.length > 0 ? () => setMode({ kind: "list" }) : undefined
				}
				onSubmit={(next, meta) => {
					setMode(null);
					onSubmit(next, {
						savedId: null,
						save: meta.save ? { label: meta.label } : null,
					});
				}}
			/>
		);
	}

	const usableOnes = addresses.filter(usable);
	const selectedId =
		picked && usableOnes.some((a) => a.id === picked)
			? picked
			: (preselectedAddress(usableOnes)?.id ?? null);
	const selected = addresses.find((a) => a.id === selectedId) ?? null;

	return (
		<div className="space-y-3">
			<fieldset className="space-y-2">
				<legend className="sr-only">{t("savedAddresses")}</legend>
				{addresses.map((address) => (
					<SavedAddressCard
						key={address.id}
						address={address}
						cityLabel={cityLabel(address.city)}
						selected={address.id === selectedId}
						disabledReason={
							usable(address)
								? null
								: servedCity !== null && address.city !== servedCity
									? t("otherCity")
									: t("incomplete")
						}
						onSelect={() => setPicked(address.id)}
						actions={
							<>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="min-h-11 text-brand"
									onClick={() => setMode({ kind: "edit", id: address.id })}
								>
									{t("edit")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="min-h-11 text-bad-ink-soft"
									disabled={remove.isPending}
									onClick={() => {
										if (window.confirm(t("deleteConfirm")))
											remove.mutate(address.id);
									}}
								>
									{t("delete")}
								</Button>
							</>
						}
					/>
				))}
			</fieldset>
			{remove.error ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(remove.error, tRoot)}
				</p>
			) : null}
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button
					type="button"
					variant="outline"
					className="min-h-11"
					onClick={() => setMode({ kind: "new" })}
				>
					<Plus aria-hidden className="mr-1 h-4 w-4" />
					{t("newAddress")}
				</Button>
				<Button
					type="button"
					className="min-h-11 flex-1 bg-brand-fill hover:bg-brand-strong"
					disabled={!selected}
					onClick={() =>
						selected &&
						onSubmit(savedAddressToInput(selected), {
							savedId: selected.id,
							save: null,
						})
					}
				>
					{t("useThisAddress")}
				</Button>
			</div>
		</div>
	);
}
