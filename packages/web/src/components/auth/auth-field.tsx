"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Input, type InputProps } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

const INPUT =
	"h-12 rounded-2xl border-line bg-canvas px-4 text-[15px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] hover:border-line-strong focus-visible:scale-100 focus-visible:border-brand-bright focus-visible:ring-4 focus-visible:ring-brand-bright/15";
const INVALID =
	"border-bad bg-bad-faint/60 hover:border-bad focus-visible:border-bad focus-visible:ring-bad/15";

type AuthFieldProps = Omit<InputProps, "id"> & {
	id: string;
	label: string;
	error?: string;
	hint?: ReactNode;
	labelAside?: ReactNode;
};

/** A labelled input whose error is tied to it by aria-describedby. */
export function AuthField({
	id,
	label,
	error,
	hint,
	labelAside,
	className,
	...input
}: AuthFieldProps) {
	return (
		<FieldFrame
			id={id}
			label={label}
			error={error}
			hint={hint}
			labelAside={labelAside}
		>
			<Input
				id={id}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy(id, error, hint)}
				className={cn(INPUT, error && INVALID, className)}
				{...input}
			/>
		</FieldFrame>
	);
}

/** The same field with a show/hide toggle. */
export function PasswordField({
	id,
	label,
	error,
	hint,
	labelAside,
	className,
	...input
}: Omit<AuthFieldProps, "type">) {
	const t = useTranslations("Auth");
	const [visible, setVisible] = useState(false);
	return (
		<FieldFrame
			id={id}
			label={label}
			error={error}
			hint={hint}
			labelAside={labelAside}
		>
			<div className="relative">
				<Input
					id={id}
					type={visible ? "text" : "password"}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy(id, error, hint)}
					className={cn(INPUT, "pr-12", error && INVALID, className)}
					{...input}
				/>
				<button
					type="button"
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? t("hidePassword") : t("showPassword")}
					aria-pressed={visible}
					aria-controls={id}
					className="absolute inset-y-0 right-1.5 my-auto flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright"
				>
					{visible ? (
						<EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
					) : (
						<Eye aria-hidden="true" className="h-[18px] w-[18px]" />
					)}
				</button>
			</div>
		</FieldFrame>
	);
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
	const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(
		Boolean,
	);
	return ids.length ? ids.join(" ") : undefined;
}

function FieldFrame({
	id,
	label,
	error,
	hint,
	labelAside,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	hint?: ReactNode;
	labelAside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor={id} className="font-medium text-ink text-sm">
					{label}
				</Label>
				{labelAside}
			</div>
			{children}
			{hint && !error && (
				<div id={`${id}-hint`} className="text-ink-muted text-xs">
					{hint}
				</div>
			)}
			{error && (
				<p
					id={`${id}-error`}
					className="flex items-center gap-1.5 text-bad-ink-soft text-xs"
				>
					<AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
					{error}
				</p>
			)}
		</div>
	);
}

/** A form-level message: server errors, OAuth failures, success notes. */
export function AuthNotice({
	tone,
	children,
}: {
	tone: "error" | "success";
	children: ReactNode;
}) {
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={cn(
				"flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm",
				tone === "error"
					? "bg-bad-faint text-bad-ink-soft ring-1 ring-bad-line"
					: "bg-[#ECFDF5] text-[#047857] ring-1 ring-[#A7F3D0]",
			)}
		>
			{children}
		</div>
	);
}
