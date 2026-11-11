import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { LocationForm } from "@/src/components/delivery/LocationForm";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { alerts } from "@/src/contexts/AlertContext";
import {
	useDeactivateLocation,
	useDeliveryLocations,
	useSaveLocation,
} from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	emptyLocationValues,
	locationToFormValues,
	toLocationInput,
} from "@/src/lib/deliveryLocationForm";
import { useTranslation } from "@/src/lib/i18n";

function LocationEditor({
	shopId,
	locationId,
}: {
	shopId: string;
	locationId: string | null;
}) {
	const { t } = useTranslation();
	const locations = useDeliveryLocations(shopId);
	const save = useSaveLocation(shopId, locationId);
	const deactivate = useDeactivateLocation(shopId);
	const location = locations.data?.find((row) => String(row.id) === locationId);
	const initial = useMemo(
		() => (location ? locationToFormValues(location) : emptyLocationValues()),
		[location],
	);
	if (locations.isPending) return <DetailSkeleton cards={3} />;
	// An existing point must be read before it is edited: the blank form
	// would let a save overwrite it with empty values.
	if (locationId && (locations.isError || !location)) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("deliverySettings.editLocation")}
				subtitle={
					locations.isError
						? resolveErrorMessage(locations.error, t)
						: t("deliverySettings.notFound")
				}
				ctaLabel={t("common.retry")}
				onCta={() => locations.refetch()}
				secondaryLabel={t("common.back")}
				onSecondary={() =>
					router.canGoBack()
						? router.back()
						: router.replace("/seller/delivery")
				}
			/>
		);
	}

	// Buyers stop seeing the point at once, so it is asked first, like the
	// zone delete.
	const confirmDeactivate = async () => {
		if (!locationId) return;
		const confirmed = await alerts.confirm(
			t("deliverySettings.deactivate"),
			t("deliverySettings.deactivateConfirm"),
			{ confirmText: t("deliverySettings.deactivate"), destructive: true },
		);
		if (!confirmed) return;
		deactivate.mutate(locationId, {
			onSuccess: () => router.back(),
			onError: (error) =>
				alerts.showError(
					t("deliverySettings.deactivateFailed"),
					resolveErrorMessage(error, t),
				),
		});
	};

	return (
		<ScreenColumn width="reading">
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				<LocationForm
					key={location?.updatedAt ?? "new"}
					initial={initial}
					pending={save.isPending}
					error={save.error}
					onSubmit={(values) =>
						save.mutate(toLocationInput(values), {
							onSuccess: () => router.back(),
						})
					}
				/>
				{locationId ? (
					<SheetButton
						label={t("deliverySettings.deactivate")}
						tone="danger"
						pending={deactivate.isPending}
						onPress={confirmDeactivate}
					/>
				) : null}
			</ScrollView>
		</ScreenColumn>
	);
}

export default function LocationScreen() {
	const { t } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const locationId = id && id !== "new" ? id : null;
	return (
		<SettingsShell
			title={
				locationId
					? t("deliverySettings.editLocation")
					: t("deliverySettings.newLocation")
			}
		>
			{(shopId) => <LocationEditor shopId={shopId} locationId={locationId} />}
		</SettingsShell>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, gap: 16, paddingBottom: 48 },
});
