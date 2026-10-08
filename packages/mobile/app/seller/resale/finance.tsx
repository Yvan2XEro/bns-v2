import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useResellerFinance } from "@/src/hooks/useResale";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";

type FinanceRow =
	| { id: string; type: "heading"; label: string }
	| { id: string; type: "entry"; label: string; amount: number };

export default function ResellerFinanceScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en" : "fr";
	const { shop, isLoading: shopLoading } = useActiveShop();
	const query = useResellerFinance(shop?.shopId);
	const finance = query.data;
	const rows: FinanceRow[] = finance
		? [
				{
					id: "commissions",
					type: "heading",
					label: t("sellerResale.finance.commissions"),
				},
				...finance.commissions.map((item) => ({
					id: item.id,
					type: "entry" as const,
					label: `${commissionStatus(item.status, t)} · ${item.purchaseOrder}`,
					amount: item.amount,
				})),
				{
					id: "charges",
					type: "heading",
					label: t("sellerResale.finance.charges"),
				},
				...finance.charges.map((item) => ({
					id: item.id,
					type: "entry" as const,
					label: `${chargeStatus(item.status, t)}${item.purchaseOrder ? ` · ${item.purchaseOrder}` : ""}`,
					amount: item.amount,
				})),
				{
					id: "payouts",
					type: "heading",
					label: t("sellerResale.finance.payouts"),
				},
				...finance.payouts.map((item) => ({
					id: item.id,
					type: "entry" as const,
					label: `${payoutStatus(item.status, t)} · ${item.reference}`,
					amount: item.amount,
				})),
			]
		: [];

	if (shopLoading || (query.isPending && !finance)) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!shop) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerResale.finance.title")} />
				<EmptyState
					illustration="empty"
					title={t("sellerResale.noShopTitle")}
					subtitle={t("sellerResale.noShopBody")}
				/>
			</SafeAreaView>
		);
	}

	if (query.isError && !finance) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerResale.finance.title")} />
				<EmptyState
					illustration="notFound"
					title={t("sellerResale.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			</SafeAreaView>
		);
	}

	const payable =
		finance?.commissions
			.filter((commission) => commission.status === "payable")
			.reduce((sum, commission) => sum + commission.amount, 0) ?? 0;
	const openCharges =
		finance?.charges
			.filter(
				(charge) => charge.status === "open" || charge.status === "overdue",
			)
			.reduce((sum, charge) => sum + charge.amount, 0) ?? 0;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("sellerResale.finance.title")}
				subtitle={shop.name}
			/>
			<FlashList
				data={rows}
				keyExtractor={(row) => row.id}
				contentContainerStyle={styles.list}
				ListHeaderComponent={
					<View style={styles.headerContent}>
						{finance?.accountRequired && (
							<Pressable
								onPress={() => router.push("/seller/payments/setup")}
								accessibilityRole="button"
								accessibilityLabel={t("sellerResale.finance.accountRequired")}
								style={[
									styles.notice,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<Ionicons name="card-outline" size={20} color={c.primary} />
								<Text style={[styles.noticeText, { color: c.text }]}>
									{t("sellerResale.finance.accountRequired")}
								</Text>
							</Pressable>
						)}
						<View style={styles.summary}>
							<Summary
								title={t("sellerResale.finance.available")}
								value={payable}
								locale={locale}
							/>
							<Summary
								title={t("sellerResale.finance.dueCharges")}
								value={openCharges}
								locale={locale}
							/>
						</View>
					</View>
				}
				ListEmptyComponent={
					<Text style={[styles.empty, { color: c.muted }]}>
						{t("sellerResale.finance.empty")}
					</Text>
				}
				renderItem={({ item }) =>
					item.type === "heading" ? (
						<Text style={[styles.section, { color: c.text }]}>
							{item.label}
						</Text>
					) : (
						<View
							style={[
								styles.row,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[styles.rowLabel, { color: c.body }]}>
								{item.label}
							</Text>
							<Text style={[styles.amount, { color: c.text }]}>
								{formatXaf(item.amount, locale)}
							</Text>
						</View>
					)
				}
			/>
		</SafeAreaView>
	);
}

function Summary({
	title,
	value,
	locale,
}: {
	title: string;
	value: number;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.cardTitle, { color: c.muted }]}>{title}</Text>
			<Text style={[styles.cardValue, { color: c.text }]}>
				{formatXaf(value, locale)}
			</Text>
		</View>
	);
}

function commissionStatus(
	status: string,
	t: ReturnType<typeof useTranslation>["t"],
) {
	const labels: Record<string, string> = {
		accrued: t("sellerResale.finance.commissionAccrued"),
		payable: t("sellerResale.finance.commissionPayable"),
		held: t("sellerResale.finance.commissionHeld"),
		paid: t("sellerResale.finance.commissionPaid"),
		cancelled: t("sellerResale.finance.commissionCancelled"),
		clawed_back: t("sellerResale.finance.commissionClawedBack"),
	};
	return labels[status] ?? status;
}

function chargeStatus(
	status: string,
	t: ReturnType<typeof useTranslation>["t"],
) {
	const labels: Record<string, string> = {
		open: t("sellerResale.finance.chargeOpen"),
		offset: t("sellerResale.finance.chargeOffset"),
		overdue: t("sellerResale.finance.chargeOverdue"),
		paid: t("sellerResale.finance.chargePaid"),
		waived: t("sellerResale.finance.chargeWaived"),
	};
	return labels[status] ?? status;
}

function payoutStatus(
	status: string,
	t: ReturnType<typeof useTranslation>["t"],
) {
	const labels: Record<string, string> = {
		scheduled: t("sellerResale.finance.payoutScheduled"),
		awaiting_approval: t("sellerResale.finance.payoutAwaitingApproval"),
		pending: t("sellerResale.finance.payoutPending"),
		sent: t("sellerResale.finance.payoutSent"),
		processing: t("sellerResale.finance.payoutProcessing"),
		complete: t("sellerResale.finance.payoutComplete"),
		failed: t("sellerResale.finance.payoutFailed"),
		reversed: t("sellerResale.finance.payoutReversed"),
		cancelled: t("sellerResale.finance.payoutCancelled"),
	};
	return labels[status] ?? status;
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 32 },
	list: { paddingHorizontal: 16, paddingBottom: 28 },
	headerContent: { gap: 12, paddingVertical: 14 },
	notice: {
		alignItems: "center",
		borderRadius: 14,
		borderWidth: 1,
		flexDirection: "row",
		gap: 10,
		padding: 14,
	},
	noticeText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
	summary: { flexDirection: "row", gap: 10 },
	card: { borderRadius: 14, borderWidth: 1, flex: 1, gap: 8, padding: 14 },
	cardTitle: { fontFamily: Fonts.bodyMedium, fontSize: 12 },
	cardValue: { fontFamily: Fonts.displayBold, fontSize: 17 },
	section: {
		fontFamily: Fonts.displaySemibold,
		fontSize: 16,
		paddingBottom: 8,
		paddingTop: 18,
	},
	row: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		flexDirection: "row",
		gap: 12,
		justifyContent: "space-between",
		marginBottom: 8,
		minHeight: 54,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	rowLabel: { flex: 1, fontFamily: Fonts.body, fontSize: 13 },
	amount: { fontFamily: Fonts.bodySemibold, fontSize: 13 },
	empty: { paddingVertical: 24, textAlign: "center" },
});
