import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { HoldsList } from "@/src/components/payments/HoldsList";
import { PaymentsShell } from "@/src/components/payments/PaymentsShell";
import { PayoutAccountForm } from "@/src/components/payments/PayoutAccountForm";
import { fillOf } from "@/src/components/shop/ink";
import { StatusTag, type StatusTone } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	PAYMENTS_ONBOARDING_RETURN_URL,
	type SubmitPayoutAccountInput,
	usePaymentSetupReturn,
	useReportPayoutAccountNotMe,
	useSellerPaymentSetup,
	useStartOnboarding,
	useSubmitPayoutAccount,
} from "@/src/hooks/useSellerPayments";
import { useMyShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import type { ConnectedAccountStatus } from "@/src/lib/paymentStatus";
import {
	CONNECTED_ACCOUNT_STATUSES,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
} from "@/src/lib/paymentStatus";
import { notMeAccountId } from "@/src/lib/sellerPayments";
import type { PaymentSetupView } from "@/src/types/order";

/** What each NotchPay account status asks of the seller, as a tone. */
const CONNECTED_TONE: Record<ConnectedAccountStatus, StatusTone> = {
	created: "neutral",
	onboarding: "warning",
	restricted: "warning",
	active: "success",
	disabled: "danger",
	deauthorized: "danger",
};

/**
 * NotchPay names a missing document with a code ("individual.id_number").
 * A known code has its own sentence; an unknown one is made readable rather
 * than shown raw.
 */
function requirementLabel(
	code: string,
	t: (key: string, options?: Record<string, unknown>) => string,
): string {
	const tail = code.split(".").pop() ?? code;
	const readable = tail.replace(/[_-]+/g, " ").trim();
	const fallback = readable.charAt(0).toUpperCase() + readable.slice(1);
	return t(`paymentRequirements.${code.replace(/\./g, "_")}`, {
		defaultValue: fallback,
	});
}

/**
 * The SMS "this was not me" link's target: `?shop=&notMe=<accountId>` in
 * the deep link, same contract as web's `NotMeBanner`. The POST only ever
 * fires from this button's own `onPress` — never an effect, never on
 * mount — because an SMS link preview (most carriers and messaging apps
 * fetch a link to generate one) would otherwise report every legitimate
 * change as fraud before the owner has even opened the message.
 */
function NotMeBanner({
	shopId,
	accountId,
}: {
	shopId: string;
	accountId: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const reportNotMe = useReportPayoutAccountNotMe(shopId);

	if (reportNotMe.isSuccess) {
		return (
			<View
				style={[
					s.card,
					{ backgroundColor: c.successSoft, borderColor: c.success },
				]}
			>
				<Text style={[s.meta, { color: c.successText }]}>
					{t("payments.setup_notMeConfirmed")}
				</Text>
			</View>
		);
	}

	return (
		<View
			style={[s.card, { backgroundColor: c.dangerSoft, borderColor: c.danger }]}
		>
			<Text style={[s.meta, { color: c.dangerText }]}>
				{t("payments.setup_notMe")}
			</Text>
			{reportNotMe.isError ? (
				<Text style={[s.meta, { color: c.dangerText }]}>
					{resolveErrorMessage(reportNotMe.error, t)}
				</Text>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("payments.setup_notMe")}
				accessibilityState={{ busy: reportNotMe.isPending }}
				disabled={reportNotMe.isPending}
				onPress={() => reportNotMe.mutate(accountId)}
				style={[s.button, { backgroundColor: c.danger, marginTop: 8 }]}
			>
				{reportNotMe.isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={s.buttonText}>{t("payments.setup_notMe")}</Text>
				)}
			</Pressable>
		</View>
	);
}

function SetupContent({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const { showError, showSuccess, confirm } = useAlert();
	const mine = useMyShop();
	// The saved account shows as a card; the form opens only on purpose,
	// because any change pauses payouts.
	const [changing, setChanging] = useState(false);
	const params = useLocalSearchParams<{ shop?: string; notMe?: string }>();
	const notMeId = notMeAccountId(shopId, {
		shop: params.shop ?? null,
		notMe: params.notMe ?? null,
	});

	const setup = useSellerPaymentSetup(shopId);
	const onboardingReturn = usePaymentSetupReturn(shopId);
	const startOnboarding = useStartOnboarding(shopId);
	const submitAccount = useSubmitPayoutAccount(shopId);

	const refresh = () => setup.refetch();

	const onContinueOnboarding = async () => {
		try {
			const { url } = await startOnboarding.mutateAsync();
			await WebBrowser.openAuthSessionAsync(
				url,
				PAYMENTS_ONBOARDING_RETURN_URL,
			);
			await onboardingReturn.mutateAsync();
		} catch (error) {
			showError(
				t("payments.setup_onboardingFailed"),
				resolveErrorMessage(error, t),
			);
		}
	};

	const onSaveAccount = (input: SubmitPayoutAccountInput) =>
		submitAccount.mutate(input, {
			onSuccess: () => {
				setChanging(false);
				showSuccess(t("payments.setup_saved"));
			},
			onError: (error) =>
				showError(
					t("payments.setup_saveFailed"),
					resolveErrorMessage(error, t),
				),
		});

	if (setup.isPending) {
		return <DetailSkeleton cards={2} />;
	}
	if (setup.isError) {
		return (
			<EmptyState
				illustration="notFound"
				title={t("payments.setup_title")}
				subtitle={resolveErrorMessage(setup.error, t)}
				ctaLabel={t("common.retry")}
				onCta={refresh}
			/>
		);
	}

	const view: PaymentSetupView = setup.data;

	if (!view.flagEnabled) {
		return (
			<EmptyState
				illustration="sell"
				title={t("payments.comingSoon")}
				subtitle={t("payments.setup_comingSoon")}
			/>
		);
	}

	if (view.ineligibleReason === "market") {
		return (
			<EmptyState
				illustration="notFound"
				title={t("payments.setup_title")}
				subtitle={t("apiErrors.payment.marketUnavailable")}
			/>
		);
	}

	if (view.ineligibleReason === "shopStatus") {
		return (
			<EmptyState
				illustration="notFound"
				title={
					mine.data?.shop?.status === "suspended"
						? t("seller.suspendedIndefinitely")
						: t("seller.shopInactive")
				}
				subtitle={t("apiErrors.shop.inactive")}
			/>
		);
	}

	const cooldownActive =
		view.changeCooldownUntil !== null &&
		Date.parse(view.changeCooldownUntil) > Date.now();

	return (
		<ScreenColumn width="reading">
			<ScrollView
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl refreshing={setup.isRefetching} onRefresh={refresh} />
				}
			>
				{notMeId ? <NotMeBanner shopId={shopId} accountId={notMeId} /> : null}

				{view.ineligibleReason === "level" ? (
					<View
						style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
					>
						<Text style={[s.cardTitle, { color: c.text }]}>
							{t("payments.setup_step1Title")}
						</Text>
						<Text style={[s.body, { color: c.body }]}>
							{t("payments.setup_step1Body")}
						</Text>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("payments.setup_step1Action")}
							onPress={() => router.push("/seller/verification")}
							style={[s.button, { backgroundColor: fillOf(c), marginTop: 10 }]}
						>
							<Text style={s.buttonText}>
								{t("payments.setup_step1Action")}
							</Text>
						</Pressable>
					</View>
				) : (
					<>
						<View
							style={[
								s.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[s.cardTitle, { color: c.text }]}>
								{t("payments.setup_step2Title")}
							</Text>
							<Text style={[s.body, { color: c.body }]}>
								{t("payments.setup_step2Body")}
							</Text>
							<View style={styles.tagRow}>
								<StatusTag
									label={
										view.connectedAccount
											? t(
													CONNECTED_ACCOUNT_STATUSES[
														view.connectedAccount.status
													],
												)
											: t("payments.accountStatus_created")
									}
									tone={
										view.connectedAccount
											? CONNECTED_TONE[view.connectedAccount.status]
											: "neutral"
									}
								/>
							</View>
							{view.connectedAccount &&
							view.connectedAccount.requirementsDue.length > 0 ? (
								<View style={styles.requirements}>
									<Text style={[s.meta, { color: c.warningText }]}>
										{t("payments.setup_requirementsDue")}
									</Text>
									{view.connectedAccount.requirementsDue.map((req) => (
										<Text key={req} style={[s.body, { color: c.text }]}>
											{"• "}
											{requirementLabel(req, t)}
										</Text>
									))}
								</View>
							) : null}
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("payments.setup_step2Action")}
								accessibilityState={{ busy: startOnboarding.isPending }}
								onPress={onContinueOnboarding}
								disabled={startOnboarding.isPending}
								style={[
									s.button,
									{ backgroundColor: fillOf(c), marginTop: 10 },
								]}
							>
								{startOnboarding.isPending ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={s.buttonText}>
										{t("payments.setup_step2Action")}
									</Text>
								)}
							</Pressable>
						</View>

						<View
							style={[
								s.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text style={[s.cardTitle, { color: c.text }]}>
								{t("payments.setup_step3Title")}
							</Text>
							{view.payoutAccount ? (
								<View
									style={[
										styles.accountCard,
										{ backgroundColor: c.bg, borderColor: c.border },
									]}
									accessible
									accessibilityLabel={[
										t(PAYOUT_METHODS[view.payoutAccount.method]),
										view.payoutAccount.accountNumberMasked,
										t(PAYOUT_ACCOUNT_STATUSES[view.payoutAccount.status]),
									].join(", ")}
								>
									<Text style={[s.body, { color: c.text }]}>
										{t(PAYOUT_METHODS[view.payoutAccount.method])}
									</Text>
									<Text style={[styles.accountNumber, { color: c.text }]}>
										{view.payoutAccount.accountNumberMasked}
									</Text>
									<View style={styles.tagRow}>
										<StatusTag
											label={t(
												PAYOUT_ACCOUNT_STATUSES[view.payoutAccount.status],
											)}
											tone={
												view.payoutAccount.status === "active"
													? "success"
													: view.payoutAccount.status === "rejected"
														? "danger"
														: "warning"
											}
										/>
									</View>
								</View>
							) : view.pendingAccount ? (
								<Text style={[s.meta, { color: c.muted, marginBottom: 8 }]}>
									{view.pendingAccount.accountNumberMasked} ·{" "}
									{t(
										PAYOUT_ACCOUNT_STATUSES[
											view.pendingAccount
												.status as keyof typeof PAYOUT_ACCOUNT_STATUSES
										] ?? PAYOUT_ACCOUNT_STATUSES.pending_review,
									)}
								</Text>
							) : null}

							{cooldownActive && view.changeCooldownUntil ? (
								<Text style={[s.meta, { color: c.warningText, marginTop: 8 }]}>
									{t("payments.setup_cooldownUntil", {
										date: formatOrderDate(view.changeCooldownUntil, locale),
									})}
								</Text>
							) : (
								<View style={{ marginTop: 10 }}>
									{view.payoutAccount && !changing ? (
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={t("payments.setup_changeAccount")}
											onPress={async () => {
												const ok = await confirm(
													t("payments.setup_changeAccount"),
													t("payments.setup_changeNotice", {
														hours: view.payoutChangeHoldHours,
													}),
													{ confirmText: t("payments.setup_changeAccount") },
												);
												if (ok) setChanging(true);
											}}
											style={({ pressed }) => [
												s.button,
												{
													backgroundColor: c.card,
													borderColor: c.border,
													borderWidth: 1,
												},
												pressed && { opacity: 0.85 },
											]}
										>
											<Text style={[s.buttonText, { color: c.link }]}>
												{t("payments.setup_changeAccount")}
											</Text>
										</Pressable>
									) : (
										<>
											{view.payoutAccount ? (
												<Text
													style={[
														s.meta,
														{ color: c.warningText, marginBottom: 8 },
													]}
												>
													{t("payments.setup_changeNotice", {
														hours: view.payoutChangeHoldHours,
													})}
												</Text>
											) : null}
											<PayoutAccountForm
												onSubmit={onSaveAccount}
												pending={submitAccount.isPending}
											/>
										</>
									)}
								</View>
							)}
						</View>
					</>
				)}

				<View
					style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
				>
					<Text style={[s.cardTitle, { color: c.text }]}>
						{t("payments.seller_statusHolds")}
					</Text>
					<HoldsList holds={view.holds} />
				</View>
			</ScrollView>
		</ScreenColumn>
	);
}

export default function SellerPaymentsSetupScreen() {
	const { t } = useTranslation();
	return (
		<PaymentsShell title={t("payments.setup_title")}>
			{({ shopId }) => <SetupContent shopId={shopId} />}
		</PaymentsShell>
	);
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 16, gap: 12, paddingBottom: 32 },
	requirements: { gap: 4, marginTop: 8 },
	tagRow: { flexDirection: "row", marginTop: 8 },
	accountCard: {
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		gap: 2,
		marginTop: 8,
	},
	accountNumber: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
});
