import {
	AlertTriangle,
	Ban,
	CheckCircle,
	Eye,
	MapPin,
	MessageCircle,
	Shield,
	Users,
} from "lucide-react";

const tips = [
	{
		icon: MapPin,
		title: "Meet in a public place",
		desc: "Always arrange meetings in well-lit, busy public areas like shopping centers, police stations, or cafes. Avoid going to a stranger's home or inviting them to yours.",
		color: "bg-blue-50 text-[#1E40AF]",
	},
	{
		icon: Eye,
		title: "Inspect before paying",
		desc: "Always check the item thoroughly before handing over any money. Test electronics, check for damage, and verify that it matches the listing description and photos.",
		color: "bg-emerald-50 text-emerald-700",
	},
	{
		icon: Ban,
		title: "Never send money in advance",
		desc: "Legitimate sellers will not ask for payment before you've seen the item. Never wire money, send mobile money, or use gift cards as payment to someone you haven't met.",
		color: "bg-red-50 text-red-600",
	},
	{
		icon: Users,
		title: "Bring someone with you",
		desc: "When meeting for a transaction, especially for high-value items, bring a friend or family member along. Let someone know where you're going.",
		color: "bg-amber-50 text-amber-700",
	},
	{
		icon: MessageCircle,
		title: "Keep communication on the platform",
		desc: "Use Buy'N'Sellem's built-in messaging to communicate with buyers and sellers. This helps us protect you and provides a record of your conversations.",
		color: "bg-purple-50 text-purple-700",
	},
	{
		icon: AlertTriangle,
		title: "Trust your instincts",
		desc: "If a deal seems too good to be true, it probably is. If something feels wrong or a person makes you uncomfortable, walk away. Your safety is more important than any deal.",
		color: "bg-orange-50 text-orange-700",
	},
];

const redFlags = [
	"Seller asks for payment before meeting",
	"Price is suspiciously low compared to market value",
	"Seller refuses to meet in person",
	"Seller asks you to pay via wire transfer or gift cards",
	"Listing has stolen or stock photos",
	"Seller pressures you to decide quickly",
	"Seller asks for personal information (bank details, ID)",
	"Communication moves off-platform to WhatsApp or email immediately",
];

export default function SafetyPage() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Hero */}
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<Shield className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">Safety Tips</h1>
					<p className="mt-2 text-blue-100">
						Your safety is our priority. Follow these guidelines for a secure
						experience.
					</p>
				</div>
			</section>

			<div className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
				{/* Tips grid */}
				<div className="grid gap-4 sm:grid-cols-2">
					{tips.map((tip) => (
						<div
							key={tip.title}
							className="rounded-xl border border-[#E2E8F0] bg-white p-5"
						>
							<div
								className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${tip.color}`}
							>
								<tip.icon className="h-5 w-5" />
							</div>
							<h3 className="font-semibold text-[#0F172A]">{tip.title}</h3>
							<p className="mt-1 text-[#64748B] text-sm leading-relaxed">
								{tip.desc}
							</p>
						</div>
					))}
				</div>

				{/* Red flags */}
				<div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6">
					<h2 className="flex items-center gap-2 font-bold text-lg text-red-700">
						<AlertTriangle className="h-5 w-5" />
						Red Flags to Watch For
					</h2>
					<ul className="mt-4 space-y-2">
						{redFlags.map((flag) => (
							<li
								key={flag}
								className="flex items-start gap-2 text-red-700 text-sm"
							>
								<Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								{flag}
							</li>
						))}
					</ul>
				</div>

				{/* What to do */}
				<div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
					<h2 className="flex items-center gap-2 font-bold text-emerald-700 text-lg">
						<CheckCircle className="h-5 w-5" />
						If Something Goes Wrong
					</h2>
					<ul className="mt-4 space-y-2 text-emerald-700 text-sm">
						<li>1. Stop all communication with the person</li>
						<li>2. Do not send any more money or personal information</li>
						<li>
							3. Report the user or listing using the &ldquo;Report&rdquo;
							button
						</li>
						<li>4. Contact local authorities if you&apos;ve been scammed</li>
						<li>5. Reach out to our support team for assistance</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
