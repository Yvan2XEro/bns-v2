"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { SocialAuthButtons } from "~/components/auth/social-auth-buttons";
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
import { useAuth } from "~/hooks/use-auth";

export default function RegisterPage() {
	const t = useTranslations("Auth");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { register } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const oauthError = searchParams.get("oauthError");

	useEffect(() => {
		if (oauthError) {
			setError(t("socialSignupFailed"));
		}
	}, [oauthError, t]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");

		if (password !== confirmPassword) {
			setError(t("passwordsDoNotMatch"));
			return;
		}

		if (password.length < 8) {
			setError(t("passwordMinLength"));
			return;
		}

		setIsLoading(true);

		try {
			await register(email, password, name);
			router.push("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : t("registrationFailed"));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-8">
			{/* Background */}
			<div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#1E40AF]">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-right-20 absolute top-20 h-72 w-72 animate-float rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div
					className="-left-20 absolute bottom-20 h-60 w-60 animate-float rounded-full bg-[#3B82F6]/20 blur-3xl"
					style={{ animationDelay: "1.5s" }}
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
					<CardTitle className="text-2xl">{t("createAccount")}</CardTitle>
					<CardDescription>{t("joinAndStartTrading")}</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						{error && (
							<div className="rounded-xl bg-red-50 p-3 text-red-600 text-sm">
								{error}
							</div>
						)}
						<SocialAuthButtons />
						<div className="space-y-2">
							<Label htmlFor="name" className="text-[#0F172A]">
								{t("name")}
							</Label>
							<Input
								id="name"
								type="text"
								placeholder="John Doe"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email" className="text-[#0F172A]">
								{t("email")}
							</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password" className="text-[#0F172A]">
								{t("password")}
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
								{t("confirmPassword")}
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
							{isLoading ? t("creatingAccount") : t("createAccountBtn")}
						</Button>
						<p className="text-center text-[#64748B] text-sm">
							{t("alreadyHaveAccount")}{" "}
							<Link
								href="/auth/login"
								className="font-medium text-[#1E40AF] hover:underline"
							>
								{t("signIn")}
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
