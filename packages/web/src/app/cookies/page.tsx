import { Cookie } from "lucide-react";

export default function CookiePolicyPage() {
	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<Cookie className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">Cookie Policy</h1>
					<p className="mt-2 text-blue-100">Last updated: March 12, 2026</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-[#475569] [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-bold [&_h2]:text-[#0F172A] [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-[#0F172A] [&_li]:mb-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-[#E2E8F0] [&_td]:px-4 [&_td]:py-2 [&_th]:border [&_th]:border-[#E2E8F0] [&_th]:bg-[#F8FAFC] [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#0F172A] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
						<h2>1. What Are Cookies?</h2>
						<p>
							Cookies are small text files stored on your device when you visit
							a website. They help the website remember your preferences, keep
							you logged in, and understand how you use the site.
						</p>

						<h2>2. Cookies We Use</h2>

						<table>
							<thead>
								<tr>
									<th>Cookie</th>
									<th>Purpose</th>
									<th>Duration</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>
										<code className="rounded bg-[#F1F5F9] px-1 text-xs">
											payload-token
										</code>
									</td>
									<td>Authentication — keeps you logged in</td>
									<td>Session / 2 hours</td>
								</tr>
							</tbody>
						</table>

						<h3>2.1 Essential Cookies</h3>
						<p>
							These cookies are necessary for the platform to function. They
							enable core features like user authentication and security. You
							cannot opt out of essential cookies as the platform would not work
							without them.
						</p>
						<ul>
							<li>
								<strong>Authentication cookie:</strong> Stores your login
								session so you don&apos;t need to log in on every page.
							</li>
						</ul>

						<h3>2.2 Cookies We Do NOT Use</h3>
						<p>Buy&apos;N&apos;Sellem does not currently use:</p>
						<ul>
							<li>Third-party advertising or tracking cookies</li>
							<li>Analytics cookies (Google Analytics, etc.)</li>
							<li>Social media tracking pixels</li>
							<li>Cross-site tracking cookies</li>
						</ul>

						<h2>3. Local Storage</h2>
						<p>
							In addition to cookies, we may use browser local storage for
							client-side preferences. This data never leaves your device and is
							not sent to our servers.
						</p>

						<h2>4. Managing Cookies</h2>
						<p>
							You can manage cookies through your browser settings. Most
							browsers allow you to block or delete cookies. Note that blocking
							essential cookies will prevent you from logging in.
						</p>
						<ul>
							<li>
								<strong>Chrome:</strong> Settings &gt; Privacy and Security &gt;
								Cookies
							</li>
							<li>
								<strong>Firefox:</strong> Settings &gt; Privacy &amp; Security
								&gt; Cookies
							</li>
							<li>
								<strong>Safari:</strong> Preferences &gt; Privacy &gt; Cookies
							</li>
							<li>
								<strong>Edge:</strong> Settings &gt; Cookies and Site
								Permissions
							</li>
						</ul>

						<h2>5. Updates</h2>
						<p>
							If we add new types of cookies (e.g., analytics), we will update
							this policy and notify users. We are committed to minimal cookie
							usage and user privacy.
						</p>

						<h2>6. Contact</h2>
						<p>
							Questions about our cookie policy? Contact us at{" "}
							<a
								href="mailto:privacy@buynsellem.com"
								className="text-[#1E40AF] hover:underline"
							>
								privacy@buynsellem.com
							</a>
							.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
