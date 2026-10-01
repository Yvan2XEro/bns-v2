"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useInviteMember } from "~/hooks/use-shop-team";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import {
	assignableRoles,
	type InviteFormValues,
	inviteSchema,
} from "~/lib/team-form";
import { cn } from "~/lib/utils";
import type { ShopRole } from "~/types";
import { InviteChannelField } from "./invite-channel-field";

/** The three codes a field, rather than the form, is wrong about. */
const FIELD_CODES: readonly string[] = [
	ERROR_CODES.teamCannotInviteSelf,
	ERROR_CODES.teamAlreadyMember,
	ERROR_CODES.teamInvitationPending,
];

export function InviteDialog({
	shopId,
	role,
	open,
	onClose,
}: {
	shopId: string;
	role: ShopRole | null;
	open: boolean;
	onClose: () => void;
}) {
	const t = useTranslations("Team");
	const tRoot = useTranslations();
	const invite = useInviteMember(shopId);
	const roles = assignableRoles(role);
	const [delivered, setDelivered] = useState<boolean | null>(null);

	const form = useForm<InviteFormValues>({
		resolver: zodResolver(inviteSchema),
		mode: "onChange",
		defaultValues: {
			channel: "phone",
			phone: "",
			email: "",
			role: roles[0] ?? "staff",
		},
	});

	const channel = form.watch("channel");

	const close = () => {
		form.reset();
		setDelivered(null);
		onClose();
	};

	const onSubmit = form.handleSubmit(async (values) => {
		setDelivered(null);
		try {
			const result = await invite.mutateAsync(
				values.channel === "phone"
					? { channel: "phone", phone: values.phone, role: values.role }
					: { channel: "email", email: values.email, role: values.role },
			);
			if (!result.delivered) {
				setDelivered(false);
				return;
			}
			close();
		} catch (error) {
			const code = error instanceof ApiError ? error.code : null;
			if (code && FIELD_CODES.includes(code)) {
				form.setError(values.channel === "phone" ? "phone" : "email", {
					type: "server",
					message: resolveErrorMessage(error, tRoot),
				});
				return;
			}
			form.setError("root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot),
			});
		}
	});

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("inviteTitle")}</DialogTitle>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					{delivered === false ? (
						<p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 text-sm">
							{t("deliveredFalse")}
						</p>
					) : (
						<>
							<div
								role="tablist"
								aria-label={t("inviteTitle")}
								className="grid grid-cols-2 gap-1 rounded-lg bg-[#F1F5F9] p-1"
							>
								{(["phone", "email"] as const).map((option) => (
									<button
										key={option}
										type="button"
										role="tab"
										aria-selected={channel === option}
										onClick={() =>
											form.setValue("channel", option, {
												shouldValidate: true,
											})
										}
										className={cn(
											"rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
											channel === option
												? "bg-white text-[#0F172A] shadow-sm"
												: "text-[#64748B]",
										)}
									>
										{t(option === "phone" ? "channelPhone" : "channelEmail")}
									</button>
								))}
							</div>

							<InviteChannelField
								channel={channel}
								control={form.control}
								errors={form.formState.errors}
								register={form.register}
							/>

							<div className="space-y-1.5">
								<Label htmlFor="invite-role">{t("roleLabel")}</Label>
								<Controller
									control={form.control}
									name="role"
									render={({ field }) => (
										<>
											<Select
												value={field.value}
												onValueChange={field.onChange}
											>
												<SelectTrigger id="invite-role">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{roles.map((option) => (
														<SelectItem key={option} value={option}>
															{t(
																option === "manager"
																	? "roleManager"
																	: "roleStaff",
															)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<p className="text-[#64748B] text-xs">
												{t(
													field.value === "manager"
														? "roleManagerDescription"
														: "roleStaffDescription",
												)}
											</p>
										</>
									)}
								/>
							</div>
						</>
					)}

					{form.formState.errors.root?.message && (
						<p
							role="alert"
							className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
						>
							{form.formState.errors.root.message}
						</p>
					)}

					<DialogFooter>
						{delivered === false ? (
							<Button type="button" onClick={close}>
								{tRoot("Common.close")}
							</Button>
						) : (
							<>
								<Button type="button" variant="outline" onClick={close}>
									{tRoot("Common.cancel")}
								</Button>
								<Button
									type="submit"
									disabled={!form.formState.isValid || invite.isPending}
								>
									{t("send")}
								</Button>
							</>
						)}
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
