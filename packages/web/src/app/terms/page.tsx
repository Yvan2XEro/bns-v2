import { FileText } from "lucide-react";

export default function TermsPage() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<FileText className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">
						Terms of Service
					</h1>
					<p className="mt-2 text-blue-100">Last updated: March 12, 2026</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-[#475569] [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-bold [&_h2]:text-[#0F172A] [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-[#0F172A] [&_li]:mb-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
						<h2>1. Acceptance of Terms</h2>
						<p>
							By accessing or using the Buy&apos;N&apos;Sellem platform
							(&ldquo;Service&rdquo;), you agree to be bound by these Terms of
							Service. If you do not agree to these terms, do not use the
							Service.
						</p>

						<h2>2. Eligibility</h2>
						<p>
							You must be at least 18 years old to use the Service. By creating
							an account, you represent that you are at least 18 years of age
							and have the legal capacity to enter into this agreement.
						</p>

						<h2>3. User Accounts</h2>
						<ul>
							<li>
								You are responsible for maintaining the confidentiality of your
								account credentials.
							</li>
							<li>
								You are responsible for all activities that occur under your
								account.
							</li>
							<li>
								You must provide accurate and complete information when creating
								your account.
							</li>
							<li>
								You may not create multiple accounts or use another
								person&apos;s account.
							</li>
						</ul>

						<h2>4. Listings and Transactions</h2>
						<h3>4.1 Sellers</h3>
						<ul>
							<li>
								You must provide accurate descriptions and photos of items you
								list.
							</li>
							<li>
								You are solely responsible for the legality of items you sell.
							</li>
							<li>
								You may not list prohibited items including weapons, drugs,
								stolen goods, or counterfeit products.
							</li>
							<li>Pricing must be honest and not misleading.</li>
						</ul>

						<h3>4.2 Buyers</h3>
						<ul>
							<li>
								You are responsible for inspecting items before completing a
								purchase.
							</li>
							<li>
								Transactions are between buyers and sellers directly.
								Buy&apos;N&apos;Sellem is not a party to any transaction.
							</li>
						</ul>

						<h2>5. Prohibited Activities</h2>
						<p>You may not:</p>
						<ul>
							<li>Post false, misleading, or deceptive content</li>
							<li>Harass, threaten, or abuse other users</li>
							<li>Use the platform for money laundering or fraud</li>
							<li>Attempt to circumvent platform fees or security measures</li>
							<li>
								Scrape, crawl, or use automated tools to access the Service
							</li>
							<li>Post spam or unsolicited commercial messages</li>
						</ul>

						<h2>6. Boost and Paid Services</h2>
						<p>
							Boost payments are non-refundable once the boost period has
							started. Boost durations are 7, 14, or 30 days from the time of
							payment confirmation. Buy&apos;N&apos;Sellem reserves the right to
							remove boosted listings that violate these terms.
						</p>

						<h2>7. Content and Intellectual Property</h2>
						<p>
							You retain ownership of content you post. By posting content on
							Buy&apos;N&apos;Sellem, you grant us a non-exclusive, worldwide,
							royalty-free license to use, display, and distribute that content
							in connection with the Service.
						</p>

						<h2>8. Limitation of Liability</h2>
						<p>
							Buy&apos;N&apos;Sellem is a platform that connects buyers and
							sellers. We do not guarantee the quality, safety, or legality of
							items listed. We are not responsible for any disputes, damages, or
							losses arising from transactions between users.
						</p>

						<h2>9. Account Termination</h2>
						<p>
							We reserve the right to suspend or terminate accounts that violate
							these terms, engage in fraudulent activity, or negatively impact
							the community. You may delete your account at any time through the
							Settings page.
						</p>

						<h2>10. Changes to Terms</h2>
						<p>
							We may update these terms from time to time. Continued use of the
							Service after changes constitutes acceptance of the new terms. We
							will notify users of significant changes via email or platform
							notification.
						</p>

						<h2>11. Governing Law</h2>
						<p>
							These terms are governed by the laws of the Republic of Cameroon.
							Any disputes shall be resolved in the courts of Douala, Cameroon.
						</p>

						<h2>12. Contact</h2>
						<p>
							For questions about these terms, contact us at{" "}
							<a
								href="mailto:legal@buynsellem.com"
								className="text-[#1E40AF] hover:underline"
							>
								legal@buynsellem.com
							</a>
							.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
