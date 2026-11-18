import { describe, expect, test } from "bun:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
	PathnameContext,
	SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { AuthContext, type AuthContextType } from "~/hooks/use-auth";
import LoginPage from "./auth/login/page";
import RegisterPage from "./auth/register/page";
import AuthLayout from "./layout";

const noop = async () => {};
const router = {
	back() {},
	forward() {},
	refresh() {},
	push() {},
	replace() {},
	prefetch() {},
	hmrRefresh() {},
};
const auth: AuthContextType = {
	user: null,
	token: null,
	isLoading: false,
	login: noop,
	loginWithProvider: () => {},
	loginWithSso: () => {},
	register: noop,
	logout: noop,
	refreshUser: noop,
	refreshToken: noop,
};

function render(node: ReactNode, search = ""): string {
	return renderToStaticMarkup(
		<AppRouterContext.Provider value={router as never}>
			<PathnameContext.Provider value="/auth/login">
				<SearchParamsContext.Provider
					value={new URLSearchParams(search) as never}
				>
					<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
						<AuthContext.Provider value={auth}>
							<AuthLayout>{node}</AuthLayout>
						</AuthContext.Provider>
					</NextIntlClientProvider>
				</SearchParamsContext.Provider>
			</PathnameContext.Provider>
		</AppRouterContext.Provider>,
	);
}

describe("the auth shell", () => {
	const html = render(<LoginPage />, "redirect=%2Fcart");

	test("renders no site header, footer or tab bar", () => {
		expect(html).not.toContain("<header");
		expect(html).not.toContain("<footer");
		expect(html).not.toContain(`aria-label="${en.Nav.tabBar}"`);
		expect(html).not.toContain(en.Nav.postAd);
	});

	test("keeps a way home, the language select and the illustration", () => {
		expect(html).toContain('href="/"');
		expect(html).toContain(en.AuthShell.backToSite.replaceAll("'", "&#x27;"));
		expect(html).toContain("<select");
		expect(html).toContain("auth-route");
	});

	test("login: form first, providers after, register keeps the redirect", () => {
		const form = html.indexOf("<form");
		const social = html.indexOf(en.Auth.orContinueWith);
		expect(form).toBeGreaterThan(-1);
		expect(social).toBeGreaterThan(form);
		expect(html).toContain('href="/auth/register?redirect=%2Fcart"');
		expect(html).toContain('href="/auth/forgot-password"');
		expect(html).toContain(`aria-label="${en.Auth.showPassword}"`);
	});

	test("register links back to login and to the terms", () => {
		const page = render(<RegisterPage />);
		expect(page).toContain('href="/auth/login"');
		expect(page).toContain('href="/terms"');
		expect(page).toContain('id="confirmPassword"');
	});
});
