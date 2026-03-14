"use client";

import {
	Clock,
	Loader2,
	Mail,
	MapPin,
	MessageCircle,
	Phone,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";

const contactInfo = [
	{
		icon: Mail,
		label: "Email",
		value: "support@buynsellem.com",
		href: "mailto:support@buynsellem.com",
	},
	{
		icon: Phone,
		label: "Phone",
		value: "+237 652 761 931",
		href: "tel:+237652761931",
	},
	{
		icon: MapPin,
		label: "Location",
		value: "Douala, Cameroon",
		href: null,
	},
	{
		icon: Clock,
		label: "Hours",
		value: "Mon-Fri, 8AM - 6PM WAT",
		href: null,
	},
];

export default function ContactPage() {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		subject: "",
		message: "",
	});
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		try {
			const res = await fetch("/api/public/contact", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});

			const data = await res.json();

			if (!res.ok) {
				setError(data.error || "Something went wrong. Please try again.");
				return;
			}

			setSuccess(true);
			setFormData({ name: "", email: "", subject: "", message: "" });
		} catch {
			setError("Could not send your message. Please try again later.");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Hero */}
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<MessageCircle className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">Contact Us</h1>
					<p className="mt-2 text-blue-100">
						Have a question or need help? We&apos;d love to hear from you.
					</p>
				</div>
			</section>

			<div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="grid gap-8 lg:grid-cols-5">
					{/* Contact info */}
					<div className="space-y-4 lg:col-span-2">
						<h2 className="font-bold text-[#0F172A] text-lg">Get in touch</h2>
						<p className="text-[#64748B] text-sm leading-relaxed">
							Our support team typically responds within 24 hours during
							business days.
						</p>
						<div className="space-y-3 pt-2">
							{contactInfo.map((info) => (
								<div key={info.label} className="flex items-start gap-3">
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E40AF]">
										<info.icon className="h-4 w-4" />
									</div>
									<div>
										<p className="font-medium text-[#94A3B8] text-xs">
											{info.label}
										</p>
										{info.href ? (
											<a
												href={info.href}
												className="font-medium text-[#0F172A] text-sm hover:text-[#1E40AF]"
											>
												{info.value}
											</a>
										) : (
											<p className="font-medium text-[#0F172A] text-sm">
												{info.value}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Contact form */}
					<div className="lg:col-span-3">
						<div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
							{success ? (
								<div className="py-8 text-center">
									<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
										<MessageCircle className="h-6 w-6 text-emerald-600" />
									</div>
									<h3 className="font-bold text-[#0F172A] text-lg">
										Message sent!
									</h3>
									<p className="mt-1 text-[#64748B] text-sm">
										We&apos;ll get back to you as soon as possible.
									</p>
									<Button
										onClick={() => setSuccess(false)}
										variant="outline"
										className="mt-4 rounded-xl"
									>
										Send another message
									</Button>
								</div>
							) : (
								<form onSubmit={handleSubmit} className="space-y-4">
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<Label htmlFor="name">Name</Label>
											<Input
												id="name"
												placeholder="Your name"
												value={formData.name}
												onChange={(e) =>
													setFormData((p) => ({ ...p, name: e.target.value }))
												}
												required
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="email">Email</Label>
											<Input
												id="email"
												type="email"
												placeholder="you@example.com"
												value={formData.email}
												onChange={(e) =>
													setFormData((p) => ({ ...p, email: e.target.value }))
												}
												required
											/>
										</div>
									</div>
									<div className="space-y-2">
										<Label htmlFor="subject">Subject</Label>
										<Select
											value={formData.subject}
											onValueChange={(v) =>
												setFormData((p) => ({ ...p, subject: v }))
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="What is this about?" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="general">
													General question
												</SelectItem>
												<SelectItem value="account">Account issue</SelectItem>
												<SelectItem value="listing">Listing problem</SelectItem>
												<SelectItem value="payment">
													Payment & billing
												</SelectItem>
												<SelectItem value="report">
													Report a user/scam
												</SelectItem>
												<SelectItem value="bug">Bug report</SelectItem>
												<SelectItem value="feature">Feature request</SelectItem>
												<SelectItem value="other">Other</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor="message">Message</Label>
										<Textarea
											id="message"
											placeholder="Describe your issue or question in detail..."
											rows={5}
											value={formData.message}
											onChange={(e) =>
												setFormData((p) => ({ ...p, message: e.target.value }))
											}
											required
										/>
									</div>
									{error && (
										<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
											{error}
										</div>
									)}
									<Button
										type="submit"
										disabled={isLoading}
										className="w-full rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]"
									>
										{isLoading ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Mail className="mr-2 h-4 w-4" />
										)}
										Send message
									</Button>
								</form>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
