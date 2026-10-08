import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useReducer } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import {
	usePurchaseOrder,
	usePurchaseOrderAction,
} from "@/src/hooks/usePurchaseOrders";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";

type Side = "supplier" | "reseller";
type SupplierCancelReason =
	| "seller_out_of_stock"
	| "seller_cannot_deliver"
	| "seller_other";
type DeliveryFailureReason =
	| "refused"
	| "unreachable"
	| "absent"
	| "address_not_found"
	| "timeout"
	| "other";
interface State {
	carrier: "own_courier" | "yango" | "other";
	trackingNumber: string;
	trackingUrl: string;
	handoverCode: string;
	cancelReason: SupplierCancelReason;
	cancelNote: string;
	deliveryNote: string;
	deliveryFailureReason: DeliveryFailureReason;
	failedDeliveryCost: string;
	deliveryFailureNote: string;
}
function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export default function ResalePurchaseOrderDetailScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const { deliveryZonesEnabled } = useAppConfig();
	const params = useLocalSearchParams<{ id: string; side?: string }>();
	const side: Side = params.side === "reseller" ? "reseller" : "supplier";
	const query = usePurchaseOrder(shop?.shopId, params.id);
	const action = usePurchaseOrderAction(shop?.shopId ?? "");
	const [form, patch] = useReducer(reducer, {
		carrier: "own_courier",
		trackingNumber: "",
		trackingUrl: "",
		handoverCode: "",
		cancelReason: "seller_out_of_stock",
		cancelNote: "",
		deliveryNote: "",
		deliveryFailureReason: "refused",
		failedDeliveryCost: "0",
		deliveryFailureNote: "",
	});
	const locale = i18n.language?.startsWith("en") ? "en" : "fr";

	if (shopLoading || query.isLoading)
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	if (query.isError || !query.data)
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerResale.title")} />
				<EmptyState
					illustration="notFound"
					title={t("sellerResale.detailError")}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			</SafeAreaView>
		);
	const order = query.data;
	const pending = action.isPending;
	const run = (operation: Parameters<typeof action.mutate>[0]) =>
		action.mutate(operation);
	const received = order.status === "returned" && !order.return?.receivedAt;
	const canCancel =
		side === "supplier" &&
		(order.status === "sent" || order.status === "accepted");
	const canDeclareDelivered = side === "supplier" && order.status === "shipped";
	const canReportDeliveryFailure = canDeclareDelivered && !deliveryZonesEnabled;
	const translatedSide = t(`sellerResale.${side}`);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={order.number} subtitle={translatedSide} />
			<ScrollView contentContainerStyle={styles.content}>
				<Card title={t(`sellerResale.status_${order.status}`)} c={c}>
					<Text style={[styles.body, { color: c.body }]}>
						{order.status === "sent"
							? t("sellerResale.counterparty", {
									side:
										side === "supplier"
											? t("sellerResale.reseller")
											: t("sellerResale.supplier"),
								})
							: ""}
					</Text>
					<Text style={[styles.amount, { color: c.text }]}>
						{t("sellerResale.collectAmount")}:{" "}
						{formatXaf(order.collectAmount, locale)}
					</Text>
					{order.supplierAmount !== null ? (
						<Text style={[styles.body, { color: c.body }]}>
							{formatXaf(order.supplierAmount, locale)}
						</Text>
					) : null}
				</Card>
				<Card title={t("sellerResale.items")} c={c}>
					{order.items.map((item) => (
						<Text key={item.id} style={[styles.body, { color: c.text }]}>
							{item.quantity} × {item.title}
							{item.variantLabel ? ` · ${item.variantLabel}` : ""}
						</Text>
					))}
				</Card>
				<Card title={t("sellerResale.delivery")} c={c}>
					<Text style={[styles.body, { color: c.text }]}>
						{order.delivery.recipientName}
					</Text>
					<Text style={[styles.body, { color: c.body }]}>
						{order.delivery.phoneMasked ? "••••••••" : order.delivery.phone}
					</Text>
					<Text style={[styles.body, { color: c.body }]}>
						{[
							order.delivery.city,
							order.delivery.district,
							order.delivery.landmark,
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
					{order.delivery.instructions ? (
						<Text style={[styles.body, { color: c.body }]}>
							{order.delivery.instructions}
						</Text>
					) : null}
				</Card>
				{side === "supplier" && order.status === "sent" ? (
					<ActionButton
						label={t("sellerResale.accept")}
						disabled={pending}
						onPress={() => run({ purchaseOrderId: order.id, action: "accept" })}
						c={c}
					/>
				) : null}
				{side === "supplier" && order.status === "accepted" ? (
					<Card title={t("sellerResale.ship")} c={c}>
						<View style={styles.carriers}>
							{(["own_courier", "yango", "other"] as const).map((carrier) => (
								<Pressable
									key={carrier}
									onPress={() => patch({ carrier })}
									accessibilityRole="radio"
									accessibilityState={{ selected: form.carrier === carrier }}
									style={[
										styles.carrier,
										{
											borderColor:
												form.carrier === carrier ? c.primary : c.border,
										},
									]}
								>
									<Text style={{ color: c.text, fontFamily: Fonts.body }}>
										{t(
											`sellerResale.carrier${carrier === "own_courier" ? "Own" : carrier === "yango" ? "Yango" : "Other"}`,
										)}
									</Text>
								</Pressable>
							))}
						</View>
						<TextInput
							value={form.trackingNumber}
							onChangeText={(trackingNumber) => patch({ trackingNumber })}
							placeholder={t("sellerResale.trackingNumber")}
							accessibilityLabel={t("sellerResale.trackingNumber")}
							style={[styles.input, { color: c.text, borderColor: c.border }]}
						/>
						<TextInput
							value={form.trackingUrl}
							onChangeText={(trackingUrl) => patch({ trackingUrl })}
							placeholder={t("sellerResale.trackingUrl")}
							accessibilityLabel={t("sellerResale.trackingUrl")}
							autoCapitalize="none"
							style={[styles.input, { color: c.text, borderColor: c.border }]}
						/>
						<ActionButton
							label={t("sellerResale.ship")}
							disabled={pending}
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "ship",
									body: {
										carrier: form.carrier,
										trackingNumber: form.trackingNumber.trim() || undefined,
										trackingUrl: form.trackingUrl.trim() || undefined,
									},
								})
							}
							c={c}
						/>
					</Card>
				) : null}
				{side === "supplier" && order.status === "shipped" ? (
					<Card title={t("sellerResale.handover")} c={c}>
						<TextInput
							value={form.handoverCode}
							onChangeText={(handoverCode) => patch({ handoverCode })}
							keyboardType="number-pad"
							maxLength={8}
							placeholder="••••••"
							accessibilityLabel={t("sellerResale.handoverCode")}
							style={[styles.input, { color: c.text, borderColor: c.border }]}
						/>
						<ActionButton
							label={t("sellerResale.handover")}
							disabled={pending || form.handoverCode.trim().length < 4}
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "handover",
									body: { code: form.handoverCode.trim() },
								})
							}
							c={c}
						/>
					</Card>
				) : null}
				{canDeclareDelivered ? (
					<Card title={t("sellerResale.declareDelivered")} c={c}>
						<TextInput
							value={form.deliveryNote}
							onChangeText={(deliveryNote) => patch({ deliveryNote })}
							placeholder={t("sellerResale.declareDeliveredNote")}
							accessibilityLabel={t("sellerResale.declareDeliveredNote")}
							maxLength={500}
							style={[styles.input, { color: c.text, borderColor: c.border }]}
						/>
						<ActionButton
							label={t("sellerResale.declareDelivered")}
							disabled={pending}
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "declare-delivered",
									body: { note: form.deliveryNote.trim() || undefined },
								})
							}
							c={c}
						/>
					</Card>
				) : null}
				{canReportDeliveryFailure ? (
					<Card title={t("sellerResale.deliveryFailureTitle")} c={c}>
						{(
							[
								"refused",
								"unreachable",
								"absent",
								"address_not_found",
								"timeout",
								"other",
							] as const
						).map((reason) => (
							<Pressable
								key={reason}
								onPress={() => patch({ deliveryFailureReason: reason })}
								accessibilityRole="radio"
								accessibilityState={{
									selected: form.deliveryFailureReason === reason,
								}}
								style={[
									styles.carrier,
									{
										borderColor:
											form.deliveryFailureReason === reason
												? c.primary
												: c.border,
									},
								]}
							>
								<Text style={{ color: c.text, fontFamily: Fonts.body }}>
									{t(`sellerResale.deliveryFailure.${reason}`)}
								</Text>
							</Pressable>
						))}
						<TextInput
							value={form.failedDeliveryCost}
							onChangeText={(value) =>
								patch({
									failedDeliveryCost: value.replace(/\D/g, "").slice(0, 10),
								})
							}
							keyboardType="number-pad"
							placeholder={t("sellerResale.failedDeliveryCost", {
								max: formatXaf(order.deliveryFee, locale),
							})}
							accessibilityLabel={t("sellerResale.failedDeliveryCost", {
								max: formatXaf(order.deliveryFee, locale),
							})}
							style={[styles.input, { color: c.text, borderColor: c.border }]}
						/>
						<TextInput
							value={form.deliveryFailureNote}
							onChangeText={(deliveryFailureNote) =>
								patch({ deliveryFailureNote })
							}
							placeholder={t("sellerResale.deliveryFailureNote")}
							accessibilityLabel={t("sellerResale.deliveryFailureNote")}
							multiline
							maxLength={500}
							style={[
								styles.input,
								styles.note,
								{ color: c.text, borderColor: c.border },
							]}
						/>
						<ActionButton
							label={t("sellerResale.reportDeliveryFailure")}
							disabled={
								pending ||
								Number(form.failedDeliveryCost) > order.deliveryFee ||
								(form.deliveryFailureReason === "other" &&
									!form.deliveryFailureNote.trim())
							}
							secondary
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "delivery-failed",
									body: {
										reason: form.deliveryFailureReason,
										failedDeliveryCost: Number(form.failedDeliveryCost),
										note: form.deliveryFailureNote.trim() || undefined,
									},
								})
							}
							c={c}
						/>
					</Card>
				) : null}
				{received ? (
					<Card title={t("sellerResale.returnReceived")} c={c}>
						<ActionButton
							label={t("sellerResale.resellable")}
							disabled={pending}
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "return-received",
									body: { condition: "resellable" },
								})
							}
							c={c}
						/>
						<ActionButton
							label={t("sellerResale.damaged")}
							disabled={pending}
							secondary
							onPress={() =>
								run({
									purchaseOrderId: order.id,
									action: "return-received",
									body: { condition: "damaged" },
								})
							}
							c={c}
						/>
					</Card>
				) : null}
				{canCancel ? (
					<Card title={t("sellerResale.cancelReason")} c={c}>
						{(
							[
								"seller_out_of_stock",
								"seller_cannot_deliver",
								"seller_other",
							] as const
						).map((reason) => (
							<Pressable
								key={reason}
								onPress={() => patch({ cancelReason: reason })}
								accessibilityRole="radio"
								accessibilityState={{ selected: form.cancelReason === reason }}
								style={[
									styles.carrier,
									{
										borderColor:
											form.cancelReason === reason ? c.primary : c.border,
									},
								]}
							>
								<Text style={{ color: c.text, fontFamily: Fonts.body }}>
									{t(`sellerResale.reason_${reason}`)}
								</Text>
							</Pressable>
						))}
						{form.cancelReason === "seller_other" ? (
							<TextInput
								value={form.cancelNote}
								onChangeText={(cancelNote) => patch({ cancelNote })}
								placeholder={t("sellerResale.cancelNote")}
								accessibilityLabel={t("sellerResale.cancelNote")}
								multiline
								style={[
									styles.input,
									styles.note,
									{ color: c.text, borderColor: c.border },
								]}
							/>
						) : null}
						<ActionButton
							label={t("sellerResale.cancel")}
							disabled={
								pending ||
								(form.cancelReason === "seller_other" &&
									!form.cancelNote.trim())
							}
							secondary
							onPress={() =>
								Alert.alert(
									t("sellerResale.confirmCancelTitle"),
									t("sellerResale.confirmCancelBody"),
									[
										{ text: t("sellerResale.dismiss"), style: "cancel" },
										{
											text: t("sellerResale.cancel"),
											style: "destructive",
											onPress: () =>
												run({
													purchaseOrderId: order.id,
													action: "cancel",
													body: {
														reason: form.cancelReason,
														note: form.cancelNote.trim() || undefined,
													},
												}),
										},
									],
								)
							}
							c={c}
						/>
					</Card>
				) : null}
				{action.isError ? (
					<Text
						accessibilityRole="alert"
						style={[styles.error, { color: c.danger }]}
					>
						{t("sellerResale.actionFailed")}
					</Text>
				) : null}
				{pending ? <ActivityIndicator color={c.primary} /> : null}
			</ScrollView>
		</SafeAreaView>
	);
}

function Card({
	title,
	children,
	c,
}: {
	title: string;
	children: React.ReactNode;
	c: ReturnType<typeof useShopTheme>;
}) {
	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.heading, { color: c.text }]}>{title}</Text>
			{children}
		</View>
	);
}
function ActionButton({
	label,
	onPress,
	disabled,
	secondary,
	c,
}: {
	label: string;
	onPress: () => void;
	disabled: boolean;
	secondary?: boolean;
	c: ReturnType<typeof useShopTheme>;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			style={[
				styles.button,
				{
					backgroundColor: secondary ? c.card : c.primary,
					borderColor: c.primary,
					opacity: disabled ? 0.55 : 1,
				},
			]}
		>
			<Ionicons
				name="checkmark"
				size={18}
				color={secondary ? c.primary : "#ffffff"}
			/>
			<Text
				style={[
					styles.buttonText,
					{ color: secondary ? c.primary : "#ffffff" },
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, gap: 12, paddingBottom: 36 },
	card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
	heading: { fontSize: 15, fontFamily: Fonts.displayBold },
	body: { fontSize: 14, fontFamily: Fonts.body },
	amount: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	input: {
		minHeight: 48,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		fontFamily: Fonts.body,
	},
	note: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
	carriers: { flexDirection: "row", gap: 6 },
	carrier: { borderWidth: 1, borderRadius: 8, padding: 8 },
	button: {
		minHeight: 48,
		borderRadius: 10,
		borderWidth: 1,
		flexDirection: "row",
		gap: 8,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 12,
	},
	buttonText: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	error: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
