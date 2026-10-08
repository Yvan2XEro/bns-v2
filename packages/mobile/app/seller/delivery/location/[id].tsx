import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { LocationForm } from "@/src/components/delivery/LocationForm";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useDeactivateLocation,
	useDeliveryLocations,
	useSaveLocation,
} from "@/src/hooks/useDeliverySettings";
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
	const c = useShopTheme();
	const { t } = useTranslation();
	const locations = useDeliveryLocations(shopId);
	const save = useSaveLocation(shopId, locationId);
	const deactivate = useDeactivateLocation(shopId);
	const location = locations.data?.find((row) => String(row.id) === locationId);
	const initial = useMemo(
		() => (location ? locationToFormValues(location) : emptyLocationValues()),
		[location],
	);
	if (locations.isPending)
		return <ActivityIndicator style={styles.spinner} color={c.primary} />;
	return (
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
					onPress={() =>
						deactivate.mutate(locationId, { onSuccess: () => router.back() })
					}
				/>
			) : null}
		</ScrollView>
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
	spinner: { marginTop: 40 },
	content: { padding: 16, gap: 16, paddingBottom: 48 },
});
