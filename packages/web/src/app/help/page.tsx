import {
	CreditCard,
	HelpCircle,
	MessageCircle,
	Package,
	Search,
	Shield,
	ShoppingBag,
	UserPlus,
} from "lucide-react";
import Link from "next/link";

const faqs = [
	{
		question: "How do I create an account?",
		answer:
			'Click the "Sign up" button in the top-right corner. Fill in your name, email, and a password. You\'ll be logged in immediately and can start browsing or selling.',
	},
	{
		question: "How do I post a listing?",
		answer:
			'Once logged in, click the "Sell now" button. Follow the 4-step process: choose a category, add details and price, upload photos, then review and publish.',
	},
	{
		question: "Is it free to list items?",
		answer:
			"Yes! Posting listings on Buy'N'Sellem is completely free. You can optionally boost your listing for more visibility with our paid promotion feature.",
	},
	{
		question: "How does the boost feature work?",
		answer:
			'Boosting places your listing at the top of search results and marks it as "Featured". You can boost for 7, 14, or 30 days. Payment is handled securely through NotchPay.',
	},
	{
		question: "How do I contact a seller?",
		answer:
			'On any listing page, click the "Message seller" button. This opens a direct conversation where you can negotiate and arrange the transaction.',
	},
	{
		question: "How do I mark an item as sold?",
		answer:
			'Go to "My Listings" from your profile menu. Click the three-dot menu on the listing and select "Mark as sold".',
	},
	{
		question: "Can I edit my listing after publishing?",
		answer:
			'Yes. Go to "My Listings", click "Edit" on the listing you want to change. You can update the title, price, description, photos, and category.',
	},
	{
		question: "How do reviews work?",
		answer:
			"After a transaction, you can leave a review on the other user's profile page. Rate them from 1 to 5 stars and optionally leave a comment. Reviews help build trust in the community.",
	},
];

const categories = [
	{
		icon: UserPlus,
		title: "Getting Started",
		desc: "Create your account and set up your profile",
		href: "/auth/register",
	},
	{
		icon: ShoppingBag,
		title: "Buying",
		desc: "Search, filter, and contact sellers",
		href: "/search",
	},
	{
		icon: Package,
		title: "Selling",
		desc: "List items, manage listings, and get paid",
		href: "/create",
	},
	{
		icon: CreditCard,
		title: "Boost & Payments",
		desc: "Promote your listings for more visibility",
		href: "/profile/me/listings",
	},
	{
		icon: Shield,
		title: "Safety",
		desc: "Tips and guidelines to stay safe",
		href: "/safety",
	},
	{
		icon: MessageCircle,
		title: "Messaging",
		desc: "Communicate with buyers and sellers",
		href: "/messages",
	},
];

export default function HelpPage() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			{/* Hero */}
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<HelpCircle className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">Help Center</h1>
					<p className="mt-2 text-blue-100">
						Everything you need to know about using Buy&apos;N&apos;Sellem
					</p>
				</div>
			</section>

			<div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
				{/* Quick links */}
				<div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{categories.map((cat) => (
						<Link
							key={cat.title}
							href={cat.href}
							className="group flex items-start gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 transition-all hover:border-[#93C5FD] hover:shadow-md"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E40AF] transition-colors group-hover:bg-[#1E40AF] group-hover:text-white">
								<cat.icon className="h-5 w-5" />
							</div>
							<div>
								<h3 className="font-semibold text-[#0F172A]">{cat.title}</h3>
								<p className="mt-0.5 text-[#64748B] text-sm">{cat.desc}</p>
							</div>
						</Link>
					))}
				</div>

				{/* FAQ */}
				<h2 className="mb-6 font-bold text-[#0F172A] text-xl">
					Frequently Asked Questions
				</h2>
				<div className="space-y-4">
					{faqs.map((faq) => (
						<details
							key={faq.question}
							className="group rounded-xl border border-[#E2E8F0] bg-white"
						>
							<summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-semibold text-[#0F172A] text-sm [&::-webkit-details-marker]:hidden">
								{faq.question}
								<Search className="h-4 w-4 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-45" />
							</summary>
							<div className="border-[#E2E8F0] border-t px-5 py-4 text-[#475569] text-sm leading-relaxed">
								{faq.answer}
							</div>
						</details>
					))}
				</div>

				{/* Contact CTA */}
				<div className="mt-12 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-6 text-center">
					<p className="font-semibold text-[#0F172A]">Still need help?</p>
					<p className="mt-1 text-[#64748B] text-sm">
						Our support team is here for you.
					</p>
					<Link
						href="/contact"
						className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-6 py-2.5 font-semibold text-sm text-white transition-colors hover:bg-[#1E3A8A]"
					>
						<MessageCircle className="h-4 w-4" />
						Contact us
					</Link>
				</div>
			</div>
		</div>
	);
}
