import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { ZoneForm } from "@/src/components/delivery/ZoneForm";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { alerts } from "@/src/contexts/AlertContext";
import {
	useDeleteZone,
	useDeliveryZones,
	useSaveZone,
} from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
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
	const { t } = useTranslation();
	const zones = useDeliveryZones(shopId);
	const save = useSaveZone(shopId, zoneId);
	const remove = useDeleteZone(shopId);
	const zone = zones.data?.find((row) => String(row.id) === zoneId);
	const initial = useMemo(
		() => (zone ? zoneToFormValues(zone) : emptyZoneValues()),
		[zone],
	);

	if (zones.isPending) return <DetailSkeleton cards={3} />;
	// An existing zone must be read before it is edited: falling through to
	// the blank form would let a save overwrite it with empty values.
	if (zoneId && (zones.isError || !zone)) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("deliverySettings.editZone")}
				subtitle={
					zones.isError
						? resolveErrorMessage(zones.error, t)
						: t("deliverySettings.notFound")
				}
				ctaLabel={t("common.retry")}
				onCta={() => zones.refetch()}
				secondaryLabel={t("common.back")}
				onSecondary={() =>
					router.canGoBack()
						? router.back()
						: router.replace("/seller/delivery")
				}
			/>
		);
	}

	const confirmDelete = async () => {
		const confirmed = await alerts.confirm(
			t("deliverySettings.delete"),
			t("deliverySettings.deleteConfirm"),
			{ confirmText: t("deliverySettings.delete"), destructive: true },
		);
		if (!confirmed || !zoneId) return;
		remove.mutate(zoneId, {
			onSuccess: (result) => {
				alerts.showSuccess(
					result.deleted
						? t("deliverySettings.deleted")
						: t("deliverySettings.deactivated"),
				);
				router.back();
			},
			onError: (error) =>
				alerts.showError(
					t("deliverySettings.deleteFailed"),
					resolveErrorMessage(error, t),
				),
		});
	};

	return (
		<ScreenColumn width="reading">
			<KeyboardAwareScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
				bottomOffset={24}
			>
				<ZoneForm
					key={zone?.updatedAt ?? "new"}
					initial={initial}
					pending={save.isPending}
					error={save.error}
					onSubmit={(values) =>
						save.mutate(toZoneInput(values), {
							onSuccess: () => {
								alerts.showSuccess(t("deliverySettings.saved"));
								router.back();
							},
						})
					}
				/>
				{zoneId ? (
					<View style={styles.danger}>
						<SheetButton
							label={t("deliverySettings.delete")}
							tone="danger"
							outline
							pending={remove.isPending}
							onPress={confirmDelete}
						/>
					</View>
				) : null}
			</KeyboardAwareScrollView>
		</ScreenColumn>
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
	content: { padding: 16, gap: 16, paddingBottom: 48 },
	// Kept apart from Save so a slip does not land on the destructive action.
	danger: { marginTop: 24 },
});
