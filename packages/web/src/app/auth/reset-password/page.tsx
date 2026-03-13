"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export default function ResetPasswordPage() {
	return (
		<Suspense>
			<ResetPasswordForm />
		</Suspense>
	);
}

function ResetPasswordForm() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const token = searchParams.get("token");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	if (!token) {
		return (
			<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4">
				<div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#1E40AF]">
					<div className="-left-20 absolute top-20 h-72 w-72 animate-float rounded-full bg-[#3B82F6]/20 blur-3xl" />
					<div
						className="-right-20 absolute bottom-20 h-60 w-60 animate-float rounded-full bg-[#F59E0B]/15 blur-3xl"
						style={{ animationDelay: "1s" }}
					/>
				</div>
				<Card className="relative w-full max-w-md border-white/10 bg-white shadow-2xl">
					<CardHeader className="space-y-1 text-center">
						<Link
							href="/"
							className="mx-auto mb-2 inline-flex items-center gap-2"
						>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E40AF] to-[#F59E0B] shadow-md">
								<span className="font-bold text-sm text-white">B</span>
							</div>
						</Link>
						<CardTitle className="text-2xl">Invalid link</CardTitle>
						<CardDescription>
							This password reset link is invalid or has expired.
						</CardDescription>
					</CardHeader>
					<CardFooter>
						<Link href="/auth/forgot-password" className="w-full">
							<Button variant="outline" className="w-full rounded-xl">
								Request a new link
							</Button>
						</Link>
					</CardFooter>
				</Card>
			</div>
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}

		setIsLoading(true);

		try {
			const response = await fetch("/api/users/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, password }),
				credentials: "include",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(
					data.errors?.[0]?.message ||
						data.message ||
						"Failed to reset password",
				);
			}

			router.push("/auth/login?reset=success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to reset password");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4">
			<div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#1E40AF]">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-20 h-72 w-72 animate-float rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div
					className="-right-20 absolute bottom-20 h-60 w-60 animate-float rounded-full bg-[#F59E0B]/15 blur-3xl"
					style={{ animationDelay: "1s" }}
				/>
			</div>

			<Card className="relative w-full max-w-md border-white/10 bg-white shadow-2xl">
				<CardHeader className="space-y-1 text-center">
					<Link
						href="/"
						className="mx-auto mb-2 inline-flex items-center gap-2"
					>
						<Image
							src="/logo.png"
							alt="Buy'N'Sellem"
							width={40}
							height={40}
							className="h-10 w-10 object-contain"
						/>
					</Link>
					<CardTitle className="text-2xl">Reset password</CardTitle>
					<CardDescription>Enter your new password below.</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						{error && (
							<div className="rounded-xl bg-red-50 p-3 text-red-600 text-sm">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="password" className="text-[#0F172A]">
								New Password
							</Label>
							<Input
								id="password"
								type="password"
								placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirmPassword" className="text-[#0F172A]">
								Confirm New Password
							</Label>
							<Input
								id="confirmPassword"
								type="password"
								placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								required
							/>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col space-y-4">
						<Button
							type="submit"
							className="w-full rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#2563EB] font-medium shadow-blue-500/20 shadow-md"
							disabled={isLoading}
						>
							{isLoading ? "Resetting..." : "Reset password"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
