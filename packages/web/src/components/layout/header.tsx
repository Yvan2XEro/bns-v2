"use client";

import {
	Heart,
	LogOut,
	Menu,
	MessageCircle,
	PlusCircle,
	Search,
	Settings,
	User,
	X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/hooks/use-auth";

export function Header() {
	const { user, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 10);
		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
		}
	};

	const handleLogout = async () => {
		await logout();
		router.push("/");
	};

	const isHome = pathname === "/";

	return (
		<header
			className={`sticky top-0 z-50 w-full transition-all duration-200 ${
				scrolled || !isHome
					? "border-[#E2E8F0] border-b bg-white shadow-sm"
					: "bg-white"
			}`}
		>
			<div className="container mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
				{/* Logo */}
				<Link
					href="/"
					className="flex shrink-0 items-center gap-2 transition-transform duration-200 hover:scale-105 active:scale-95"
				>
					<Image
						src="/logo.png"
						alt="Buy'N'Sellem"
						width={32}
						height={32}
						className="h-8 w-8 object-contain"
					/>
					<span className="hidden font-bold text-[#0F172A] text-lg sm:inline">
						Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
					</span>
				</Link>

				{/* Search bar (Vinted/Leboncoin style: always visible, centered) */}
				<form onSubmit={handleSearch} className="hidden flex-1 md:block">
					<div className="relative mx-auto max-w-lg">
						<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
						<input
							type="search"
							placeholder="Search..."
							className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pr-3 pl-9 text-[#0F172A] text-sm transition-colors placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</form>

				{/* Right actions */}
				<div className="flex shrink-0 items-center gap-1 sm:gap-2">
					{user ? (
						<>
							{/* Sell button (prominent, like Vinted green CTA) */}
							<Link href="/create" className="hidden sm:block">
								<Button
									size="sm"
									className="h-9 rounded-lg bg-[#F59E0B] px-4 font-bold text-[#0F172A] text-xs hover:bg-[#D97706]"
								>
									<PlusCircle className="mr-1.5 h-4 w-4" />
									Sell now
								</Button>
							</Link>

							<Link href="/favorites" className="hidden sm:block">
								<button
									type="button"
									className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:scale-110 hover:bg-[#F1F5F9] hover:text-[#0F172A] active:scale-95"
								>
									<Heart className="h-5 w-5" />
								</button>
							</Link>

							<Link href="/messages">
								<button
									type="button"
									className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:scale-110 hover:bg-[#F1F5F9] hover:text-[#0F172A] active:scale-95"
								>
									<MessageCircle className="h-5 w-5" />
								</button>
							</Link>

							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 hover:ring-2 hover:ring-[#DBEAFE] active:scale-95"
									>
										<Avatar className="h-8 w-8">
											<AvatarImage
												src={(user.avatar as { url?: string })?.url}
												alt={user.name}
											/>
											<AvatarFallback className="bg-[#1E40AF] font-semibold text-white text-xs">
												{user.name?.charAt(0)}
											</AvatarFallback>
										</Avatar>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									className="w-52 rounded-lg border-[#E2E8F0]"
									align="end"
								>
									<DropdownMenuLabel className="font-normal">
										<p className="font-semibold text-[#0F172A] text-sm">
											{user.name}
										</p>
										<p className="text-[#64748B] text-xs">{user.email}</p>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link href="/profile/me" className="cursor-pointer">
											<User className="mr-2 h-4 w-4" />
											Profile
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link
											href="/profile/me/listings"
											className="cursor-pointer"
										>
											<PlusCircle className="mr-2 h-4 w-4" />
											My Listings
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/favorites" className="cursor-pointer">
											<Heart className="mr-2 h-4 w-4" />
											Favorites
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/settings" className="cursor-pointer">
											<Settings className="mr-2 h-4 w-4" />
											Settings
										</Link>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={handleLogout}
										className="cursor-pointer text-red-600 focus:text-red-600"
									>
										<LogOut className="mr-2 h-4 w-4" />
										Log out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					) : (
						<>
							<Link href="/auth/login">
								<Button
									variant="ghost"
									size="sm"
									className="h-9 rounded-lg text-[#475569] text-sm"
								>
									Log in
								</Button>
							</Link>
							<Link href="/auth/register">
								<Button
									size="sm"
									className="h-9 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm hover:bg-[#1E3A8A]"
								>
									Sign up
								</Button>
							</Link>
						</>
					)}

					{/* Mobile menu toggle */}
					<button
						type="button"
						className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] md:hidden"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					>
						{mobileMenuOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
					</button>
				</div>
			</div>

			{/* Mobile search + menu */}
			{mobileMenuOpen && (
				<div className="border-[#E2E8F0] border-t bg-white px-4 py-3 md:hidden">
					<form onSubmit={handleSearch} className="mb-3">
						<div className="relative">
							<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
							<input
								type="search"
								placeholder="Search..."
								className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
					</form>
					<nav className="flex flex-col">
						{[
							{ label: "Browse", href: "/search" },
							...(user
								? [
										{ label: "Sell now", href: "/create" },
										{ label: "Favorites", href: "/favorites" },
										{ label: "Messages", href: "/messages" },
										{ label: "Profile", href: "/profile/me" },
									]
								: [
										{ label: "Log in", href: "/auth/login" },
										{ label: "Sign up", href: "/auth/register" },
									]),
						].map((item) => (
							<Link
								key={item.href}
								href={item.href}
								className={`rounded-lg px-3 py-2 font-medium text-sm ${
									pathname === item.href
										? "bg-[#EFF6FF] text-[#1E40AF]"
										: "text-[#475569]"
								}`}
								onClick={() => setMobileMenuOpen(false)}
							>
								{item.label}
							</Link>
						))}
						{user && (
							<button
								type="button"
								onClick={handleLogout}
								className="rounded-lg px-3 py-2 text-left font-medium text-red-600 text-sm"
							>
								Log out
							</button>
						)}
					</nav>
				</div>
			)}
		</header>
	);
}
