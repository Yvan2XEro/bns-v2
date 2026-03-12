"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function SettingsPage() {
	const { user, isLoading: authLoading, logout } = useAuth();
	const router = useRouter();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState("");
	const [passwordSuccess, setPasswordSuccess] = useState("");
	const [isChangingPassword, setIsChangingPassword] = useState(false);

	const [newEmail, setNewEmail] = useState("");
	const [emailPassword, setEmailPassword] = useState("");
	const [emailError, setEmailError] = useState("");
	const [emailSuccess, setEmailSuccess] = useState("");
	const [isChangingEmail, setIsChangingEmail] = useState(false);

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

	async function handleChangePassword(e: React.FormEvent) {
		e.preventDefault();
		setPasswordError("");
		setPasswordSuccess("");

		if (newPassword !== confirmPassword) {
			setPasswordError("Passwords do not match");
			return;
		}

		if (newPassword.length < 8) {
			setPasswordError("Password must be at least 8 characters");
			return;
		}

		setIsChangingPassword(true);

		try {
			const loginRes = await fetch("/api/users/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: user?.email, password: currentPassword }),
				credentials: "include",
			});

			if (!loginRes.ok) {
				throw new Error("Current password is incorrect");
			}

			const res = await fetch(`/api/users/${user?.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: newPassword }),
				credentials: "include",
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(
					data.errors?.[0]?.message || "Failed to change password",
				);
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

	async function handleChangeEmail(e: React.FormEvent) {
		e.preventDefault();
		setEmailError("");
		setEmailSuccess("");
		setIsChangingEmail(true);

		try {
			const loginRes = await fetch("/api/users/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: user?.email,
					password: emailPassword,
				}),
				credentials: "include",
			});

			if (!loginRes.ok) {
				throw new Error("Password is incorrect");
			}

			const res = await fetch(`/api/users/${user?.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: newEmail }),
				credentials: "include",
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.errors?.[0]?.message || "Failed to change email");
			}

			setEmailSuccess("Email changed successfully");
			setNewEmail("");
			setEmailPassword("");
		} catch (err) {
			setEmailError(
				err instanceof Error ? err.message : "Failed to change email",
			);
		} finally {
			setIsChangingEmail(false);
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
			const res = await fetch(`/api/users/${user?.id}`, {
				method: "DELETE",
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error("Failed to delete account");
			}

			await logout();
			router.push("/");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete account");
		}
	}

	return (
		<div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 font-bold text-2xl text-[#0F172A]">
				Account Settings
			</h1>

			<div className="space-y-6">
				<Card className="border-[#E2E8F0]">
					<CardHeader>
						<CardTitle className="text-[#0F172A]">Change Password</CardTitle>
						<CardDescription>
							Update your password to keep your account secure.
						</CardDescription>
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
								<Label htmlFor="currentPassword">Current Password</Label>
								<Input
									id="currentPassword"
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="newPassword">New Password</Label>
								<Input
									id="newPassword"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="confirmNewPassword">Confirm New Password</Label>
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
								Change Password
							</Button>
						</form>
					</CardContent>
				</Card>

				<Card className="border-[#E2E8F0]">
					<CardHeader>
						<CardTitle className="text-[#0F172A]">Change Email</CardTitle>
						<CardDescription>
							Update the email address associated with your account. Current
							email: {user.email}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleChangeEmail} className="space-y-4">
							{emailError && (
								<div className="rounded-xl bg-red-50 p-3 text-red-600 text-sm">
									{emailError}
								</div>
							)}
							{emailSuccess && (
								<div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 text-sm">
									{emailSuccess}
								</div>
							)}
							<div className="space-y-2">
								<Label htmlFor="newEmail">New Email</Label>
								<Input
									id="newEmail"
									type="email"
									placeholder="newemail@example.com"
									value={newEmail}
									onChange={(e) => setNewEmail(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="emailPassword">
									Confirm with your password
								</Label>
								<Input
									id="emailPassword"
									type="password"
									value={emailPassword}
									onChange={(e) => setEmailPassword(e.target.value)}
									required
								/>
							</div>
							<Button
								type="submit"
								disabled={isChangingEmail}
								className="rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]"
							>
								{isChangingEmail ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								Change Email
							</Button>
						</form>
					</CardContent>
				</Card>

				<div className="border-[#E2E8F0] border-t" />

				<Card className="border-red-200">
					<CardHeader>
						<CardTitle className="text-red-600">Danger Zone</CardTitle>
						<CardDescription>
							Permanently delete your account and all associated data.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							variant="destructive"
							onClick={handleDeleteAccount}
							className="rounded-xl"
						>
							Delete Account
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
