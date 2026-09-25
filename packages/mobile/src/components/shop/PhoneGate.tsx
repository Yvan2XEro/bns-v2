import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { ApiError, api } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { secondsUntil } from "@/src/lib/countdown";
import { useTranslation } from "@/src/lib/i18n";
import { CodeField } from "./phone-gate/CodeField";
import { PhoneNumberField } from "./phone-gate/PhoneNumberField";
import {
	CODE_ERROR_CODES,
	type CodeFormValues,
	codeSchema,
	type PhoneFormValues,
	phoneSchema,
} from "./phone-gate/schemas";
import { useShopTheme } from "./theme";

export interface PhoneStatus {
	isPhoneVerified: boolean;
	phone: string | null;
	pendingPhone: string | null;
	hasPendingVerification: boolean;
	resendAvailableAt: string | null;
}

export const phoneStatusKey = ["phone-verification-status"] as const;

/**
 * The same OTP flow as the security screen, inline, because leaving the shop
 * form to verify a phone is where sellers drop off (P1PhoneGate mockup).
 * Owns the two steps' state; `PhoneNumberField`/`CodeField` are pure fields.
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
				phoneForm.setError("phone", { message: resolveErrorMessage(error, t) });
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

			<PhoneNumberField
				control={phoneForm.control}
				error={phoneForm.formState.errors.phone}
				editable={!pending}
			/>

			{pending ? (
				<CodeField
					control={codeForm.control}
					error={codeForm.formState.errors.code}
					codeRef={codeRef}
					wait={wait}
					resendDisabled={start.isPending}
					onResend={submitPhone}
				/>
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
	note: { fontSize: 12, fontFamily: Fonts.body, marginTop: 6 },
	button: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 10,
	},
	buttonText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
