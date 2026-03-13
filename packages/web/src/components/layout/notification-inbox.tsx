"use client";

import { Inbox } from "@novu/nextjs";
import { useEffect, useState } from "react";
import { useAuth } from "~/hooks/use-auth";

interface NotificationInboxProps {
	applicationIdentifier: string;
}

export function NotificationInbox({
	applicationIdentifier,
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

	if (!user || !subscriberHash) return null;

	return (
		<Inbox
			applicationIdentifier={applicationIdentifier}
			subscriberId={user.id}
			subscriberHash={subscriberHash}
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
				elements: {
					bellIcon: {
						color: "#64748B",
					},
				},
			}}
		/>
	);
}
