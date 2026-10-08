import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet } from "react-native";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { ZoneForm } from "@/src/components/delivery/ZoneForm";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useDeleteZone,
	useDeliveryZones,
	useSaveZone,
} from "@/src/hooks/useDeliverySettings";
import {
	emptyZoneValues,
	toZoneInput,
	zoneToFormValues,
} from "@/src/lib/deliveryZoneForm";
import { useTranslation } from "@/src/lib/i18n";

function ZoneEditor({
	shopId,
	zoneId,
}: {
	shopId: string;
	zoneId: string | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const zones = useDeliveryZones(shopId);
	const save = useSaveZone(shopId, zoneId);
	const remove = useDeleteZone(shopId);
	const zone = zones.data?.find((row) => String(row.id) === zoneId);
	const initial = useMemo(
		() => (zone ? zoneToFormValues(zone) : emptyZoneValues()),
		[zone],
	);

	if (zones.isPending)
		return <ActivityIndicator style={styles.spinner} color={c.primary} />;

	const confirmDelete = () =>
		Alert.alert(
			t("deliverySettings.delete"),
			t("deliverySettings.deleteConfirm"),
			[
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("deliverySettings.delete"),
					style: "destructive",
					onPress: () =>
						zoneId &&
						remove.mutate(zoneId, {
							onSuccess: (result) => {
								Alert.alert(
									result.deleted
										? t("deliverySettings.deleted")
										: t("deliverySettings.deactivated"),
								);
								router.back();
							},
						}),
				},
			],
		);

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
		>
			<ZoneForm
				key={zone?.updatedAt ?? "new"}
				initial={initial}
				pending={save.isPending}
				error={save.error}
				onSubmit={(values) =>
					save.mutate(toZoneInput(values), { onSuccess: () => router.back() })
				}
			/>
			{zoneId ? (
				<SheetButton
					label={t("deliverySettings.delete")}
					tone="danger"
					pending={remove.isPending}
					onPress={confirmDelete}
				/>
			) : null}
		</ScrollView>
	);
}

export default function ZoneScreen() {
	const { t } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const zoneId = id && id !== "new" ? id : null;
	return (
		<SettingsShell
			title={
				zoneId ? t("deliverySettings.editZone") : t("deliverySettings.newZone")
			}
		>
			{(shopId) => <ZoneEditor shopId={shopId} zoneId={zoneId} />}
		</SettingsShell>
	);
}

const styles = StyleSheet.create({
	spinner: { marginTop: 40 },
	content: { padding: 16, gap: 16, paddingBottom: 48 },
});
