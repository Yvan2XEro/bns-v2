import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { EmptyState } from "@/src/components/EmptyState";
import { HoldsList } from "@/src/components/payments/HoldsList";
import { PaymentsShell } from "@/src/components/payments/PaymentsShell";
import { PayoutAccountForm } from "@/src/components/payments/PayoutAccountForm";
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
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import {
	CONNECTED_ACCOUNT_STATUSES,
	PAYOUT_ACCOUNT_STATUSES,
	PAYOUT_METHODS,
} from "@/src/lib/paymentStatus";
import { notMeAccountId } from "@/src/lib/sellerPayments";
import type { PaymentSetupView } from "@/src/types/order";

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
	const { showError } = useAlert();
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

	// No success toast: the saved account's own row re-renders from the
	// invalidated query, same as billing's invoice list after a payment.
	const onSaveAccount = (input: SubmitPayoutAccountInput) =>
		submitAccount.mutate(input, {
			onError: (error) =>
				showError(
					t("payments.setup_saveFailed"),
					resolveErrorMessage(error, t),
				),
		});

	if (setup.isPending) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
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
				title={t("seller.suspendedIndefinitely")}
				subtitle={t("apiErrors.shop.inactive")}
			/>
		);
	}

	const cooldownActive =
		view.changeCooldownUntil !== null &&
		Date.parse(view.changeCooldownUntil) > Date.now();

	return (
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
						style={[s.button, { backgroundColor: c.primary, marginTop: 10 }]}
					>
						<Text style={s.buttonText}>{t("payments.setup_step1Action")}</Text>
					</Pressable>
				</View>
			) : (
				<>
					<View
						style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
					>
						<Text style={[s.cardTitle, { color: c.text }]}>
							{t("payments.setup_step2Title")}
						</Text>
						<Text style={[s.body, { color: c.body }]}>
							{t("payments.setup_step2Body")}
						</Text>
						<Text style={[s.meta, { color: c.muted, marginTop: 8 }]}>
							{view.connectedAccount
								? t(CONNECTED_ACCOUNT_STATUSES[view.connectedAccount.status])
								: t("payments.accountStatus_created")}
						</Text>
						{view.connectedAccount &&
						view.connectedAccount.requirementsDue.length > 0 ? (
							<View style={styles.requirements}>
								<Text style={[s.meta, { color: c.warningText }]}>
									{t("payments.setup_requirementsDue")}
								</Text>
								{view.connectedAccount.requirementsDue.map((req) => (
									<Text key={req} style={[s.meta, { color: c.muted }]}>
										{"• "}
										{req}
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
							style={[s.button, { backgroundColor: c.primary, marginTop: 10 }]}
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
						style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
					>
						<Text style={[s.cardTitle, { color: c.text }]}>
							{t("payments.setup_step3Title")}
						</Text>
						{view.payoutAccount ? (
							<View style={styles.requirements}>
								<Text style={[s.meta, { color: c.muted }]}>
									{t(PAYOUT_METHODS[view.payoutAccount.method])} ·{" "}
									{view.payoutAccount.accountNumberMasked}
								</Text>
								<Text style={[s.meta, { color: c.muted }]}>
									{t(PAYOUT_ACCOUNT_STATUSES[view.payoutAccount.status])}
								</Text>
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
	requirements: { gap: 4, marginTop: 4 },
});
