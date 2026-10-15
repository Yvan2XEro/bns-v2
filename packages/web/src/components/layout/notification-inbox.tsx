"use client";

import { type BellRenderer, Inbox } from "@novu/nextjs";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "~/hooks/use-auth";
import { cn } from "~/lib/utils";

type UnreadCount = Parameters<BellRenderer>[0];

interface NotificationInboxProps {
	applicationIdentifier: string;
	/** Visible under the icon from xl, like the header's other icons. */
	label: string;
	/** The header icons' colour classes, so the bell matches them in a shop too. */
	tone: string;
}

/** Drawn like the header's Favoris / Messages icons, with the same red count. */
function HeaderBell({
	label,
	tone,
	count,
}: {
	label: string;
	tone: string;
	count: number;
}) {
	return (
		<span
			className={cn(
				"flex h-10 min-w-10 cursor-pointer flex-col items-center justify-center rounded-lg px-1.5 text-[11px]",
				tone,
			)}
		>
			<span className="relative">
				<Bell aria-hidden="true" className="h-5 w-5" />
				{count > 0 && (
					<span className="-top-1.5 -right-2 absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
						{count > 99 ? "99+" : count}
					</span>
				)}
			</span>
			<span className="sr-only xl:not-sr-only">{label}</span>
		</span>
	);
}

function unreadTotal(unread: UnreadCount): number {
	if (typeof unread === "number") return unread;
	return unread?.total ?? 0;
}

export function NotificationInbox({
	applicationIdentifier,
	label,
	tone,
}: NotificationInboxProps) {
	const { user } = useAuth();
	const [subscriberHash, setSubscriberHash] = useState<string | null>(null);

	useEffect(() => {
		if (!user) return;

		fetch("/api/public/novu/subscriber-hash", { credentials: "include" })
			.then((res) => res.json())
			.then((data) => setSubscriberHash(data.subscriberHash))
			.catch(console.error);
	}, [user]);

	if (!user || !subscriberHash)
		return <HeaderBell label={label} tone={tone} count={0} />;

	return (
		<Inbox
			applicationIdentifier={applicationIdentifier}
			subscriberId={user.id}
			subscriberHash={subscriberHash}
			renderBell={(unread) => (
				<HeaderBell label={label} tone={tone} count={unreadTotal(unread)} />
			)}
			appearance={{
				variables: {
					colorPrimary: "#1E40AF",
					colorPrimaryForeground: "#ffffff",
					colorSecondary: "#f1f5f9",
					colorSecondaryForeground: "#1E40AF",
					colorCounter: "#dc2626",
					colorCounterForeground: "#ffffff",
					colorBackground: "#ffffff",
					colorForeground: "#0f172a",
					colorNeutral: "#e2e8f0",
					fontSize: "14px",
				},
			}}
		/>
	);
}
