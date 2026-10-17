"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PhoneVerificationForm } from "~/components/shop/phone-verification/phone-verification-form";
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
import { safeReturnTo } from "~/lib/return-to";

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

	if (authLoading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-brand" />
			</div>
		);
	}

	if (!user) {
		return null;
	}

	const currentUser = user;

	/**
	 * Read from the URL at call time: useSearchParams would force a Suspense
	 * boundary on this client page for a single optional value.
	 */
	async function handlePhoneVerified() {
		await refreshUser();
		const returnTo = safeReturnTo(
			new URLSearchParams(window.location.search).get("returnTo"),
		);
		if (returnTo) router.push(returnTo);
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
				setPasswordError(t("currentPasswordIncorrect"));
				return;
			}

			const res = await fetch(`/api/users/${currentUser.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: newPassword }),
				credentials: "include",
			});

			if (!res.ok) {
				setPasswordError(t("passwordChangeFailed"));
				return;
			}

			setPasswordSuccess(t("passwordChanged"));
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch {
			setPasswordError(t("passwordChangeFailed"));
		} finally {
			setIsChangingPassword(false);
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
			<h1 className="mb-6 font-bold text-2xl text-ink">
				{t("accountSettings")}
			</h1>

			<div className="space-y-6">
				<Card className="border-line">
					<CardHeader>
						<CardTitle className="text-ink">{t("changePassword")}</CardTitle>
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
								className="rounded-xl bg-brand-fill hover:bg-brand-strong"
							>
								{isChangingPassword ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								{t("changePassword")}
							</Button>
						</form>
					</CardContent>
				</Card>

				<Card className="border-line">
					<CardHeader>
						<CardTitle className="text-ink">{t("emailAddress")}</CardTitle>
						<CardDescription>{t("emailDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-xl border border-line bg-canvas p-4">
							<p className="text-ink-muted text-sm">{t("currentEmail")}</p>
							<p className="mt-1 font-medium text-ink">{currentUser.email}</p>
						</div>
					</CardContent>
				</Card>

				<Card id="phone" className="border-line">
					<CardHeader>
						<CardTitle className="text-ink">{t("verifyPhoneNumber")}</CardTitle>
						<CardDescription>{t("verifyPhoneDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<PhoneVerificationForm
							showStatusSummary
							onVerified={() => void handlePhoneVerified()}
						/>
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
