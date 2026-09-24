import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { ApiError, api } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { formatCountdown, secondsUntil } from "@/src/lib/countdown";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

export interface PhoneStatus {
	isPhoneVerified: boolean;
	phone: string | null;
	pendingPhone: string | null;
	hasPendingVerification: boolean;
	resendAvailableAt: string | null;
}

export const phoneStatusKey = ["phone-verification-status"] as const;

const phoneSchema = z.object({
	phone: z.string().trim().min(8).max(20),
});
type PhoneFormValues = z.infer<typeof phoneSchema>;

const codeSchema = z.object({
	code: z.string().regex(/^\d{6}$/),
});
type CodeFormValues = z.infer<typeof codeSchema>;

const CODE_ERROR_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.phoneCodeInvalid,
	ERROR_CODES.phoneCodeExpired,
	ERROR_CODES.phoneTooManyAttempts,
]);

/**
 * The same OTP flow as the security screen, inline, because leaving the shop
 * form to verify a phone is where sellers drop off (P1PhoneGate mockup).
 */
export function PhoneGate({ onVerified }: { onVerified: () => void }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { refreshUser } = useAuth();
	const { showError } = useAlert();
	const [now, setNow] = useState(Date.now());
	const codeRef = useRef<TextInput>(null);

	const status = useQuery({
		queryKey: phoneStatusKey,
		queryFn: () => api.get<PhoneStatus>("/api/account/phone/status"),
	});

	const phoneForm = useForm<PhoneFormValues>({
		resolver: zodResolver(phoneSchema),
		defaultValues: { phone: "" },
	});
	const codeForm = useForm<CodeFormValues>({
		resolver: zodResolver(codeSchema),
		defaultValues: { code: "" },
	});

	const resetPhone = phoneForm.reset;
	useEffect(() => {
		resetPhone({
			phone: status.data?.pendingPhone ?? status.data?.phone ?? "",
		});
	}, [status.data?.pendingPhone, status.data?.phone, resetPhone]);

	// Re-renders once a second so `wait`, derived from the server's
	// resendAvailableAt, stays accurate — it recomputes from that absolute
	// timestamp each tick rather than counting down on its own, so background
	// time is never lost.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const start = useMutation({
		mutationFn: (phone: string) =>
			api.post("/api/account/phone/start", { phone }),
		onSuccess: async () => {
			await status.refetch();
			codeForm.reset({ code: "" });
			codeRef.current?.focus();
		},
		onError: (error) => {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.phoneInvalid
			) {
				phoneForm.setError("phone", {
					message: resolveErrorMessage(error, t),
				});
				return;
			}
			showError(t("shop.gateError"), resolveErrorMessage(error, t));
		},
	});

	const verify = useMutation({
		mutationFn: (code: string) =>
			api.post("/api/account/phone/verify", { code }),
		onSuccess: async () => {
			await refreshUser();
			onVerified();
		},
		onError: (error) => {
			if (error instanceof ApiError && CODE_ERROR_CODES.has(error.code)) {
				codeForm.setError("code", { message: resolveErrorMessage(error, t) });
				return;
			}
			showError(t("shop.gateError"), resolveErrorMessage(error, t));
		},
	});

	const pending = Boolean(status.data?.hasPendingVerification);
	const wait = secondsUntil(status.data?.resendAvailableAt ?? null, now);
	const busy = start.isPending || verify.isPending;
	const codeValue = codeForm.watch("code");

	const submitPhone = phoneForm.handleSubmit((values) =>
		start.mutate(values.phone),
	);
	const submitCode = codeForm.handleSubmit((values) =>
		verify.mutate(values.code),
	);

	return (
		<View style={styles.wrap}>
			<View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
				<Ionicons name="phone-portrait-outline" size={26} color={c.primary} />
			</View>
			<Text style={[styles.title, { color: c.text }]}>
				{t("shop.gateTitle")}
			</Text>
			<Text style={[styles.body, { color: c.muted }]}>
				{t("shop.gateBody")}
			</Text>

			<Text style={[styles.label, { color: c.body }]}>
				{t("shop.gatePhoneLabel")}
			</Text>
			<Controller
				control={phoneForm.control}
				name="phone"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						editable={!pending}
						keyboardType="phone-pad"
						placeholder="+237 6XX XXX XXX"
						placeholderTextColor={c.muted}
						accessibilityLabel={t("shop.gatePhoneLabel")}
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
			{phoneForm.formState.errors.phone ? (
				<Text style={[styles.hint, { color: c.danger }]}>
					{phoneForm.formState.errors.phone.message}
				</Text>
			) : null}

			{pending ? (
				<>
					<Text style={[styles.label, { color: c.body }]}>
						{t("shop.gateCodeLabel")}
					</Text>
					<Controller
						control={codeForm.control}
						name="code"
						render={({ field }) => (
							<TextInput
								ref={codeRef}
								value={field.value}
								onChangeText={(v) =>
									field.onChange(v.replace(/\D/g, "").slice(0, 6))
								}
								onBlur={field.onBlur}
								keyboardType="number-pad"
								textContentType="oneTimeCode"
								autoComplete="sms-otp"
								maxLength={6}
								placeholder="••••••"
								placeholderTextColor={c.muted}
								accessibilityLabel={t("shop.gateCodeLabel")}
								style={[
									styles.input,
									styles.code,
									{
										color: c.text,
										backgroundColor: c.input,
										borderColor: c.border,
									},
								]}
							/>
						)}
					/>
					{codeForm.formState.errors.code ? (
						<Text style={[styles.hint, { color: c.danger }]}>
							{codeForm.formState.errors.code.message}
						</Text>
					) : null}
					<View style={styles.links}>
						<Pressable
							disabled={wait > 0 || start.isPending}
							onPress={submitPhone}
							accessibilityRole="button"
							accessibilityLabel={
								wait > 0
									? t("shop.gateResendIn", { time: formatCountdown(wait) })
									: t("shop.gateResend")
							}
							hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
							style={styles.linkHit}
						>
							<Text
								style={[styles.link, { color: wait > 0 ? c.muted : c.primary }]}
							>
								{wait > 0
									? t("shop.gateResendIn", { time: formatCountdown(wait) })
									: t("shop.gateResend")}
							</Text>
						</Pressable>
					</View>
				</>
			) : null}

			<Text style={[styles.note, { color: c.muted }]}>
				{t("shop.gatePrivacy")}
			</Text>

			<Pressable
				onPress={pending ? submitCode : submitPhone}
				disabled={busy || (pending && codeValue.length !== 6)}
				accessibilityRole="button"
				accessibilityLabel={pending ? t("shop.gateVerify") : t("shop.gateSend")}
				style={[
					styles.button,
					{
						backgroundColor: c.primary,
						opacity: busy ? 0.7 : pending && codeValue.length !== 6 ? 0.5 : 1,
					},
				]}
			>
				{busy ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>
						{pending ? t("shop.gateVerify") : t("shop.gateSend")}
					</Text>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { padding: 20, gap: 10 },
	icon: {
		width: 52,
		height: 52,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 21 },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginTop: 8 },
	input: {
		height: 50,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	code: { letterSpacing: 12, fontSize: 22, textAlign: "center" },
	links: { flexDirection: "row", justifyContent: "space-between" },
	linkHit: { minHeight: 44, justifyContent: "center" },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	note: { fontSize: 12, fontFamily: Fonts.body, marginTop: 6 },
	hint: { fontSize: 12, fontFamily: Fonts.body },
	button: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 10,
	},
	buttonText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
