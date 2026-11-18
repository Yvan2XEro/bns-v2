"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
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
import { Input } from "~/components/ui/input";
import { CLOSE_ANIMATION_MS, typedMatches } from "./callable";

export interface ConfirmProps {
	title: string;
	message?: ReactNode;
	/** Defaults to "Confirm"; name the action instead when there is one. */
	confirmLabel?: string;
	cancelLabel?: string;
	/** "danger" for what deletes, cancels or cannot be undone. */
	tone?: "default" | "danger";
	/**
	 * A word the person types before the confirm button wakes up, for what
	 * cannot be undone at all (an account deletion).
	 */
	typeToConfirm?: string;
}

/**
 * The in-page replacement for `window.confirm`: `await Confirm.call({...})`
 * resolves true on confirm, false on cancel, Escape or a click outside.
 * Mounted once by `CallableRoots`.
 */
export const Confirm = createCallable<ConfirmProps, boolean>(
	({
		call,
		title,
		message,
		confirmLabel,
		cancelLabel,
		tone,
		typeToConfirm,
	}) => {
		const t = useTranslations("Common");
		const [typed, setTyped] = useState("");
		const typedId = useId();
		const ready = !typeToConfirm || typedMatches(typed, typeToConfirm);

		return (
			<Dialog
				open={!call.ended}
				onOpenChange={(open) => {
					if (!open) call.end(false);
				}}
			>
				<DialogContent role="alertdialog" className="max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{message ? (
							<DialogDescription>{message}</DialogDescription>
						) : (
							<DialogDescription className="sr-only">{title}</DialogDescription>
						)}
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (ready) call.end(true);
						}}
					>
						{typeToConfirm && (
							<div className="space-y-1.5 text-sm">
								<label htmlFor={typedId} className="block text-ink-soft">
									{t("typeToConfirm", { word: typeToConfirm })}
								</label>
								<Input
									id={typedId}
									autoFocus
									autoComplete="off"
									value={typed}
									onChange={(event) => setTyped(event.target.value)}
								/>
							</div>
						)}
						<DialogFooter className="gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => call.end(false)}
							>
								{cancelLabel ?? t("cancel")}
							</Button>
							<Button
								type="submit"
								autoFocus={!typeToConfirm}
								disabled={!ready}
								className={
									tone === "danger"
										? "bg-red-600 text-white shadow-none hover:bg-red-700 hover:brightness-100"
										: undefined
								}
							>
								{confirmLabel ?? t("confirm")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		);
	},
	CLOSE_ANIMATION_MS,
);
