import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { PhoneGate } from "@/src/components/shop/PhoneGate";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useAcceptInvitation,
	useDeclineInvitation,
	useInvitation,
} from "@/src/hooks/useInvitation";
import { shopKeys } from "@/src/hooks/useShops";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	accountHint,
	type InviteViewer,
	inviteStep,
} from "@/src/lib/inviteFlow";

/** The caller's identity as `inviteStep` needs it; `phoneVerifiedAt` only ever
 * has to be truthy or not, so a boolean-backed marker is enough — mobile's
 * `UserDoc` tracks verification as a flag, not a timestamp. */
function toViewer(
	user: {
		email?: string | null;
		phone?: string | null;
		phoneVerified?: boolean;
	} | null,
): InviteViewer | null {
	if (!user) return null;
	return {
		email: user.email ?? null,
		phone: user.phone ?? null,
		phoneVerifiedAt: user.phoneVerified ? "verified" : null,
	};
}

export default function InviteScreen() {
	const { token } = useLocalSearchParams<{ token: string }>();
	const pathname = usePathname();
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";
	const { user, logout, refreshUser } = useAuth();
	const { showError } = useAlert();
	const queryClient = useQueryClient();

	const [acceptErrorCode, setAcceptErrorCode] = useState<string | null>(null);
	const [joined, setJoined] = useState(false);

	const invitationQuery = useInvitation(token);
	const acceptMutation = useAcceptInvitation();
	const declineMutation = useDeclineInvitation();

	const invitation = invitationQuery.data ?? null;
	const queryErrorCode =
		invitationQuery.error instanceof ApiError
			? invitationQuery.error.code
			: invitationQuery.isError
				? ERROR_CODES.unknown
				: null;

	const step = inviteStep({
		invitation,
		error: acceptErrorCode ?? queryErrorCode,
		viewer: toViewer(user),
		joined,
	});

	const goHome = () => router.replace("/(tabs)/home");
	const goSignIn = () =>
		router.push({
			pathname: "/auth/login",
			params: getAuthModalParams(pathname),
		});
	const goRegister = () =>
		router.push({
			pathname: "/auth/register",
			params: getAuthModalParams(pathname),
		});
	// `/seller` is missing from the locally generated route types (same gap
	// `useCreateShopForm.ts` and `shop/create.tsx` already work around), so the
	// cast mirrors the rest of the codebase rather than adding a new pattern.
	const goSeller = () => router.replace("/seller" as never);

	const onAccept = () => {
		if (!token) return;
		acceptMutation.mutate(token, {
			onSuccess: () => {
				setJoined(true);
				goSeller();
			},
			onError: (error) => {
				// The server re-checks the identity match on accept even though the
				// screen only offers "Join" once this client already believes it
				// matches — a verified number or an unverified domain can both have
				// changed since the invitation was looked up.
				if (
					error instanceof ApiError &&
					error.code === ERROR_CODES.teamInvitationMismatch
				) {
					setAcceptErrorCode(error.code);
					return;
				}
				// The token may simply have gone stale since the screen loaded (used,
				// revoked, expired elsewhere): refetching shows the real status
				// instead of a banner that never clears.
				if (
					error instanceof ApiError &&
					error.code === ERROR_CODES.teamInvitationInvalid &&
					token
				) {
					void queryClient.invalidateQueries({
						queryKey: shopKeys.invitation(token),
					});
				}
				showError(t("invite.title"), resolveErrorMessage(error, t));
			},
		});
	};

	const onDecline = () => {
		if (!token) return;
		declineMutation.mutate(token, {
			onSuccess: goHome,
			onError: (error) =>
				showError(t("invite.title"), resolveErrorMessage(error, t)),
		});
	};

	const onSwitchAccount = async () => {
		await logout();
		goSignIn();
	};

	if (step === "loading") {
		return (
			<View style={[styles.center, { backgroundColor: c.bg }]}>
				<ActivityIndicator color={c.primary} />
			</View>
		);
	}

	if (step === "invalid" || step === "expired" || step === "responded") {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("invite.title")} onBack={goHome} />
				<EmptyState
					illustration="notFound"
					title={t(`invite.${step}`)}
					ctaLabel={t("invite.backHome")}
					onCta={goHome}
				/>
			</SafeAreaView>
		);
	}

	if (!invitation) return null;
	const hint = accountHint(invitation);
	const roleKey = invitation.role === "manager" ? "roleManager" : "roleStaff";
	const roleDescriptionKey =
		invitation.role === "manager"
			? "roleManagerDescription"
			: "roleStaffDescription";
	const expiresOn = formatDate(
		invitation.expiresAt,
		{ day: "numeric", month: "long", year: "numeric" },
		locale,
	);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("invite.title")} onBack={goHome} />
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.summary}>
					<ShopAvatar
						name={invitation.shop.name}
						logo={invitation.shop.logoUrl}
						size={64}
						radius={16}
					/>
					<Text style={[styles.shopName, { color: c.text }]}>
						{invitation.shop.name}
					</Text>
					<Text style={[styles.handle, { color: c.muted }]}>
						@{invitation.shop.handle}
					</Text>
					<LevelBadge badge={invitation.shop.badge} />

					{invitation.inviterFirstName ? (
						<Text style={[styles.body, { color: c.body }]}>
							{t("invite.invitedBy", { name: invitation.inviterFirstName })}
						</Text>
					) : null}

					<View style={[styles.roleCard, { backgroundColor: c.neutralSoft }]}>
						<Text style={[styles.roleTitle, { color: c.text }]}>
							{t(`invite.${roleKey}`)}
						</Text>
						<Text style={[styles.roleBody, { color: c.muted }]}>
							{t(`invite.${roleDescriptionKey}`)}
						</Text>
					</View>

					{expiresOn ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("invite.expires", { date: expiresOn })}
						</Text>
					) : null}
				</View>

				{step === "signIn" ? (
					<View style={styles.actions}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.signIn")}
							onPress={goSignIn}
							style={[styles.primaryButton, { backgroundColor: c.primary }]}
						>
							<Text style={styles.primaryLabel}>
								{t("invite.signIn", { shop: invitation.shop.name })}
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.register")}
							onPress={goRegister}
							style={styles.linkButton}
						>
							<Text style={[styles.linkLabel, { color: c.primary }]}>
								{t("invite.register")}
							</Text>
						</Pressable>
					</View>
				) : null}

				{step === "verifyPhone" ? (
					<View style={styles.actions}>
						<Text style={[styles.body, { color: c.body }]}>
							{t("invite.verifyPhoneHint", { target: hint.maskedTarget })}
						</Text>
						{/* Same inline OTP flow as the security screen (see PhoneGate): it
						    already prefills the number on file, and staying on this
						    screen avoids a redirect the invitee would have to find their
						    way back from. */}
						<PhoneGate onVerified={() => void refreshUser()} />
					</View>
				) : null}

				{step === "mismatch" ? (
					<View style={styles.actions}>
						<Text style={[styles.body, { color: c.body }]}>
							{t("invite.mismatch", { target: hint.maskedTarget })}
						</Text>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.switchAccount")}
							onPress={() => {
								void onSwitchAccount();
							}}
							style={[styles.primaryButton, { backgroundColor: c.primary }]}
						>
							<Text style={styles.primaryLabel}>
								{t("invite.switchAccount")}
							</Text>
						</Pressable>
					</View>
				) : null}

				{step === "ready" ? (
					<View style={styles.actions}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.join", {
								shop: invitation.shop.name,
							})}
							onPress={onAccept}
							disabled={acceptMutation.isPending}
							style={[
								styles.primaryButton,
								{
									backgroundColor: c.primary,
									opacity: acceptMutation.isPending ? 0.7 : 1,
								},
							]}
						>
							{acceptMutation.isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.primaryLabel}>
									{t("invite.join", { shop: invitation.shop.name })}
								</Text>
							)}
						</Pressable>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.decline")}
							onPress={onDecline}
							disabled={declineMutation.isPending}
							style={styles.linkButton}
						>
							<Text style={[styles.linkLabel, { color: c.danger }]}>
								{t("invite.decline")}
							</Text>
						</Pressable>
					</View>
				) : null}

				{step === "joined" ? (
					<View style={styles.actions}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("invite.joinedCta")}
							onPress={goSeller}
							style={[styles.primaryButton, { backgroundColor: c.primary }]}
						>
							<Text style={styles.primaryLabel}>{t("invite.joined")}</Text>
						</Pressable>
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	content: { padding: 20, gap: 20 },
	summary: { alignItems: "center", gap: 6 },
	shopName: { fontSize: 20, fontFamily: Fonts.displayExtrabold, marginTop: 8 },
	handle: { fontSize: 13, fontFamily: Fonts.body },
	body: { fontSize: 14, fontFamily: Fonts.body, textAlign: "center" },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	roleCard: {
		width: "100%",
		borderRadius: 14,
		padding: 14,
		gap: 4,
		marginTop: 8,
	},
	roleTitle: { fontSize: 15, fontFamily: Fonts.displayBold },
	roleBody: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	actions: { gap: 12 },
	primaryButton: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryLabel: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
	linkButton: { alignItems: "center", padding: 8 },
	linkLabel: { fontSize: 14, fontFamily: Fonts.displaySemibold },
});
