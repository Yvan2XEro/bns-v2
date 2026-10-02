import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { BillingShell } from "@/src/components/billing/BillingShell";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { CapsNotice } from "@/src/components/billing/CapsNotice";
import { OrderSettingsForm } from "@/src/components/billing/OrderSettingsForm";
import { EmptyState } from "@/src/components/EmptyState";
import { useShopTheme } from "@/src/components/shop/theme";
import { useOrderSettings } from "@/src/hooks/useOrderSettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { capsNotice } from "@/src/lib/orderSettingsForm";
import { can } from "@/src/lib/shopRoles";
import type { ShopRole } from "@/src/types/api";

/**
 * Reading is `payments.view` (the view carries the shop's COD caps), writing
 * is `settings.edit`; the role matrix answers both, the screen compares no role.
 */
function OrderSettingsContent({
	shopId,
	role,
}: {
	shopId: string;
	role: ShopRole | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const settings = useOrderSettings(shopId);
	const canEdit = can(role, "settings.edit");

	if (settings.isPending) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}
	if (settings.isError) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("billing.settingsLoadError")}
				subtitle={resolveErrorMessage(settings.error, t)}
				ctaLabel={t("common.retry")}
				onCta={() => settings.refetch()}
			/>
		);
	}

	const view = settings.data;
	const caps = capsNotice(view);

	return (
		<KeyboardAvoidingView
			style={{ flex: 1 }}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				{caps ? <CapsNotice caps={caps} /> : null}
				{view.cityDefaultFee === null ? (
					<View
						style={[
							s.card,
							{ backgroundColor: c.warningSoft, borderColor: c.warningSoft },
						]}
					>
						<Text style={[s.body, { color: c.warningText }]}>
							{t("billing.launchCityNotice")}
						</Text>
					</View>
				) : null}
				{!canEdit ? (
					<Text style={[s.body, { color: c.muted }]}>
						{t("billing.settingsReadOnly")}
					</Text>
				) : null}
				<OrderSettingsForm shopId={shopId} view={view} canEdit={canEdit} />
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

export default function OrderSettingsScreen() {
	const { t } = useTranslation();
	return (
		<BillingShell title={t("billing.orderSettingsTitle")}>
			{({ shopId, role }) => (
				<OrderSettingsContent shopId={shopId} role={role} />
			)}
		</BillingShell>
	);
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 12, paddingBottom: 40 },
});
