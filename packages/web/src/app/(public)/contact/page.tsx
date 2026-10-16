"use client";

import {
	Clock,
	Loader2,
	Mail,
	MapPin,
	MessageCircle,
	Phone,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
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

const SUBJECTS = [
	"general",
	"account",
	"listing",
	"payment",
	"report",
	"bug",
	"feature",
	"other",
] as const;

export default function ContactPage() {
	return (
		<Suspense>
			<ContactForm />
		</Suspense>
	);
}

function ContactForm() {
	const t = useTranslations("Contact");
	const searchParams = useSearchParams();
	const requestedSubject = searchParams.get("subject");
	const initialSubject =
		requestedSubject &&
		(SUBJECTS as readonly string[]).includes(requestedSubject)
			? requestedSubject
			: "";
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		subject: initialSubject,
		message: "",
	});
	const [isLoading, setIsLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState("");

	const contactInfo = [
		{
			icon: Mail,
			label: t("email"),
			value: "support@buynsellem.com",
			href: "mailto:support@buynsellem.com",
		},
		{
			icon: Phone,
			label: t("phone"),
			value: "+237 652 761 931",
			href: "tel:+237652761931",
		},
		{
			icon: MapPin,
			label: t("location"),
			value: t("locationValue"),
			href: null,
		},
		{
			icon: Clock,
			label: t("hours"),
			value: t("hoursValue"),
			href: null,
		},
	];

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
				setError(data.error || t("errorGeneric"));
				return;
			}

			setSuccess(true);
			setFormData({ name: "", email: "", subject: "", message: "" });
		} catch {
			setError(t("errorNetwork"));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-canvas">
			<section className="relative overflow-hidden bg-brand py-12 dark:bg-brand-tint">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-brand-bright/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<MessageCircle className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("subtitle")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="grid gap-8 lg:grid-cols-5">
					<div className="space-y-4 lg:col-span-2">
						<h2 className="font-bold text-ink text-lg">{t("getInTouch")}</h2>
						<p className="text-ink-muted text-sm leading-relaxed">
							{t("responseTime")}
						</p>
						<div className="space-y-3 pt-2">
							{contactInfo.map((info) => (
								<div key={info.label} className="flex items-start gap-3">
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
										<info.icon className="h-4 w-4" />
									</div>
									<div>
										<p className="font-medium text-ink-faint text-xs">
											{info.label}
										</p>
										{info.href ? (
											<a
												href={info.href}
												className="font-medium text-ink text-sm hover:text-brand"
											>
												{info.value}
											</a>
										) : (
											<p className="font-medium text-ink text-sm">
												{info.value}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="lg:col-span-3">
						<div className="rounded-xl border border-line bg-surface p-6">
							{success ? (
								<div className="py-8 text-center">
									<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
										<MessageCircle className="h-6 w-6 text-emerald-600" />
									</div>
									<h3 className="font-bold text-ink text-lg">
										{t("messageSent")}
									</h3>
									<p className="mt-1 text-ink-muted text-sm">
										{t("getBackSoon")}
									</p>
									<Button
										onClick={() => setSuccess(false)}
										variant="outline"
										className="mt-4 rounded-xl"
									>
										{t("sendAnother")}
									</Button>
								</div>
							) : (
								<form onSubmit={handleSubmit} className="space-y-4">
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<Label htmlFor="name">{t("name")}</Label>
											<Input
												id="name"
												placeholder={t("namePlaceholder")}
												value={formData.name}
												onChange={(e) =>
													setFormData((p) => ({ ...p, name: e.target.value }))
												}
												required
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="email">{t("email")}</Label>
											<Input
												id="email"
												type="email"
												placeholder={t("emailPlaceholder")}
												value={formData.email}
												onChange={(e) =>
													setFormData((p) => ({ ...p, email: e.target.value }))
												}
												required
											/>
										</div>
									</div>
									<div className="space-y-2">
										<Label htmlFor="subject">{t("subject")}</Label>
										<Select
											value={formData.subject}
											onValueChange={(v) =>
												setFormData((p) => ({ ...p, subject: v }))
											}
										>
											<SelectTrigger>
												<SelectValue placeholder={t("subjectPlaceholder")} />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="general">
													{t("generalQuestion")}
												</SelectItem>
												<SelectItem value="account">
													{t("accountIssue")}
												</SelectItem>
												<SelectItem value="listing">
													{t("listingProblem")}
												</SelectItem>
												<SelectItem value="payment">
													{t("paymentBilling")}
												</SelectItem>
												<SelectItem value="report">
													{t("reportScam")}
												</SelectItem>
												<SelectItem value="bug">{t("bugReport")}</SelectItem>
												<SelectItem value="feature">
													{t("featureRequest")}
												</SelectItem>
												<SelectItem value="other">{t("other")}</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor="message">{t("message")}</Label>
										<Textarea
											id="message"
											placeholder={t("messagePlaceholder")}
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
										className="w-full rounded-xl bg-brand hover:bg-brand-strong"
									>
										{isLoading ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Mail className="mr-2 h-4 w-4" />
										)}
										{t("sendMessage")}
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
