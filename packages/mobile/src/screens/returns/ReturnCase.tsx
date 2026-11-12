import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	Platform,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import {
	CaseStatusPill,
	returnTone,
} from "@/src/components/checkout/CaseStatusPill";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { FormError } from "@/src/components/checkout/FormError";
import { fillOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { PurchaseButton } from "@/src/components/purchases/ui";
import { SellerReturnActions } from "@/src/components/returns/SellerReturnActions";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useReturnAction, useReturnCase } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	RETURN_ACTION_LABELS,
	RETURN_BASIS_LABELS,
	RETURN_CASE_STATUS_LABELS,
	RETURN_PAYER_LABELS,
} from "@/src/lib/caseStatus";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { ReturnAction } from "../../../../api/src/contracts/returns";

/** Actions answered by a form or by the shop's panel, not by a lone button. */
const CASE_FORM_ACTIONS = new Set<ReturnAction>([
	"ship",
	"pickup",
	"upload_evidence",
	"refund_proof",
	"inspect",
	"receive",
]);
const DANGER_ACTIONS = new Set<ReturnAction>([
	"cancel",
	"contest_refund",
	"contest_deduction",
]);

/** Each action's own receipt, so the buyer knows which one went through. */
const ACTION_DONE: Partial<Record<ReturnAction, string>> = {
	ship: "returns.done.ship",
	accept_deduction: "returns.done.accept_deduction",
	contest_deduction: "returns.done.contest_deduction",
	confirm_refund: "returns.done.confirm_refund",
	contest_refund: "returns.done.contest_refund",
	cancel: "returns.done.cancel",
};

/** What a confirm asks before an action that cannot be taken back. */
const CONFIRM_BODY: Partial<Record<ReturnAction, string>> = {
	cancel: "returns.confirmCancelBody",
	contest_deduction: "returns.confirmContestDeductionBody",
	contest_refund: "returns.confirmContestRefundBody",
};

/** Where the case stands, in the buyer's words (`returns.step.*`). */
function stepOf(status: string): string {
	switch (status) {
		case "requested":
			return "returns.step.requested";
		case "approved":
		case "awaiting_shipment":
		case "in_transit":
			return "returns.step.shipping";
		case "received":
		case "inspected":
			return "returns.step.inspection";
		case "refund_pending":
		case "disputed":
			return "returns.step.refund";
		default:
			return "returns.step.complete";
	}
}

/** The nearest deadline still ahead, if any. */
function nextDeadline(
	deadlines: Record<string, string | null>,
	now: number,
): string | null {
	const ahead = Object.values(deadlines)
		.filter((value): value is string => Boolean(value))
		.filter((value) => new Date(value).getTime() > now)
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
	return ahead[0] ?? null;
}

const shipSchema = z.object({ tracking: z.string().trim().max(200) });
type ShipForm = z.infer<typeof shipSchema>;

export function ReturnCase({ id }: { id: string }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const query = useReturnCase(id);
	const mutation = useReturnAction(id ?? "");
	const shipForm = useForm<ShipForm>({
		resolver: zodResolver(shipSchema),
		defaultValues: { tracking: "" },
	});
	const { confirm, showSuccess } = useAlert();
	// Only the button that was pressed spins; the others wait, dimmed.
	const [running, setRunning] = useState<ReturnAction | null>(null);
	const [pulling, setPulling] = useState(false);
	const { refetch } = query;
	const onRefresh = useCallback(() => {
		setPulling(true);
		void refetch().finally(() => setPulling(false));
	}, [refetch]);
	const runAction = (action: ReturnAction, suppliedBody?: unknown) => {
		const body =
			action === "ship"
				? suppliedBody
				: action === "accept_deduction" || action === "contest_deduction"
					? { action: action === "accept_deduction" ? "accept" : "contest" }
					: (suppliedBody ?? {});
		setRunning(action);
		mutation.mutate(
			{ action, body },
			{
				onSuccess: () =>
					showSuccess(t(ACTION_DONE[action] ?? "returns.actionSuccess")),
				onSettled: () => setRunning(null),
			},
		);
	};
	// Cancelling or contesting cannot be taken back: asked first.
	const confirmThen = async (action: ReturnAction) => {
		const body = CONFIRM_BODY[action];
		const ok = await confirm(
			t(RETURN_ACTION_LABELS[action]),
			body ? t(body) : undefined,
			{
				confirmText: t(RETURN_ACTION_LABELS[action]),
				destructive: true,
			},
		);
		if (ok) runAction(action);
	};
	const buyerActions = (query.data?.allowedActions ?? []).filter(
		(item) => !CASE_FORM_ACTIONS.has(item),
	);
	const card = [
		styles.card,
		{ backgroundColor: c.card, borderColor: c.border },
	];
	const dateOf = (iso: string) =>
		new Intl.DateTimeFormat(i18n.language, {
			day: "numeric",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Africa/Douala",
		}).format(new Date(iso));
	// The first allowed action leads; the rest step back, so a stack of
	// equal filled buttons never hides which one matters.
	const leadAction = buyerActions.find((item) => !DANGER_ACTIONS.has(item));

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={query.data?.number ?? t("returns.title")}
				onBack={() =>
					router.canGoBack()
						? router.back()
						: router.replace("/account/returns")
				}
			/>
			{query.isPending ? (
				<DetailSkeleton cards={2} />
			) : query.isError || !query.data ? (
				<EmptyState
					illustration="notFound"
					title={t("returns.detailError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : (
				<ScreenColumn width="reading">
					<ScrollView
						contentContainerStyle={styles.content}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="interactive"
						automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
						refreshControl={
							<RefreshControl
								refreshing={pulling}
								onRefresh={onRefresh}
								tintColor={c.primary}
								colors={[c.primary]}
							/>
						}
					>
						<View style={card}>
							<View style={styles.headRow}>
								<Text
									style={[styles.title, styles.flex, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("returns.order", { number: query.data.orderNumber })}
								</Text>
								<CaseStatusPill
									label={t(RETURN_CASE_STATUS_LABELS[query.data.status])}
									tone={returnTone(query.data.status)}
								/>
							</View>
							<Text style={[styles.body, { color: c.body }]}>
								{t(RETURN_BASIS_LABELS[query.data.basis])}
							</Text>
							<View
								style={styles.refund}
								accessible
								accessibilityLabel={t("returns.refundAmount", {
									amount: formatPrice(query.data.refund.amount, i18n.language),
								})}
							>
								<Text style={[styles.label, { color: c.body }]}>
									{t("returns.refundTotal")}
								</Text>
								<TotalTag
									amount={formatPrice(query.data.refund.amount, i18n.language)}
								/>
							</View>
							{query.data.reasonText ? (
								<Text style={[styles.body, { color: c.body }]}>
									{query.data.reasonText}
								</Text>
							) : null}
							{query.data.rejectionReason ? (
								<View
									style={[styles.notice, { backgroundColor: c.dangerSoft }]}
								>
									<Ionicons
										name="close-circle"
										size={18}
										color={c.dangerText}
										style={styles.noticeIcon}
									/>
									<Text
										style={[styles.body, styles.flex, { color: c.dangerText }]}
									>
										{query.data.rejectionReason}
									</Text>
								</View>
							) : null}
						</View>
						<View style={card}>
							<Text
								style={[styles.title, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("returns.actionsTitle")}
							</Text>
							<Text style={[styles.body, { color: c.body }]}>
								{t(stepOf(query.data.status))}
							</Text>
							{(() => {
								const due = nextDeadline(query.data.deadlines, Date.now());
								return due ? (
									<Text style={[styles.label, { color: c.text }]}>
										{t("returns.nextDeadline", { date: dateOf(due) })}
									</Text>
								) : null;
							})()}
							<FormError
								message={
									mutation.isError
										? resolveErrorMessage(
												mutation.error,
												t,
												t("returns.actionError"),
											)
										: null
								}
							/>
							{buyerActions.map((item) => {
								const danger = DANGER_ACTIONS.has(item);
								return (
									<PurchaseButton
										key={item}
										label={t(RETURN_ACTION_LABELS[item])}
										pending={running === item}
										disabled={mutation.isPending}
										tone={
											danger
												? "danger"
												: item === leadAction
													? "primary"
													: "outline"
										}
										onPress={() =>
											danger ? void confirmThen(item) : runAction(item)
										}
									/>
								);
							})}
						</View>
						<View style={card}>
							<Text
								style={[styles.title, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("returns.items")}
							</Text>
							{query.data.items.map((item) => (
								<View key={item.orderItemId} style={styles.itemRow}>
									<Text style={[styles.body, styles.flex, { color: c.text }]}>
										{item.title}
									</Text>
									<Text style={[styles.qty, { color: c.body }]}>
										× {item.quantity}
									</Text>
								</View>
							))}
							<View style={[styles.divider, { backgroundColor: c.border }]} />
							<Text style={[styles.meta, { color: c.muted }]}>
								{t("returns.returnShippingPaidBy", {
									party: t(
										RETURN_PAYER_LABELS[query.data.returnShippingPaidBy],
									),
								})}
							</Text>
						</View>
						{query.data.allowedActions.includes("ship") ? (
							<View style={card}>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("returns.shipReturn")}
								</Text>
								<Text style={[styles.body, { color: c.body }]}>
									{t(`returns.method.${query.data.returnMethod}`)}
								</Text>
								<Text style={[styles.label, { color: c.body }]}>
									{t("returns.trackingLabel")}
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
											placeholderTextColor={c.muted}
											selectionColor={c.primary}
											style={[
												styles.input,
												{
													color: c.text,
													backgroundColor: c.input,
													borderColor: c.border,
												},
											]}
										/>
									)}
								/>
								<PurchaseButton
									label={t("returns.action.ship")}
									pending={running === "ship"}
									disabled={mutation.isPending}
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
							<View style={card}>
								<Text
									style={[styles.title, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("returns.refundProof")}
								</Text>
								<Text style={[styles.body, { color: c.body }]}>
									{t("returns.refundProofDetail", {
										method: t(
											`returns.refundMethodOptions.${query.data.refund.sellerProof.method}`,
										),
										amount: formatPrice(
											query.data.refund.sellerProof.amount,
											i18n.language,
										),
										transactionId:
											query.data.refund.sellerProof.transactionId ?? "—",
									})}
								</Text>
							</View>
						) : null}
						<View style={card}>
							<Text
								style={[styles.title, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("returns.timeline")}
							</Text>
							<CaseTimeline
								events={query.data.timeline.map((event, index) => ({
									key: `${event.status}-${event.at}-${index}`,
									title: t(RETURN_CASE_STATUS_LABELS[event.status]),
									meta: `${dateOf(event.at)}${
										event.note ? ` · ${event.note}` : ""
									}`,
								}))}
							/>
						</View>
						<SellerReturnActions view={query.data} />
					</ScrollView>
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

/** Events on a rail, oldest first; the latest one carries the filled dot. */
function CaseTimeline({
	events,
}: {
	events: { key: string; title: string; meta: string }[];
}) {
	const c = useShopTheme();
	const fill = fillOf(c).bg;
	return (
		<View>
			{events.map((event, index) => {
				const latest = index === events.length - 1;
				return (
					<View key={event.key} style={styles.event}>
						<View style={styles.rail}>
							<View
								style={[
									styles.dot,
									latest
										? { backgroundColor: fill, borderColor: c.primarySoft }
										: { backgroundColor: c.card, borderColor: c.border },
								]}
							/>
							{latest ? null : (
								<View style={[styles.line, { backgroundColor: c.border }]} />
							)}
						</View>
						<View style={styles.eventText}>
							<Text style={[styles.eventTitle, { color: c.text }]}>
								{event.title}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{event.meta}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	flex: { flex: 1 },
	content: { padding: 16, paddingBottom: 40, gap: 16 },
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		gap: 10,
		padding: 16,
	},
	headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	title: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 26 },
	body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	label: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
	meta: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
	qty: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 22,
		fontVariant: ["tabular-nums"],
	},
	refund: { gap: 6, paddingVertical: 2 },
	notice: {
		flexDirection: "row",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	noticeIcon: { marginTop: 2 },
	itemRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	divider: { height: StyleSheet.hairlineWidth },
	input: {
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 48,
		paddingHorizontal: 12,
		fontFamily: Fonts.body,
		fontSize: 16,
	},
	actions: { gap: 10 },
	event: { flexDirection: "row", gap: 12 },
	rail: { width: 14, alignItems: "center" },
	dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 3 },
	line: { flex: 1, width: 2, marginVertical: 3 },
	eventText: { flex: 1, gap: 2, paddingBottom: 16 },
	eventTitle: { fontFamily: Fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
});
