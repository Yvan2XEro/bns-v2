import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerReturnActions } from "@/src/components/returns/SellerReturnActions";
import { useReturnAction, useReturnCase } from "@/src/hooks/useReturns";
import { useTranslation } from "@/src/lib/i18n";
import type { ReturnAction } from "../../../api/src/contracts/returns";

const shipSchema = z.object({ tracking: z.string().trim().max(200) });
type ShipForm = z.infer<typeof shipSchema>;

export default function ReturnCaseScreen() {
	const dark = useColorScheme() === "dark";
	const { t, i18n } = useTranslation();
	const params = useLocalSearchParams<{ id: string }>();
	const id = Array.isArray(params.id) ? params.id[0] : params.id;
	const query = useReturnCase(id);
	const mutation = useReturnAction(id ?? "");
	const shipForm = useForm<ShipForm>({
		resolver: zodResolver(shipSchema),
		defaultValues: { tracking: "" },
	});
	const colors = {
		bg: dark ? "#0b1120" : "#f8fafc",
		card: dark ? "#111c2e" : "#fff",
		text: dark ? "#e2e8f0" : "#0f172a",
		muted: dark ? "#94a3b8" : "#64748b",
		border: dark ? "#1e3a5f" : "#e2e8f0",
		primary: dark ? "#60a5fa" : "#1e40af",
	};
	const runAction = (action: ReturnAction, suppliedBody?: unknown) => {
		const body =
			action === "ship"
				? suppliedBody
				: action === "accept_deduction" || action === "contest_deduction"
					? { action: action === "accept_deduction" ? "accept" : "contest" }
					: (suppliedBody ?? {});
		mutation.mutate({ action, body });
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: colors.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: colors.border }]}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
					onPress={() => router.back()}
					hitSlop={12}
				>
					<Ionicons name="arrow-back" size={22} color={colors.text} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: colors.text }]}>
					{query.data?.number ?? t("returns.title")}
				</Text>
				<View style={styles.spacer} />
			</View>
			{query.isPending ? (
				<ActivityIndicator style={styles.loading} color={colors.primary} />
			) : query.isError || !query.data ? (
				<EmptyState
					illustration="notFound"
					title={t("returns.detailError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : (
				<ScrollView contentContainerStyle={styles.content}>
					{mutation.isError ? (
						<Text accessibilityRole="alert" style={styles.error}>
							{t("returns.actionError")}
						</Text>
					) : null}
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("returns.order", { number: query.data.orderNumber })}
						</Text>
						<Text style={[styles.body, { color: colors.muted }]}>
							{t(`returns.status.${query.data.status}`)} ·{" "}
							{t(`returns.basis.${query.data.basis}`)}
						</Text>
						<Text style={[styles.amount, { color: colors.text }]}>
							{t("returns.refundAmount", {
								amount: query.data.refund.amount.toLocaleString(i18n.language),
							})}
						</Text>
						{query.data.reasonText ? (
							<Text style={[styles.body, { color: colors.muted }]}>
								{query.data.reasonText}
							</Text>
						) : null}
						{query.data.rejectionReason ? (
							<Text style={[styles.error]}>{query.data.rejectionReason}</Text>
						) : null}
					</View>
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("returns.items")}
						</Text>
						{query.data.items.map((item) => (
							<Text
								key={item.orderItemId}
								style={[styles.body, { color: colors.muted }]}
							>
								{item.title} × {item.quantity}
							</Text>
						))}
						<Text style={[styles.body, { color: colors.muted }]}>
							{t("returns.returnShippingPaidBy", {
								party: t(`returns.party.${query.data.returnShippingPaidBy}`),
							})}
						</Text>
					</View>
					{query.data.allowedActions.includes("ship") ? (
						<View
							style={[
								styles.card,
								{ backgroundColor: colors.card, borderColor: colors.border },
							]}
						>
							<Text style={[styles.title, { color: colors.text }]}>
								{t("returns.shipReturn")}
							</Text>
							<Text style={[styles.body, { color: colors.text }]}>
								{t(`returns.method.${query.data.returnMethod}`)}
							</Text>
							<Controller
								control={shipForm.control}
								name="tracking"
								render={({ field: { onBlur, onChange, value } }) => (
									<TextInput
										accessibilityLabel={t("returns.trackingLabel")}
										value={value}
										onBlur={onBlur}
										onChangeText={onChange}
										maxLength={200}
										placeholder={t("returns.trackingPlaceholder")}
										style={[
											styles.input,
											{ color: colors.text, borderColor: colors.border },
										]}
									/>
								)}
							/>
							<ActionButton
								label={t("returns.action.ship")}
								pending={mutation.isPending}
								color={colors.primary}
								onPress={() =>
									shipForm.handleSubmit(({ tracking }) =>
										runAction("ship", {
											returnMethod: query.data.returnMethod,
											...(tracking ? { returnTracking: tracking } : {}),
										}),
									)()
								}
							/>
						</View>
					) : null}
					{query.data.refund.sellerProof ? (
						<View
							style={[
								styles.card,
								{ backgroundColor: colors.card, borderColor: colors.border },
							]}
						>
							<Text style={[styles.title, { color: colors.text }]}>
								{t("returns.refundProof")}
							</Text>
							<Text style={[styles.body, { color: colors.muted }]}>
								{t("returns.refundProofDetail", {
									method: query.data.refund.sellerProof.method,
									amount: query.data.refund.sellerProof.amount.toLocaleString(
										i18n.language,
									),
									transactionId:
										query.data.refund.sellerProof.transactionId ?? "—",
								})}
							</Text>
						</View>
					) : null}
					<View
						style={[
							styles.card,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Text style={[styles.title, { color: colors.text }]}>
							{t("returns.timeline")}
						</Text>
						{query.data.timeline.map((event, index) => (
							<View
								key={`${event.status}-${event.at}-${index}`}
								style={styles.event}
							>
								<Text style={[styles.body, { color: colors.text }]}>
									{t(`returns.status.${event.status}`)}
								</Text>
								<Text style={[styles.caption, { color: colors.muted }]}>
									{new Date(event.at).toLocaleString(i18n.language)}
									{event.note ? ` · ${event.note}` : ""}
								</Text>
							</View>
						))}
					</View>
					<View style={styles.actions}>
						{query.data.allowedActions
							.filter(
								(item) =>
									item !== "ship" &&
									item !== "pickup" &&
									item !== "upload_evidence" &&
									item !== "refund_proof" &&
									item !== "inspect" &&
									item !== "receive",
							)
							.map((item) => (
								<ActionButton
									key={item}
									label={t(`returns.action.${item}`)}
									pending={mutation.isPending}
									color={
										item === "cancel" ||
										item === "contest_refund" ||
										item === "contest_deduction"
											? "#dc2626"
											: colors.primary
									}
									onPress={() => runAction(item)}
								/>
							))}
					</View>
					<SellerReturnActions view={query.data} />
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

function ActionButton({
	label,
	pending,
	color,
	onPress,
}: {
	label: string;
	pending: boolean;
	color: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			disabled={pending}
			onPress={onPress}
			style={[styles.button, { backgroundColor: color }]}
		>
			{pending ? (
				<ActivityIndicator color="#fff" />
			) : (
				<Text style={styles.buttonText}>{label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 16,
		paddingHorizontal: 18,
		paddingVertical: 14,
	},
	headerTitle: { flex: 1, fontFamily: Fonts.displaySemibold, fontSize: 18 },
	spacer: { width: 22 },
	loading: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 32, gap: 12 },
	card: { borderRadius: 14, borderWidth: 1, gap: 9, padding: 15 },
	title: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
	amount: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	caption: { fontFamily: Fonts.body, fontSize: 12 },
	error: { color: "#dc2626", fontFamily: Fonts.bodySemibold },
	row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	method: { borderRadius: 9, borderWidth: 1, padding: 10 },
	input: {
		borderRadius: 9,
		borderWidth: 1,
		minHeight: 44,
		paddingHorizontal: 10,
	},
	actions: { gap: 8 },
	button: {
		alignItems: "center",
		borderRadius: 9,
		justifyContent: "center",
		minHeight: 44,
		padding: 10,
	},
	buttonText: { color: "#fff", fontFamily: Fonts.bodySemibold },
	event: {
		borderLeftColor: "#94a3b8",
		borderLeftWidth: 2,
		gap: 2,
		paddingLeft: 10,
	},
});
