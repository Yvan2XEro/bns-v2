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
					? "border-b border-[#E2E8F0] bg-white shadow-sm"
					: "bg-white"
			}`}
		>
			<div className="container mx-auto max-w-7xl flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
				{/* Logo */}
				<Link href="/" className="flex shrink-0 items-center gap-2 transition-transform duration-200 hover:scale-105 active:scale-95">
					<Image src="/logo.png" alt="Buy'N'Sellem" width={32} height={32} className="h-8 w-8 object-contain" />
					<span className="hidden text-lg font-bold text-[#0F172A] sm:inline">
						Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
					</span>
				</Link>

				{/* Search bar (Vinted/Leboncoin style: always visible, centered) */}
				<form
					onSubmit={handleSearch}
					className="hidden flex-1 md:block"
				>
					<div className="relative mx-auto max-w-lg">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
						<input
							type="search"
							placeholder="Search..."
							className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-colors focus:border-[#93C5FD] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
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
									className="h-9 rounded-lg bg-[#F59E0B] px-4 text-xs font-bold text-[#0F172A] hover:bg-[#D97706]"
								>
									<PlusCircle className="mr-1.5 h-4 w-4" />
									Sell now
								</Button>
							</Link>

							<Link href="/favorites" className="hidden sm:block">
								<button className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] hover:scale-110 active:scale-95">
									<Heart className="h-5 w-5" />
								</button>
							</Link>

							<Link href="/messages">
								<button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] hover:scale-110 active:scale-95">
									<MessageCircle className="h-5 w-5" />
								</button>
							</Link>

							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:ring-2 hover:ring-[#DBEAFE] hover:scale-110 active:scale-95">
										<Avatar className="h-8 w-8">
											<AvatarImage src={user.avatar?.url} alt={user.name} />
											<AvatarFallback className="bg-[#1E40AF] text-xs font-semibold text-white">
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
										<p className="text-sm font-semibold text-[#0F172A]">
											{user.name}
										</p>
										<p className="text-xs text-[#64748B]">{user.email}</p>
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link href="/profile/me" className="cursor-pointer">
											<User className="mr-2 h-4 w-4" />
											Profile
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<Link href="/profile/me/listings" className="cursor-pointer">
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
									className="h-9 rounded-lg text-sm text-[#475569]"
								>
									Log in
								</Button>
							</Link>
							<Link href="/auth/register">
								<Button
									size="sm"
									className="h-9 rounded-lg bg-[#1E40AF] px-4 text-sm font-semibold hover:bg-[#1E3A8A]"
								>
									Sign up
								</Button>
							</Link>
						</>
					)}

					{/* Mobile menu */}
					<button
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
				<div className="border-t border-[#E2E8F0] bg-white px-4 py-3 md:hidden">
					<form onSubmit={handleSearch} className="mb-3">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
							<input
								type="search"
								placeholder="Search..."
								className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-sm focus:border-[#93C5FD] focus:outline-none"
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
								className={`rounded-lg px-3 py-2 text-sm font-medium ${
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
								onClick={handleLogout}
								className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600"
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
