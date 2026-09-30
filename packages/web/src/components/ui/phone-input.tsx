"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ComponentProps, forwardRef } from "react";
import RPNInput, {
	type Country,
	getCountryCallingCode,
} from "react-phone-number-input";
import en from "react-phone-number-input/locale/en.json";
import fr from "react-phone-number-input/locale/fr.json";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "~/components/ui/select";
import {
	DEFAULT_PHONE_COUNTRY,
	emitPhone,
	readStoredPhone,
} from "~/lib/phone-input";
import { cn } from "~/lib/utils";

/**
 * The one phone control: every phone field gated behind the OTP flow goes
 * through it. **It emits E.164 and nothing else** — `normalizePhoneNumber` in
 * `packages/api/src/services/phoneVerification.ts` accepts only
 * `^\+[1-9]\d{7,14}$`, so a looser shape here would let a seller submit
 * something the server refuses with no clue what shape was wanted.
 *
 * It takes `value`/`onChange` rather than being spread onto an `<input>`
 * because the conversion runs both ways: the form spells "empty" as `""`
 * while the library reports it as `undefined` (`emitPhone`), and a value
 * already on file must be *read* through `parsePhoneNumber` so it displays
 * nationally under its own country (`readStoredPhone`) — see
 * `~/lib/phone-input.ts` for both, and why they are pure functions rather
 * than inline here.
 *
 * Country picker: a Radix `Select` rather than a ported `Command`+`Popover`.
 * This package has neither installed, and a fuzzy-search command palette for
 * ~240 countries is more control than a marketplace whose numbers are
 * overwhelmingly `+237` needs; `Select`'s built-in type-ahead (press a
 * letter to jump) is enough, and it keeps this component's dependency
 * footprint to the phone library alone.
 */

const LOCALES: Record<string, Record<string, string>> = { en, fr };

/** The regional-indicator pair for a country code, not `react-phone-number-input/flags`: that module ships ~180KB of inline SVG for 272 countries that a `+237`-heavy app would load in full to draw one. */
const flagOf = (country: string): string =>
	String.fromCodePoint(
		...[...country.toUpperCase()].map(
			(letter) => 0x1f1e6 + letter.charCodeAt(0) - 65,
		),
	);

/** `react-phone-number-input` passes the number input every prop it does not consume itself (id, placeholder, aria-*, disabled...). */
const PhoneTextInput = forwardRef<
	HTMLInputElement,
	ComponentProps<typeof Input>
>(function PhoneTextInput({ className, ...props }, ref) {
	return (
		<Input
			ref={ref}
			type="tel"
			inputMode="tel"
			autoComplete="tel"
			className={cn(
				"h-full rounded-l-none border-0 bg-transparent focus-visible:scale-100 focus-visible:bg-transparent focus-visible:ring-0",
				className,
			)}
			{...props}
		/>
	);
});

interface CountrySelectProps {
	readonly value?: Country;
	readonly options: readonly { value?: Country; label: string }[];
	readonly onChange: (country: Country) => void;
	readonly disabled?: boolean;
	readonly readOnly?: boolean;
}

/**
 * `options` comes from `react-phone-number-input`, and its first entry can
 * carry no `value` (the "international" row, removed below by
 * `addInternationalOption={false}`); the filter keeps that honest rather
 * than asserting the row away.
 */
function CountrySelect({
	value,
	options,
	onChange,
	disabled,
	readOnly,
}: CountrySelectProps) {
	const t = useTranslations("PhoneVerification");
	const locale = useLocale();
	const labels = LOCALES[locale] ?? fr;
	const countries = options.filter(
		(option): option is { value: Country; label: string } =>
			option.value !== undefined,
	);
	const selected = value ?? DEFAULT_PHONE_COUNTRY;

	return (
		<Select
			value={selected}
			onValueChange={(next) => onChange(next as Country)}
			disabled={disabled === true || readOnly === true}
		>
			<SelectTrigger
				aria-label={`${t("country")} : ${labels[selected] ?? selected}`}
				className="h-full w-auto shrink-0 gap-1 rounded-r-none border-0 border-[#DBEAFE] border-r bg-transparent px-3 shadow-none focus:ring-0"
			>
				<span aria-hidden="true">{flagOf(selected)}</span>
				<span className="text-[#64748B] text-xs tabular-nums">
					+{getCountryCallingCode(selected)}
				</span>
			</SelectTrigger>
			<SelectContent>
				{countries.map((country) => (
					<SelectItem key={country.value} value={country.value}>
						<span className="flex items-center gap-2">
							<span aria-hidden="true">{flagOf(country.value)}</span>
							<span className="flex-1 truncate">{country.label}</span>
							<span className="text-[#94A3B8] text-xs tabular-nums">
								+{getCountryCallingCode(country.value)}
							</span>
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const PhoneInputContainer = forwardRef<HTMLDivElement, ComponentProps<"div">>(
	function PhoneInputContainer({ className, ...props }, ref) {
		return (
			<div
				ref={ref}
				className={cn(
					"flex h-10 w-full items-stretch overflow-hidden rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] transition-all duration-200 focus-within:scale-[1.01] focus-within:border-[#3B82F6] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#3B82F6]/20",
					className,
				)}
				{...props}
			/>
		);
	},
);

export interface PhoneInputProps
	extends Omit<
		ComponentProps<typeof Input>,
		"value" | "onChange" | "type" | "ref"
	> {
	/** The form's value: E.164, or `""` for an empty control. Never `null` — see the header. */
	readonly value: string;
	readonly onChange: (value: string) => void;
}

export function PhoneInput({ value, onChange, ...props }: PhoneInputProps) {
	const locale = useLocale();
	const labels = LOCALES[locale] ?? fr;

	return (
		<RPNInput
			/*
			 * National display, E.164 value: with `international` the field's
			 * text *is* the international number, so typing over it replaces the
			 * calling code instead of following it. Nationally the same
			 * keystrokes produce the full E.164 value, and the calling code is
			 * not missing from the screen — the country trigger carries it,
			 * once, where it belongs.
			 */
			initialValueFormat="national"
			/* Off: a number with no country cannot be formatted, and E.164 needs one. */
			addInternationalOption={false}
			defaultCountry={DEFAULT_PHONE_COUNTRY}
			labels={labels}
			containerComponent={PhoneInputContainer}
			countrySelectComponent={CountrySelect}
			inputComponent={PhoneTextInput}
			value={readStoredPhone(value)}
			onChange={(next) => onChange(emitPhone(next))}
			{...props}
		/>
	);
}
