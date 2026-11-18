import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
	AccessibilityInfo,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { HandoverFallbacks } from "@/src/components/sellerOrders/HandoverFallbacks";
import { HandoverKeypad } from "@/src/components/sellerOrders/HandoverKeypad";
import { dangerInk } from "@/src/components/shop/ink";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useVerifyHandoverCode } from "@/src/hooks/useOrderActions";
import { useSellerOrder } from "@/src/hooks/useSellerOrders";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	HANDOVER_CODE_LENGTH,
	type HandoverCodeValues,
	handoverCodeSchema,
	handoverScreenState,
	type KeypadKey,
	pressKey,
	readHandoverFailure,
} from "@/src/lib/handoverKeypad";
import { useTranslation } from "@/src/lib/i18n";
import {
	actionBarItems,
	callHref,
	handoverScreenOpen,
} from "@/src/lib/sellerOrders";

export default function HandoverScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const query = useSellerOrder(shop?.shopId, id);
	const verify = useVerifyHandoverCode(id, shop?.shopId);
	const form = useForm<HandoverCodeValues>({
		resolver: zodResolver(handoverCodeSchema),
		defaultValues: { code: "" },
	});
	const code = form.watch("code");
	const order = query.data;
	// The proof shown at the door once the code is accepted.
	const [handedAt, setHandedAt] = useState<Date | null>(null);
	const header = (
		<SellerHeader
			title={t("sellerOrders.handoverTitle")}
			subtitle={
				order ? `${order.orderNumber} · ${order.delivery.recipientName}` : null
			}
		/>
	);

	if (handedAt && order) {
		const time = handedAt.toLocaleTimeString(i18n.language, {
			hour: "2-digit",
			minute: "2-digit",
		});
		return (
			<SafeAreaView
				edges={["top", "bottom"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<ScreenColumn width="reading">
					<View style={styles.done}>
						<View
							style={[styles.doneBadge, { backgroundColor: c.successSoft }]}
						>
							<Ionicons name="checkmark" size={56} color={c.successText} />
						</View>
						<Text
							accessibilityRole="header"
							style={[styles.doneTitle, { color: c.text }]}
						>
							{t("sellerOrders.handoverDone")}
						</Text>
						<Text style={[styles.doneMeta, { color: c.body }]}>
							{t("sellerOrders.handoverDoneMeta", {
								number: order.orderNumber,
								time,
							})}
						</Text>
						<View style={styles.doneAction}>
							<SheetButton
								label={t("sellerOrders.done")}
								onPress={() => router.back()}
							/>
						</View>
					</View>
				</ScreenColumn>
			</SafeAreaView>
		);
	}

	if (shopLoading || query.isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<DetailSkeleton cards={1} />
			</SafeAreaView>
		);
	}

	const actions = order && shop ? actionBarItems(order, shop.role) : [];
	if (!order || !shop || !handoverScreenOpen(actions)) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<EmptyState
					illustration="notFound"
					title={
						order
							? t("sellerOrders.handoverUnavailable")
							: t("sellerOrders.orderLoadError")
					}
					ctaLabel={t("sellerOrders.dismiss")}
					onCta={() => router.back()}
				/>
			</SafeAreaView>
		);
	}

	const failure = readHandoverFailure(verify.error);
	const canDeclare = actions.some((a) => a.action === "declare_delivered");
	const state = handoverScreenState(order.handover, failure, canDeclare);
	const otherError =
		verify.error && !failure
			? resolveErrorMessage(verify.error, t, t("sellerOrders.actionFailed"))
			: null;

	const submit = form.handleSubmit(({ code: value }) => {
		verify.mutate(
			{ code: value },
			{
				onSuccess: () => {
					setHandedAt(new Date());
					AccessibilityInfo.announceForAccessibility(
						t("sellerOrders.handoverDone"),
					);
				},
				onError: () => {
					form.setValue("code", "");
					// The error body answers at once; the order is the lasting answer.
					query.refetch();
				},
			},
		);
	});

	const onKey = (key: KeypadKey) => {
		// A new digit starts a new attempt: the last answer stops being news.
		if (verify.error) verify.reset();
		const next = pressKey(code, key);
		form.setValue("code", next, { shouldValidate: false });
		// The fourth digit sends the code: one hand holds the parcel. The
		// button below stays for a retry.
		if (
			next.length === HANDOVER_CODE_LENGTH &&
			code.length < HANDOVER_CODE_LENGTH &&
			!verify.isPending
		) {
			void submit();
		}
	};

	const refresh = () => {
		verify.reset();
		query.refetch();
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			{header}
			<ScreenColumn width="reading">
				<ScrollView contentContainerStyle={styles.content}>
					{state.kind === "locked" ? (
						<HandoverFallbacks
							fallbacks={state.fallbacks}
							orderId={order.id}
							shopId={shop.shopId}
							tel={callHref(order.delivery)}
							onRefresh={refresh}
							onDeclared={() => router.back()}
						/>
					) : (
						<>
							<Text style={[styles.body, { color: c.body }]}>
								{t("sellerOrders.handoverBody")}
							</Text>
							<Text style={[styles.items, { color: c.text }]} numberOfLines={2}>
								{order.items
									.map((item) =>
										item.quantity > 1
											? `${item.quantity} × ${item.title}`
											: item.title,
									)
									.join(", ")}
							</Text>
							<HandoverKeypad
								code={code}
								error={state.wrong}
								disabled={verify.isPending}
								onKey={onKey}
							/>
							{state.wrong ? (
								<Text
									accessibilityRole="alert"
									style={[styles.center, { color: dangerInk(c) }]}
								>
									{t("sellerOrders.handoverWrong")}
								</Text>
							) : null}
							{otherError ? (
								<Text
									accessibilityRole="alert"
									style={[styles.center, { color: dangerInk(c) }]}
								>
									{otherError}
								</Text>
							) : null}
							<Text style={[styles.center, { color: c.muted }]}>
								{t("sellerOrders.handoverAttemptsLeft", {
									count: state.attemptsLeft,
								})}
							</Text>
							<SheetButton
								label={t("sellerOrders.handoverSubmit")}
								pending={verify.isPending}
								disabled={code.length < HANDOVER_CODE_LENGTH}
								onPress={submit}
							/>
						</>
					)}
				</ScrollView>
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, paddingBottom: 40, gap: 16 },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	center: {
		textAlign: "center",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyMedium,
	},
	items: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.bodySemibold },
	done: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
		gap: 12,
	},
	doneBadge: {
		width: 112,
		height: 112,
		borderRadius: 56,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
	},
	doneTitle: {
		fontSize: 30,
		lineHeight: 38,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	doneMeta: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.body,
		textAlign: "center",
	},
	doneAction: { alignSelf: "stretch", marginTop: 24 },
});
