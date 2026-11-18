"use client";

import { useTranslations } from "next-intl";
import { createCallable } from "react-call";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { CLOSE_ANIMATION_MS } from "./callable";

export interface NoticeProps {
	title: string;
	message?: string;
}

/**
 * The in-page replacement for `window.alert`: `await Notice.call({...})`
 * resolves once the person closes it. Mounted once by `CallableRoots`.
 */
export const Notice = createCallable<NoticeProps, void>(
	({ call, title, message }) => {
		const t = useTranslations("Common");

		return (
			<Dialog
				open={!call.ended}
				onOpenChange={(open) => {
					if (!open) call.end();
				}}
			>
				<DialogContent role="alertdialog" className="max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription className={message ? undefined : "sr-only"}>
							{message ?? title}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" autoFocus onClick={() => call.end()}>
							{t("ok")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	},
	CLOSE_ANIMATION_MS,
);
