"use client";

import { MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AddressStep } from "~/app/(checkout)/checkout/address-step";
import { AddressMapPreview } from "~/components/address/address-map-preview";
import { SavedAddressCard } from "~/components/address/saved-address-card";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import {
	useDeleteAddress,
	useMakeDefaultAddress,
	useSaveAddress,
	useSavedAddresses,
} from "~/hooks/use-addresses";
import { useAppConfig } from "~/hooks/use-app-config";
import { resolveErrorMessage } from "~/lib/apiError";
import { addressFieldOf } from "~/lib/checkout-form";
import {
	SAVED_ADDRESS_LIMIT,
	savedAddressBody,
	savedAddressToInput,
} from "~/lib/saved-addresses";

type Editing = { id: string | null } | null;

/** « Mes adresses »: the buyer's address book, at most ten, one default. */
export function AddressesClient() {
	const t = useTranslations("Addresses");
	const tRoot = useTranslations();
	const { launchCities } = useAppConfig();
	const list = useSavedAddresses();
	const save = useSaveAddress();
	const remove = useDeleteAddress();
	const makeDefault = useMakeDefaultAddress();
	const [editing, setEditing] = useState<Editing>(null);
	const addresses = list.data?.addresses ?? [];
	const full = addresses.length >= SAVED_ADDRESS_LIMIT;
	const cityLabel = (key: string) =>
		launchCities.find((c) => c.key === key)?.label ?? key;
	const actionError = remove.error ?? makeDefault.error;

	const editingAddress =
		editing?.id != null
			? (addresses.find((a) => a.id === editing.id) ?? null)
			: null;

	return (
		<main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
			<header className="flex items-start gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
					<MapPin aria-hidden="true" className="h-5 w-5" />
				</div>
				<div className="flex-1">
					<h1 className="font-bold text-2xl text-ink">{t("title")}</h1>
					<p className="mt-1 text-ink-muted text-sm">{t("subtitle")}</p>
				</div>
				{list.data && !editing ? (
					<Button
						type="button"
						className="min-h-11 bg-brand hover:bg-brand-strong"
						disabled={full}
						onClick={() => {
							save.reset();
							setEditing({ id: null });
						}}
					>
						<Plus aria-hidden className="mr-1 h-4 w-4" />
						{t("add")}
					</Button>
				) : null}
			</header>

			{list.isPending && <LoadingRows rows={3} />}
			{list.isError && (
				<LoadError title={t("loadError")} onRetry={() => void list.refetch()} />
			)}

			{editing ? (
				<section className="rounded-2xl border border-line bg-surface p-5">
					<h2 className="mb-4 font-bold text-ink text-lg">
						{editingAddress ? t("editTitle") : t("newTitle")}
					</h2>
					<AddressStep
						key={editing.id ?? "new"}
						initial={
							editingAddress ? savedAddressToInput(editingAddress) : null
						}
						launchCities={launchCities}
						shopCity={null}
						method="seller_delivery"
						rejectedField={addressFieldOf(save.error)}
						rejection={save.error}
						extra="book"
						initialLabel={editingAddress?.label ?? ""}
						initialDefault={editingAddress?.isDefault ?? false}
						submitLabel={t("save")}
						pending={save.isPending}
						onCancel={() => setEditing(null)}
						onSubmit={(address, meta) =>
							save.mutate(
								{
									id: editingAddress?.id ?? null,
									body: savedAddressBody(address, {
										label: meta.label,
										isDefault: meta.isDefault,
									}),
								},
								{ onSuccess: () => setEditing(null) },
							)
						}
					/>
				</section>
			) : null}

			{list.data && addresses.length === 0 && !editing ? (
				<div className="rounded-2xl border border-line-strong border-dashed bg-surface">
					<EmptyState
						illustration="empty"
						title={t("emptyTitle")}
						subtitle={t("emptyBody")}
						ctaLabel={t("add")}
						onCta={() => setEditing({ id: null })}
					/>
				</div>
			) : null}

			{actionError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(actionError, tRoot)}
				</p>
			) : null}

			{addresses.length > 0 && !editing ? (
				<section aria-label={t("title")} className="space-y-3">
					<p className="text-ink-muted text-sm">
						{t("count", {
							count: addresses.length,
							limit: list.data?.limit ?? SAVED_ADDRESS_LIMIT,
						})}
					</p>
					<ul className="space-y-3">
						{addresses.map((address) => (
							<li key={address.id} className="space-y-2">
								<SavedAddressCard
									address={address}
									cityLabel={cityLabel(address.city)}
									actions={
										<>
											{!address.isDefault ? (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="min-h-11 text-brand"
													disabled={makeDefault.isPending}
													onClick={() => makeDefault.mutate(address.id)}
												>
													{t("setDefault")}
												</Button>
											) : null}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="min-h-11 text-brand"
												onClick={() => {
													save.reset();
													setEditing({ id: address.id });
												}}
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
								{address.gps ? (
									<AddressMapPreview
										lat={address.gps.lat}
										lng={address.gps.lng}
										accuracyMeters={address.gps.accuracyMeters}
									/>
								) : null}
							</li>
						))}
					</ul>
					{full ? (
						<p className="text-ink-muted text-sm">{t("limitReached")}</p>
					) : null}
				</section>
			) : null}
		</main>
	);
}
