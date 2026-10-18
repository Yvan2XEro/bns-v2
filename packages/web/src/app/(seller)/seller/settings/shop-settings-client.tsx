"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { CloseShopForm } from "~/components/shop/close-shop-form";
import { ContactsForm } from "~/components/shop/contacts-form";
import type { FormBarState } from "~/components/shop/form-bar";
import { HandleForm } from "~/components/shop/handle-form";
import { LegalForm } from "~/components/shop/legal-form";
import { MoveListingsDialog } from "~/components/shop/move-listings-dialog";
import {
	ProfileForm,
	type ShopProfileDraft,
} from "~/components/shop/profile-form";
import { ReturnPolicyForm } from "~/components/shop/return-policy-form";
import { ShopPagePreview } from "~/components/shop/shop-page-preview";
import { ShopProfileForm } from "~/components/shop/shop-profile-form";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { placeOfShopLocation } from "~/lib/shop-form";
import { can, isShopOwner } from "~/lib/shop-roles";
import type { Category, MyShop, ShopRole } from "~/types";

type Tab =
	| "profile"
	| "address"
	| "contacts"
	| "returns"
	| "legal"
	| "listings"
	| "close";

/** The tabs whose form saves through the header's Cancel / Save pair. */
const FORM_IDS: Partial<Record<Tab, string>> = {
	profile: "shop-settings-profile",
	contacts: "shop-settings-contacts",
	returns: "shop-settings-returns",
	legal: "shop-settings-legal",
};

const TRIGGER =
	"rounded-none border-transparent border-b-2 bg-transparent px-0 py-2.5 font-semibold text-ink-muted text-[15px] data-[state=active]:border-[var(--shop-accent,var(--c-brand))] data-[state=active]:bg-transparent data-[state=active]:text-[var(--shop-accent-text,var(--c-brand))] data-[state=active]:shadow-none";

function draftOf(shop: MyShop): ShopProfileDraft {
	const place = placeOfShopLocation(shop.location);
	return {
		name: shop.name,
		description: shop.description ?? "",
		city: [place?.name, place?.region].filter(Boolean).join(", "),
		categoryIds: shop.categories.map((category) => category.id),
		logoUrl: shop.logo?.url ?? null,
		bannerUrl: shop.banner?.url ?? null,
		brandColor: shop.brandColor ?? null,
	};
}

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
	const tManage = useTranslations("ShopManage");
	const tBar = useTranslations("ShopSettingsPreview");
	const tProfile = useTranslations("ShopProfile");
	const [tab, setTab] = useState<Tab>(initialTab);
	const [moveOpen, setMoveOpen] = useState(openMove);
	const [bar, setBar] = useState<FormBarState | null>(null);
	const [draft, setDraft] = useState<ShopProfileDraft>(() => draftOf(shop));
	const onDraftChange = useCallback(
		(next: ShopProfileDraft) => setDraft(next),
		[],
	);
	const onStateChange = useCallback((next: FormBarState) => setBar(next), []);
	const suspended = shop.status !== "active";
	// The address change and the close form are owner-only levers the server
	// refuses for anyone else, so their tabs are not offered either.
	const owner = isShopOwner(role);
	const formId = FORM_IDS[tab];
	const formBar = formId ? bar : null;

	const categoryNames = draft.categoryIds
		.map(
			(id) =>
				categories.find((category) => category.id === id)?.name ??
				shop.categories.find((category) => category.id === id)?.name,
		)
		.filter((name): name is string => Boolean(name));

	function changeTab(next: Tab) {
		setBar(null);
		setTab(next);
	}

	const card = (title: string, body: React.ReactNode) => (
		<div className="rounded-xl border border-line bg-surface">
			<div className="flex items-center justify-between gap-3 border-line border-b px-[18px] py-3.5">
				<h2 className="font-bold text-base text-ink">{title}</h2>
				{formBar?.dirty && (
					<span className="flex items-center gap-1.5 font-semibold text-[13px] text-warn-ink-soft">
						<span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
						{tBar("unsaved")}
					</span>
				)}
			</div>
			<div className="p-[18px]">{body}</div>
		</div>
	);

	// Saved on its own: the profile form's Cancel / Save pair does not cover it.
	const kindCard = (body: React.ReactNode) => (
		<div className="rounded-xl border border-line bg-surface">
			<div className="border-line border-b px-[18px] py-3.5">
				<h2 className="font-bold text-base text-ink">
					{tProfile("settingsTitle")}
				</h2>
			</div>
			<div className="p-[18px]">{body}</div>
		</div>
	);

	return (
		<div className="space-y-[18px]">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-1">
					<h1 className="font-extrabold text-[28px] text-ink tracking-[-0.4px]">
						{tManage("title")}
					</h1>
					<p className="text-ink-muted text-sm">
						{tManage("subtitle", { handle: shop.handle })}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2.5">
					<Link
						href={`/s/${shop.handle}`}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas"
					>
						<ExternalLink aria-hidden="true" className="h-4 w-4" />
						{tManage("viewShop")}
					</Link>
					{formId && (
						<>
							<button
								type="button"
								disabled={!formBar?.dirty || formBar.pending}
								onClick={() => formBar?.reset()}
								className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas disabled:opacity-50"
							>
								{tBar("cancel")}
							</button>
							<button
								type="submit"
								form={formId}
								disabled={!formBar?.canSave || formBar.pending}
								className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))] disabled:opacity-50"
							>
								{formBar?.pending && (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								)}
								{tManage("save")}
							</button>
						</>
					)}
				</div>
			</div>
			<Tabs value={tab} onValueChange={(value) => changeTab(value as Tab)}>
				<TabsList className="h-auto w-full justify-start gap-7 overflow-x-auto rounded-none border-line border-b bg-transparent p-0">
					<TabsTrigger value="profile" className={TRIGGER}>
						{tManage("tabProfile")}
					</TabsTrigger>
					{owner && (
						<TabsTrigger value="address" className={TRIGGER}>
							{tManage("tabAddress")}
						</TabsTrigger>
					)}
					<TabsTrigger value="contacts" className={TRIGGER}>
						{tManage("tabContacts")}
					</TabsTrigger>
					<TabsTrigger value="returns" className={TRIGGER}>
						{tManage("tabReturns")}
					</TabsTrigger>
					<TabsTrigger value="legal" className={TRIGGER}>
						{tManage("tabLegal")}
					</TabsTrigger>
					<TabsTrigger value="listings" className={TRIGGER}>
						{tManage("tabListings")}
					</TabsTrigger>
					{owner && (
						<TabsTrigger value="close" className={TRIGGER}>
							{tManage("tabClose")}
						</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="profile" className="mt-[18px] space-y-[18px]">
					<div className="max-w-4xl">
						{kindCard(
							<ShopProfileForm
								shopId={shop.id}
								profile={shop.profile}
								readOnly={suspended || !can(role, "settings.edit")}
							/>,
						)}
					</div>
					<div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_520px]">
						{card(
							tManage("tabProfile"),
							<ProfileForm
								shop={shop}
								categories={categories}
								formId={FORM_IDS.profile}
								onStateChange={onStateChange}
								onDraftChange={onDraftChange}
							/>,
						)}
						<div className="xl:sticky xl:top-4">
							<ShopPagePreview
								shop={shop}
								draft={draft}
								categoryNames={categoryNames}
							/>
						</div>
					</div>
				</TabsContent>
				{owner && (
					<TabsContent value="address" className="mt-[18px] max-w-4xl">
						{card(
							tManage("tabAddress"),
							<HandleForm shop={shop} role={role} />,
						)}
					</TabsContent>
				)}
				<TabsContent value="contacts" className="mt-[18px] max-w-4xl">
					{card(
						tManage("tabContacts"),
						<ContactsForm
							shop={shop}
							formId={FORM_IDS.contacts}
							onStateChange={onStateChange}
						/>,
					)}
				</TabsContent>
				<TabsContent value="returns" className="mt-[18px] max-w-4xl">
					{card(
						tManage("tabReturns"),
						<ReturnPolicyForm
							shop={shop}
							formId={FORM_IDS.returns}
							readOnly={!can(role, "settings.edit")}
							onStateChange={onStateChange}
						/>,
					)}
				</TabsContent>
				<TabsContent value="legal" className="mt-[18px] max-w-4xl">
					{card(
						tManage("tabLegal"),
						<LegalForm
							shop={shop}
							formId={FORM_IDS.legal}
							onStateChange={onStateChange}
						/>,
					)}
				</TabsContent>
				<TabsContent value="listings" className="mt-[18px] max-w-4xl">
					{card(
						tManage("tabListings"),
						<div className="space-y-3">
							<p className="text-ink-soft text-sm">
								{tManage("listingsBody", { count: personalListings })}
							</p>
							<Button
								onClick={() => setMoveOpen(true)}
								disabled={suspended}
								className="bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
							>
								{tManage("moveTitle")}
							</Button>
							{suspended && (
								<p className="text-bad-ink text-xs">
									{tManage("moveSuspended")}
								</p>
							)}
						</div>,
					)}
				</TabsContent>
				{owner && (
					<TabsContent value="close" className="mt-[18px] max-w-4xl">
						{card(
							tManage("tabClose"),
							<CloseShopForm shop={shop} role={role} />,
						)}
					</TabsContent>
				)}
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
