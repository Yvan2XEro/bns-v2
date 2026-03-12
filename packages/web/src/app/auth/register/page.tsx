"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useAuth } from "~/hooks/use-auth";

export default function RegisterPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { register } = useAuth();
	const router = useRouter();

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
			await register(email, password, name);
			router.push("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Registration failed");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
			{/* Background */}
			<div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#1E40AF]">
				<div className="absolute inset-0 pattern-dots-light" />
				<div className="absolute inset-0 pattern-diagonal" />
				<div className="absolute -right-20 top-20 h-72 w-72 animate-float rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="absolute -left-20 bottom-20 h-60 w-60 animate-float rounded-full bg-[#3B82F6]/20 blur-3xl" style={{ animationDelay: "1.5s" }} />
			</div>

			<Card className="relative w-full max-w-md border-white/10 bg-white shadow-2xl">
				<CardHeader className="space-y-1 text-center">
					<Link href="/" className="mx-auto mb-2 inline-flex items-center gap-2">
						<Image src="/logo.png" alt="Buy'N'Sellem" width={40} height={40} className="h-10 w-10 object-contain" />
					</Link>
					<CardTitle className="text-2xl">Create an account</CardTitle>
					<CardDescription>
						Join Buy&apos;N&apos;Sellem and start trading locally
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						{error && (
							<div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="name" className="text-[#0F172A]">Name</Label>
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
							<Label htmlFor="email" className="text-[#0F172A]">Email</Label>
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
							<Label htmlFor="password" className="text-[#0F172A]">Password</Label>
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
							<Label htmlFor="confirmPassword" className="text-[#0F172A]">Confirm Password</Label>
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
							className="w-full rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#2563EB] font-medium shadow-md shadow-blue-500/20"
							disabled={isLoading}
						>
							{isLoading ? "Creating account..." : "Create account"}
						</Button>
						<p className="text-center text-sm text-[#64748B]">
							Already have an account?{" "}
							<Link href="/auth/login" className="font-medium text-[#1E40AF] hover:underline">
								Sign in
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
