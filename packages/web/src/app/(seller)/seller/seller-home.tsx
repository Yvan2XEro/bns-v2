"use client";

import {
	BookOpen,
	ChevronRight,
	Lightbulb,
	MessageCircle,
	MessagesSquare,
	Phone,
	PlusCircle,
	Rocket,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BoostDialog } from "~/components/listing/boost-dialog";
import { SetupChecklist } from "~/components/seller/setup-checklist";
import { ShareShopButton } from "~/components/shop/share-shop-button";
import { useSellerHome } from "~/hooks/use-shop-onboarding";
import {
	launchTarget,
	type SellerHomeTarget,
	tipTarget,
	whatsappShareUrl,
} from "~/lib/seller-home";
import { shopUrl } from "~/lib/shop-url";
import type {
	LaunchActionKey,
	SellerTipKey,
} from "../../../../../api/src/contracts/sellerOnboarding";
import {
	type PendingProps,
	RecentOrders,
	SellerTodayCards,
	WeekStats,
} from "./today-cards";

const LAUNCH_ICONS: Record<LaunchActionKey, typeof Rocket> = {
	shareWhatsapp: MessageCircle,
	boost: Rocket,
	addProducts: PlusCircle,
	verify: ShieldCheck,
	addWhatsapp: Phone,
	replyFast: MessagesSquare,
};

export function useShareMessage(handle: string, name: string) {
	const t = useTranslations("SellerHome");
	return t("shareMessage", { shop: name, url: shopUrl(handle) });
}

/**
 * One target, rendered as whatever it needs to be: a link, a WhatsApp link
 * that opens in a new tab, or the boost dialog's trigger.
 */
export function TargetLink({
	target,
	shareMessage,
	className,
	children,
}: {
	target: SellerHomeTarget;
	shareMessage: string;
	className: string;
	children: ReactNode;
}) {
	switch (target.kind) {
		case "route":
			return (
				<Link href={target.href} className={className}>
					{children}
				</Link>
			);
		case "whatsapp":
			return (
				<a
					href={whatsappShareUrl(shareMessage)}
					target="_blank"
					rel="noopener noreferrer"
					className={className}
				>
					{children}
				</a>
			);
		case "boost":
			return (
				<BoostDialog listingId={target.listingId}>
					<button type="button" className={`${className} w-full text-left`}>
						{children}
					</button>
				</BoostDialog>
			);
		case "none":
			return null;
	}
}

function LaunchCard({
	actions,
	facts,
	handle,
	name,
}: {
	actions: LaunchActionKey[];
	facts: Parameters<typeof launchTarget>[1];
	handle: string;
	name: string;
}) {
	const t = useTranslations("SellerHome");
	const message = useShareMessage(handle, name);
	return (
		<section
			aria-labelledby="launch-title"
			className="rounded-xl border border-[#E2E8F0] bg-white p-5"
		>
			<h2 id="launch-title" className="font-bold text-[#0F172A] text-[17px]">
				{t("launchTitle")}
			</h2>
			<p className="mt-1 text-[#334155] text-sm">{t("launchBody")}</p>
			<ul className="mt-3 grid gap-2 md:grid-cols-2">
				{actions.map((action, index) => {
					const Icon = LAUNCH_ICONS[action];
					return (
						<li key={action}>
							<TargetLink
								target={launchTarget(action, facts)}
								shareMessage={message}
								className="flex h-full min-h-16 items-center gap-3 rounded-lg border border-[#E2E8F0] p-3 hover:border-[var(--shop-accent-border,#BFDBFE)] hover:bg-[#F8FAFC]"
							>
								<span
									className={
										index === 0
											? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#DCFCE7] text-[#166534]"
											: "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--shop-accent-soft,#DBEAFE)] text-[var(--shop-accent-text,#1E40AF)]"
									}
								>
									<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-semibold text-[#0F172A] text-sm">
										{t(`launch.${action}.title`)}
									</span>
									<span className="block text-[#64748B] text-xs">
										{t(`launch.${action}.body`)}
									</span>
								</span>
								<ChevronRight
									aria-hidden="true"
									className="h-4 w-4 shrink-0 text-[#94A3B8]"
								/>
							</TargetLink>
						</li>
					);
				})}
			</ul>
			{actions.includes("shareWhatsapp") && (
				<div className="mt-3">
					<ShareShopButton handle={handle} name={name} label={t("moreShare")} />
				</div>
			)}
		</section>
	);
}

function TipCard({
	tip,
	facts,
	handle,
	name,
	onDismiss,
}: {
	tip: SellerTipKey;
	facts: Parameters<typeof tipTarget>[1];
	handle: string;
	name: string;
	onDismiss: () => void;
}) {
	const t = useTranslations("SellerHome");
	const message = useShareMessage(handle, name);
	return (
		<aside
			aria-labelledby="seller-tip-title"
			className="flex flex-col gap-2 rounded-xl border border-[var(--shop-accent-border,#BFDBFE)] bg-[var(--shop-accent-soft,#EFF6FF)] p-4"
		>
			<span className="inline-flex items-center gap-1.5 font-bold text-[var(--shop-accent-text,#1E40AF)] text-xs uppercase tracking-[0.4px]">
				<Lightbulb aria-hidden="true" className="h-4 w-4" />
				{t("tipLabel")}
			</span>
			<h2
				id="seller-tip-title"
				className="font-semibold text-[#0F172A] text-[15px]"
			>
				{t(`tip.${tip}.title`)}
			</h2>
			<p className="text-[#334155] text-sm leading-5">{t(`tip.${tip}.body`)}</p>
			<div className="flex flex-wrap items-center gap-2 pt-1">
				<TargetLink
					target={tipTarget(tip, facts)}
					shareMessage={message}
					className="inline-flex h-9 items-center rounded-lg bg-[var(--shop-accent,#1E40AF)] px-3 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,#1E3A8A)]"
				>
					{t(`tip.${tip}.action`)}
				</TargetLink>
				<button
					type="button"
					onClick={onDismiss}
					className="h-9 rounded-lg px-3 font-semibold text-[#334155] text-sm hover:bg-white/60"
				>
					{t("tipDismiss")}
				</button>
			</div>
		</aside>
	);
}

export function SellerGuideLink() {
	const t = useTranslations("SellerGuide");
	return (
		<Link
			href="/seller/guide"
			className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 hover:bg-[#F8FAFC]"
		>
			<span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F1F5F9] text-[#475569]">
				<BookOpen aria-hidden="true" className="h-[18px] w-[18px]" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-[#0F172A] text-sm">
					{t("title")}
				</span>
				<span className="block text-[#64748B] text-xs">{t("entryBody")}</span>
			</span>
			<ChevronRight aria-hidden="true" className="h-4 w-4 text-[#94A3B8]" />
		</Link>
	);
}

/**
 * The dashboard below its header, arranged by the shop's stage (Shopify's
 * lesson: setup tasks before metrics). Setting up: the checklist. Nothing
 * sold yet: what brings a first buyer. Active: the work queue and figures,
 * the checklist folded to one line. Empty "to handle" cards are left out
 * until the shop is active, since a row of zeroes teaches nothing.
 */
export function SellerHome({
	handle,
	name,
	pending,
	showOrders,
	aside,
}: {
	handle: string;
	name: string;
	pending: PendingProps;
	showOrders: boolean;
	/** The verification nudge, when the page decided to show it. */
	aside: ReactNode;
}) {
	const home = useSellerHome(pending.shopId);
	const model = home.model;

	if (home.query.isPending) {
		return (
			<div className="space-y-4" aria-busy="true">
				<span className="block h-24 rounded-xl bg-[#F1F5F9] motion-safe:animate-pulse" />
				<span className="block h-48 rounded-xl bg-[#F1F5F9] motion-safe:animate-pulse" />
			</div>
		);
	}

	// No facts (an error): the dashboard as it was, plus the guide.
	const stage = model?.stage ?? "active";
	const active = stage === "active";
	const tip = model?.tip ? (
		<TipCard
			tip={model.tip}
			facts={model.facts}
			handle={handle}
			name={name}
			onDismiss={() => model.tip && home.dismissTip(model.tip)}
		/>
	) : null;

	return (
		<div className="space-y-[22px]">
			<SellerTodayCards {...pending} hideWhenEmpty={!active} />
			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0 space-y-4">
					{model && model.mode !== "hidden" && (
						<SetupChecklist
							steps={model.steps}
							mode={model.mode}
							onDismiss={home.dismissChecklist}
						/>
					)}
					{model && model.actions.length > 0 && (
						<LaunchCard
							actions={model.actions}
							facts={model.facts}
							handle={handle}
							name={name}
						/>
					)}
					{active && showOrders && <RecentOrders shopId={pending.shopId} />}
				</div>
				<div className="flex flex-col gap-4">
					{active && showOrders && <WeekStats shopId={pending.shopId} />}
					{aside}
					{tip}
					<SellerGuideLink />
				</div>
			</div>
		</div>
	);
}
