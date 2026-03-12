"use client";

import Link from "next/link";
import { useState } from "react";
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

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setIsLoading(true);

		try {
			const response = await fetch("/api/users/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
				credentials: "include",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(
					data.errors?.[0]?.message || data.message || "Request failed",
				);
			}

			setSuccess(true);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to send reset email",
			);
		} finally {
			setIsLoading(false);
		}
	}

	if (success) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
				<Card className="w-full max-w-md">
					<CardHeader className="space-y-1">
						<CardTitle className="text-2xl">Check your email</CardTitle>
						<CardDescription>
							If an account with that email exists, we&apos;ve sent a password
							reset link. Check your inbox and spam folder.
						</CardDescription>
					</CardHeader>
					<CardFooter>
						<Link href="/auth/login" className="w-full">
							<Button variant="outline" className="w-full">
								Back to sign in
							</Button>
						</Link>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl">Forgot password</CardTitle>
					<CardDescription>
						Enter your email address and we&apos;ll send you a link to reset
						your password.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col space-y-4">
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? "Sending..." : "Send reset link"}
						</Button>
						<p className="text-center text-muted-foreground text-sm">
							Remember your password?{" "}
							<Link href="/auth/login" className="text-primary hover:underline">
								Sign in
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
