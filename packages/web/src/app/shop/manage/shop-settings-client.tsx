"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CloseShopForm } from "~/components/shop/close-shop-form";
import { ContactsForm } from "~/components/shop/contacts-form";
import { HandleForm } from "~/components/shop/handle-form";
import { MoveListingsDialog } from "~/components/shop/move-listings-dialog";
import { ProfileForm } from "~/components/shop/profile-form";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Category, MyShop, ShopRole } from "~/types";

type Tab = "profile" | "address" | "contacts" | "listings" | "close";

export function ShopSettingsClient({
	shop,
	role,
	personalListings,
	categories,
	initialTab,
	openMove,
}: {
	shop: MyShop;
	role: ShopRole | null;
	personalListings: number;
	categories: Category[];
	initialTab: Tab;
	openMove: boolean;
}) {
	const t = useTranslations("ShopManage");
	const [tab, setTab] = useState<Tab>(initialTab);
	const [moveOpen, setMoveOpen] = useState(openMove);
	const suspended = shop.status !== "active";

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					<p className="text-[#64748B] text-sm">
						{t("subtitle", { handle: shop.handle })}
					</p>
				</div>
				<Link
					href={`/s/${shop.handle}`}
					className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-sm leading-10"
				>
					{t("viewShop")}
				</Link>
			</div>
			<Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
				<TabsList>
					<TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
					<TabsTrigger value="address">{t("tabAddress")}</TabsTrigger>
					<TabsTrigger value="contacts">{t("tabContacts")}</TabsTrigger>
					<TabsTrigger value="listings">{t("tabListings")}</TabsTrigger>
					<TabsTrigger value="close">{t("tabClose")}</TabsTrigger>
				</TabsList>
				<div className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
					<TabsContent value="profile">
						<ProfileForm shop={shop} categories={categories} />
					</TabsContent>
					<TabsContent value="address">
						<HandleForm shop={shop} role={role} />
					</TabsContent>
					<TabsContent value="contacts">
						<ContactsForm shop={shop} />
					</TabsContent>
					<TabsContent value="listings">
						<div className="space-y-3">
							<p className="text-[#334155] text-sm">
								{t("listingsBody", { count: personalListings })}
							</p>
							<Button
								onClick={() => setMoveOpen(true)}
								disabled={suspended}
								className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
							>
								{t("moveTitle")}
							</Button>
							{suspended && (
								<p className="text-[#991b1b] text-xs">{t("moveSuspended")}</p>
							)}
						</div>
					</TabsContent>
					<TabsContent value="close">
						<CloseShopForm shop={shop} role={role} />
					</TabsContent>
				</div>
			</Tabs>
			<MoveListingsDialog
				shopId={shop.id}
				shopName={shop.name}
				open={moveOpen && !suspended}
				onOpenChange={setMoveOpen}
			/>
		</div>
	);
}
