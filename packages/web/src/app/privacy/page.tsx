import { Lock } from "lucide-react";

export default function PrivacyPage() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="absolute inset-0 pattern-dots-light" />
				<div className="absolute inset-0 pattern-diagonal" />
				<div className="absolute -left-20 top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="absolute -right-20 bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
					<Lock className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="text-3xl font-extrabold text-white">Privacy Policy</h1>
					<p className="mt-2 text-blue-100">Last updated: March 12, 2026</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-[#475569] [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[#0F172A] [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-[#0F172A] [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1">
						<h2>1. Information We Collect</h2>

						<h3>1.1 Information You Provide</h3>
						<ul>
							<li><strong>Account information:</strong> Name, email address, password, phone number, location, and profile photo.</li>
							<li><strong>Listing data:</strong> Photos, descriptions, prices, and other details you add to listings.</li>
							<li><strong>Messages:</strong> Content of messages sent through our platform.</li>
							<li><strong>Reviews:</strong> Ratings and comments you leave for other users.</li>
						</ul>

						<h3>1.2 Information Collected Automatically</h3>
						<ul>
							<li><strong>Usage data:</strong> Pages visited, listings viewed, search queries, and feature usage.</li>
							<li><strong>Device information:</strong> Browser type, operating system, and device identifiers.</li>
							<li><strong>Location data:</strong> Approximate location based on IP address.</li>
						</ul>

						<h2>2. How We Use Your Information</h2>
						<p>We use your information to:</p>
						<ul>
							<li>Provide and maintain the Buy&apos;N&apos;Sellem platform</li>
							<li>Enable communication between buyers and sellers</li>
							<li>Display relevant listings and search results</li>
							<li>Process boost payments and transactions</li>
							<li>Prevent fraud and enforce our terms of service</li>
							<li>Send important updates about your account or transactions</li>
							<li>Improve our platform based on usage patterns</li>
						</ul>

						<h2>3. Information Sharing</h2>
						<p>We do not sell your personal information. We may share information with:</p>
						<ul>
							<li><strong>Other users:</strong> Your public profile (name, avatar, location, rating) is visible to other users. Your email and phone are never shared publicly.</li>
							<li><strong>Payment providers:</strong> NotchPay receives necessary transaction data to process boost payments.</li>
							<li><strong>Law enforcement:</strong> When required by law or to protect safety.</li>
						</ul>

						<h2>4. Data Security</h2>
						<p>
							We implement industry-standard security measures to protect your data, including encrypted connections (HTTPS), secure password hashing, and access controls. However, no system is 100% secure, and we cannot guarantee absolute security.
						</p>

						<h2>5. Your Rights</h2>
						<p>You have the right to:</p>
						<ul>
							<li><strong>Access</strong> your personal data through your profile and settings</li>
							<li><strong>Update</strong> your information at any time through the Settings page</li>
							<li><strong>Delete</strong> your account and associated data through Settings &gt; Danger Zone</li>
							<li><strong>Export</strong> your data by contacting our support team</li>
						</ul>

						<h2>6. Data Retention</h2>
						<p>
							We retain your data for as long as your account is active. When you delete your account, we remove your personal data within 30 days. Some data may be retained longer if required by law or for legitimate business purposes (fraud prevention, legal disputes).
						</p>

						<h2>7. Children&apos;s Privacy</h2>
						<p>
							Buy&apos;N&apos;Sellem is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children.
						</p>

						<h2>8. Third-Party Services</h2>
						<p>
							Our platform may contain links to third-party websites or services. We are not responsible for the privacy practices of these external services. We encourage you to read their privacy policies.
						</p>

						<h2>9. Changes to This Policy</h2>
						<p>
							We may update this privacy policy from time to time. We will notify you of significant changes by email or through a notice on the platform. Your continued use of the Service after changes constitutes acceptance.
						</p>

						<h2>10. Contact</h2>
						<p>
							For questions about this privacy policy or your data, contact us at{" "}
							<a href="mailto:privacy@buynsellem.com" className="text-[#1E40AF] hover:underline">
								privacy@buynsellem.com
							</a>.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
