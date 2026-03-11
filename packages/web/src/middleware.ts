import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = [
	"/create",
	"/favorites",
	"/messages",
	"/profile/me",
	"/settings",
];

const authRoutes = ["/auth/login", "/auth/register"];

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const token = request.cookies.get("payload-token");

	const isProtected = protectedRoutes.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);

	const isAuthRoute = authRoutes.some((route) => pathname === route);

	// Redirect unauthenticated users to login
	if (isProtected && !token) {
		const loginUrl = new URL("/auth/login", request.url);
		loginUrl.searchParams.set("redirect", pathname);
		return NextResponse.redirect(loginUrl);
	}

	// Redirect authenticated users away from auth pages
	if (isAuthRoute && token) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/create/:path*",
		"/favorites/:path*",
		"/messages/:path*",
		"/profile/me/:path*",
		"/settings/:path*",
		"/auth/:path*",
	],
};
