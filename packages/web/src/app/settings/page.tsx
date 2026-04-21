"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/hooks/use-auth";

interface PhoneVerificationStatus {
	expiresAt: null | string;
	hasPendingVerification: boolean;
	isPhoneVerified: boolean;
	pendingPhone: null | string;
	phone: null | string;
	phoneVerifiedAt: null | string;
	resendAvailableAt: null | string;
}

async function getErrorMessage(response: Response): Promise<string> {
	const data = await response.json().catch(() => ({}));
	return data.message || data.errors?.[0]?.message || "Request failed";
}

export default function SettingsPage() {
	const t = useTranslations("Settings");
	const { user, isLoading: authLoading, logout, refreshUser } = useAuth();
	const router = useRouter();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState("");
	const [passwordSuccess, setPasswordSuccess] = useState("");
	const [isChangingPassword, setIsChangingPassword] = useState(false);

	const [phoneStatus, setPhoneStatus] =
		useState<null | PhoneVerificationStatus>(null);
	const [phoneInput, setPhoneInput] = useState("");
	const [otpCode, setOtpCode] = useState("");
	const [phoneError, setPhoneError] = useState("");
	const [phoneSuccess, setPhoneSuccess] = useState("");
	const [isLoadingPhoneStatus, setIsLoadingPhoneStatus] = useState(false);
	const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
	const [isVerifyingPhoneCode, setIsVerifyingPhoneCode] = useState(false);

	useEffect(() => {
		if (!user) {
			return;
		}

		let isMounted = true;

		async function loadPhoneStatus() {
			setIsLoadingPhoneStatus(true);

			try {
				const res = await fetch("/api/account/phone/status", {
					credentials: "include",
				});

				if (!res.ok) {
					throw new Error(await getErrorMessage(res));
				}

				const data = (await res.json()) as PhoneVerificationStatus;
				if (!isMounted) {
					return;
				}

				setPhoneStatus(data);
				setPhoneInput(data.pendingPhone || data.phone || "");
			} catch (err) {
				if (!isMounted) {
					return;
				}

				setPhoneError(
					err instanceof Error
						? err.message
						: "Failed to load phone verification status",
				);
			} finally {
				if (isMounted) {
					setIsLoadingPhoneStatus(false);
				}
			}
		}

		void loadPhoneStatus();

		return () => {
			isMounted = false;
		};
	}, [user]);

	if (authLoading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-[#1E40AF]" />
			</div>
		);
	}

	if (!user) {
		return null;
	}

	const currentUser = user;

	async function refreshPhoneStatus() {
		const res = await fetch("/api/account/phone/status", {
			credentials: "include",
		});

		if (!res.ok) {
			throw new Error(await getErrorMessage(res));
		}

		const data = (await res.json()) as PhoneVerificationStatus;
		setPhoneStatus(data);
		setPhoneInput(data.pendingPhone || data.phone || "");
	}

	async function handleChangePassword(e: React.FormEvent) {
		e.preventDefault();
		setPasswordError("");
		setPasswordSuccess("");

		if (newPassword !== confirmPassword) {
			setPasswordError(t("passwordsDoNotMatch"));
			return;
		}

		if (newPassword.length < 8) {
			setPasswordError(t("passwordMinLength"));
			return;
		}

		setIsChangingPassword(true);

		try {
			const loginRes = await fetch("/api/users/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: currentUser.email,
					password: currentPassword,
				}),
				credentials: "include",
			});

			if (!loginRes.ok) {
				throw new Error(t("currentPasswordIncorrect"));
			}

			setPasswordSuccess(t("passwordChanged"));

			const res = await fetch(`/api/users/${currentUser.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: newPassword }),
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error(await getErrorMessage(res));
			}

			setPasswordSuccess("Password changed successfully");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			setPasswordError(
				err instanceof Error ? err.message : "Failed to change password",
			);
		} finally {
			setIsChangingPassword(false);
		}
	}

	async function handleSendPhoneCode(e: React.FormEvent) {
		e.preventDefault();
		setPhoneError("");
		setPhoneSuccess("");
		setIsSendingPhoneCode(true);

		try {
			const res = await fetch("/api/account/phone/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phone: phoneInput }),
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error(await getErrorMessage(res));
			}

			await refreshPhoneStatus();
			setOtpCode("");
			setPhoneSuccess("Verification code sent to your phone");
		} catch (err) {
			setPhoneError(
				err instanceof Error ? err.message : "Failed to send verification code",
			);
		} finally {
			setIsSendingPhoneCode(false);
		}
	}

	async function handleVerifyPhoneCode(e: React.FormEvent) {
		e.preventDefault();
		setPhoneError("");
		setPhoneSuccess("");
		setIsVerifyingPhoneCode(true);

		try {
			const res = await fetch("/api/account/phone/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: otpCode }),
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error(await getErrorMessage(res));
			}

			await refreshPhoneStatus();
			await refreshUser();
			setOtpCode("");
			setPhoneSuccess("Phone number verified successfully");
		} catch (err) {
			setPhoneError(
				err instanceof Error ? err.message : "Failed to verify phone number",
			);
		} finally {
			setIsVerifyingPhoneCode(false);
		}
	}

	async function handleDeleteAccount() {
		const confirmed = window.confirm(
			"Are you sure you want to delete your account? This action cannot be undone.",
		);

		if (!confirmed) return;

		const doubleConfirm = window.confirm(
			"This will permanently delete your account and all your data. Continue?",
		);

		if (!doubleConfirm) return;

		try {
			const res = await fetch(`/api/users/${currentUser.id}`, {
				method: "DELETE",
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error(t("failedToDeleteAccount"));
			}

			await logout();
			router.push("/");
		} catch (err) {
			alert(err instanceof Error ? err.message : t("failedToDeleteAccount"));
		}
	}

	return (
		<div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 font-bold text-2xl text-[#0F172A]">
				{t("accountSettings")}
			</h1>

			<div className="space-y-6">
				<Card className="border-[#E2E8F0]">
					<CardHeader>
						<CardTitle className="text-[#0F172A]">
							{t("changePassword")}
						</CardTitle>
						<CardDescription>{t("changePasswordDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleChangePassword} className="space-y-4">
							{passwordError && (
								<div className="rounded-xl bg-red-50 p-3 text-red-600 text-sm">
									{passwordError}
								</div>
							)}
							{passwordSuccess && (
								<div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 text-sm">
									{passwordSuccess}
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="currentPassword">{t("currentPassword")}</Label>
								<Input
									id="currentPassword"
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="newPassword">{t("newPassword")}</Label>
								<Input
									id="newPassword"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="confirmNewPassword">
									{t("confirmNewPassword")}
								</Label>
								<Input
									id="confirmNewPassword"
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									required
								/>
							</div>
							<Button
								type="submit"
								disabled={isChangingPassword}
								className="rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]"
							>
								{isChangingPassword ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{t("changePassword")}
							</Button>
						</form>
					</CardContent>
				</Card>

				<Card className="border-[#E2E8F0]">
					<CardHeader>
						<CardTitle className="text-[#0F172A]">
							{t("emailAddress")}
						</CardTitle>
						<CardDescription>{t("emailDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
							<p className="text-[#64748B] text-sm">{t("currentEmail")}</p>
							<p className="mt-1 font-medium text-[#0F172A]">
								{currentUser.email}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="border-[#E2E8F0]">
					<CardHeader>
						<CardTitle className="text-[#0F172A]">
							{t("verifyPhoneNumber")}
						</CardTitle>
						<CardDescription>{t("verifyPhoneDesc")}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<form onSubmit={handleSendPhoneCode} className="space-y-4">
							{phoneError && (
								<div className="rounded-xl bg-red-50 p-3 text-red-600 text-sm">
									{phoneError}
								</div>
							)}
							{phoneSuccess && (
								<div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 text-sm">
									{phoneSuccess}
								</div>
							)}
							{phoneStatus?.phone && (
								<div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
									<p className="text-[#64748B] text-sm">{t("currentPhone")}</p>
									<p className="mt-1 font-medium text-[#0F172A]">
										{phoneStatus.phone}
									</p>
									<p className="mt-1 text-[#64748B] text-xs">
										{phoneStatus.isPhoneVerified
											? t("verified")
											: t("notVerifiedYet")}
									</p>
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="phoneNumber">{t("phoneNumber")}</Label>
								<Input
									id="phoneNumber"
									type="tel"
									placeholder="+2376XXXXXXXX"
									value={phoneInput}
									onChange={(e) => setPhoneInput(e.target.value)}
									required
								/>
							</div>
							<Button
								type="submit"
								disabled={isSendingPhoneCode || isLoadingPhoneStatus}
								className="rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]"
							>
								{isSendingPhoneCode ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{phoneStatus?.hasPendingVerification
									? t("resendVerificationCode")
									: t("sendVerificationCode")}
							</Button>
						</form>

						{phoneStatus?.hasPendingVerification && (
							<form onSubmit={handleVerifyPhoneCode} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="otpCode">{t("verificationCode")}</Label>
									<Input
										id="otpCode"
										inputMode="numeric"
										maxLength={6}
										placeholder="123456"
										value={otpCode}
										onChange={(e) => setOtpCode(e.target.value)}
										required
									/>
								</div>
								<Button
									type="submit"
									disabled={isVerifyingPhoneCode}
									className="rounded-xl bg-[#0F172A] hover:bg-[#1E293B]"
								>
									{isVerifyingPhoneCode ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : null}
									{t("verifyPhoneNumberBtn")}
								</Button>
							</form>
						)}
					</CardContent>
				</Card>

				<Card className="border-red-200">
					<CardHeader>
						<CardTitle className="text-red-600">{t("dangerZone")}</CardTitle>
						<CardDescription>{t("deleteAccountDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							variant="destructive"
							onClick={handleDeleteAccount}
							className="rounded-xl"
						>
							{t("deleteAccount")}
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
