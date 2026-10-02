import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useForm } from "react-hook-form";
import { ActivityIndicator, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { HandoverFallbacks } from "@/src/components/sellerOrders/HandoverFallbacks";
import { HandoverKeypad } from "@/src/components/sellerOrders/HandoverKeypad";
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
	const { t } = useTranslation();
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
	const header = <SellerHeader title={t("sellerOrders.handoverTitle")} />;

	if (shopLoading || query.isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<ActivityIndicator style={styles.spinner} color={c.primary} />
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

	const onKey = (key: KeypadKey) => {
		// A new digit starts a new attempt: the last answer stops being news.
		if (verify.error) verify.reset();
		form.setValue("code", pressKey(code, key), { shouldValidate: false });
	};

	const submit = form.handleSubmit(({ code: value }) => {
		verify.mutate(
			{ code: value },
			{
				onSuccess: () => router.back(),
				onError: () => {
					form.setValue("code", "");
					// The error body answers at once; the order is the lasting answer.
					query.refetch();
				},
			},
		);
	});

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
						<HandoverKeypad
							code={code}
							error={state.wrong}
							disabled={verify.isPending}
							onKey={onKey}
						/>
						{state.wrong ? (
							<Text
								accessibilityRole="alert"
								style={[styles.center, { color: c.danger }]}
							>
								{t("sellerOrders.handoverWrong")}
							</Text>
						) : null}
						{otherError ? (
							<Text
								accessibilityRole="alert"
								style={[styles.center, { color: c.danger }]}
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
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 40, gap: 16 },
	body: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	center: { textAlign: "center", fontSize: 14, fontFamily: Fonts.bodyMedium },
});
