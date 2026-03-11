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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
import { Input } from "~/components/ui/input";
import { useAuth } from "~/hooks/use-auth";

export function Header() {
	const { user, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

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

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto flex h-14 items-center px-4">
				<div className="mr-4 hidden md:flex">
					<Link href="/" className="mr-6 flex items-center space-x-2">
						<span className="text-xl font-bold">Marketplace</span>
					</Link>
					<nav className="flex items-center space-x-6 text-sm font-medium">
						<Link
							href="/search"
							className={`transition-colors hover:text-foreground ${
								pathname === "/search"
									? "text-foreground"
									: "text-muted-foreground"
							}`}
						>
							Browse
						</Link>
						{user && (
							<Link
								href="/favorites"
								className={`transition-colors hover:text-foreground ${
									pathname === "/favorites"
										? "text-foreground"
										: "text-muted-foreground"
								}`}
							>
								Favorites
							</Link>
						)}
					</nav>
				</div>

				<button
					className="inline-flex items-center justify-center p-2 md:hidden"
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
				>
					{mobileMenuOpen ? (
						<X className="h-5 w-5" />
					) : (
						<Menu className="h-5 w-5" />
					)}
					<span className="sr-only">Toggle Menu</span>
				</button>

				<Link href="/" className="mr-4 md:hidden">
					<span className="text-lg font-bold">Marketplace</span>
				</Link>

				<div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
					<form
						onSubmit={handleSearch}
						className="hidden w-full max-w-sm md:flex"
					>
						<div className="relative w-full">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder="Search listings..."
								className="pl-8"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
					</form>

					<div className="flex items-center gap-2">
						{user ? (
							<>
								<Link href="/create" className="hidden md:block">
									<Button variant="default" size="sm">
										<PlusCircle className="mr-2 h-4 w-4" />
										Sell
									</Button>
								</Link>
								<Link href="/messages" className="hidden md:block">
									<Button variant="ghost" size="icon">
										<MessageCircle className="h-5 w-5" />
									</Button>
								</Link>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											className="relative h-8 w-8 rounded-full"
										>
											<Avatar className="h-8 w-8">
												<AvatarImage src={user.avatar?.url} alt={user.name} />
												<AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
											</Avatar>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-56" align="end" forceMount>
										<DropdownMenuLabel className="font-normal">
											<div className="flex flex-col space-y-1">
												<p className="text-sm font-medium leading-none">
													{user.name}
												</p>
												<p className="text-xs leading-none text-muted-foreground">
													{user.email}
												</p>
											</div>
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										<DropdownMenuItem asChild>
											<Link href="/profile/me">
												<User className="mr-2 h-4 w-4" />
												Profile
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem asChild>
											<Link href="/profile/me/listings">
												<PlusCircle className="mr-2 h-4 w-4" />
												My Listings
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem asChild>
											<Link href="/favorites">
												<Heart className="mr-2 h-4 w-4" />
												Favorites
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem asChild>
											<Link href="/settings">
												<Settings className="mr-2 h-4 w-4" />
												Settings
											</Link>
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={handleLogout}>
											<LogOut className="mr-2 h-4 w-4" />
											Log out
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</>
						) : (
							<>
								<Link href="/auth/login">
									<Button variant="ghost" size="sm">
										Log in
									</Button>
								</Link>
								<Link href="/auth/register">
									<Button variant="default" size="sm">
										Sign up
									</Button>
								</Link>
							</>
						)}
					</div>
				</div>
			</div>

			{mobileMenuOpen && (
				<div className="border-t md:hidden">
					<div className="container px-4 py-4">
						<form onSubmit={handleSearch} className="mb-4">
							<div className="relative">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									type="search"
									placeholder="Search listings..."
									className="pl-8"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>
						</form>
						<nav className="flex flex-col space-y-2">
							<Link
								href="/search"
								className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
								onClick={() => setMobileMenuOpen(false)}
							>
								Browse
							</Link>
							{user ? (
								<>
									<Link
										href="/create"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Sell
									</Link>
									<Link
										href="/favorites"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Favorites
									</Link>
									<Link
										href="/messages"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Messages
									</Link>
									<Link
										href="/profile/me"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Profile
									</Link>
									<button
										onClick={handleLogout}
										className="rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent"
									>
										Log out
									</button>
								</>
							) : (
								<>
									<Link
										href="/auth/login"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Log in
									</Link>
									<Link
										href="/auth/register"
										className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
										onClick={() => setMobileMenuOpen(false)}
									>
										Sign up
									</Link>
								</>
							)}
						</nav>
					</div>
				</div>
			)}
		</header>
	);
}
