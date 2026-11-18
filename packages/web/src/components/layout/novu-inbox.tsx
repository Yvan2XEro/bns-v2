"use client";

import { type BellRenderer, Inbox } from "@novu/nextjs";
import type { ReactNode } from "react";
import type { NovuEndpoints } from "../../../../api/src/contracts/novuEndpoints";

type UnreadCount = Parameters<BellRenderer>[0];

function unreadTotal(unread: UnreadCount): number {
	if (typeof unread === "number") return unread;
	return unread?.total ?? 0;
}

/**
 * Novu's inbox, in its own module so `NotificationInbox` can load it only for
 * a signed-in visitor: it is the heaviest library on the page. Its colours are
 * the theme's tokens — Novu derives every shade in CSS, so it follows dark mode.
 */
export default function NovuInbox({
	novu,
	subscriberId,
	subscriberHash,
	renderBell,
}: {
	novu: NovuEndpoints;
	subscriberId: string;
	subscriberHash: string;
	renderBell: (count: number) => ReactNode;
}) {
	return (
		<Inbox
			applicationIdentifier={novu.applicationIdentifier}
			// Unset: Novu Cloud; set for a self-hosted instance.
			backendUrl={novu.apiUrl ?? undefined}
			socketUrl={novu.socketUrl ?? undefined}
			subscriberId={subscriberId}
			subscriberHash={subscriberHash}
			renderBell={(unread) => renderBell(unreadTotal(unread))}
			appearance={{
				variables: {
					colorPrimary: "var(--c-brand)",
					colorPrimaryForeground: "#ffffff",
					colorSecondary: "var(--c-subtle)",
					colorSecondaryForeground: "var(--c-brand)",
					colorCounter: "#dc2626",
					colorCounterForeground: "#ffffff",
					colorBackground: "var(--c-surface)",
					colorForeground: "var(--c-ink)",
					colorNeutral: "var(--c-line)",
					fontSize: "14px",
				},
			}}
		/>
	);
}
