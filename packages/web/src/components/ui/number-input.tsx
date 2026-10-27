"use client";

import { useLocale } from "next-intl";
import * as React from "react";
import {
	type Control,
	type FieldPath,
	type FieldValues,
	useController,
} from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { digitsOf, groupSeparator } from "~/lib/number-format";
import { cn } from "~/lib/utils";
import { Input, type InputProps } from "./input";

export interface NumberInputProps
	extends Omit<InputProps, "value" | "defaultValue" | "onChange" | "type"> {
	/** Digits only ("1250000"); "" for an empty field. */
	value: string;
	onValueChange: (digits: string) => void;
	/** Shown inside the field, after the number: a currency, "h", "j"… */
	unit?: string;
	/** A bare input styled by `className` alone, e.g. a table cell. */
	plain?: boolean;
}

/**
 * A whole number typed the way it reads: "1 250 000" in French, "1,250,000"
 * in English, grouped as the seller types with the caret kept in place. The
 * form only ever sees the digits, so its parsing and validation are
 * unchanged. Not for codes (OTP, barcode): those are not quantities.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
	({ value, onValueChange, unit, plain, className, ...props }, ref) => {
		const locale = useLocale();
		const input = (
			<NumericFormat
				{...props}
				getInputRef={ref}
				customInput={plain ? undefined : Input}
				value={value}
				valueIsNumericString
				onValueChange={(values) => onValueChange(digitsOf(values.value))}
				thousandSeparator={groupSeparator(locale)}
				decimalScale={0}
				allowNegative={false}
				allowLeadingZeros={false}
				inputMode="numeric"
				autoComplete="off"
				className={cn("tabular-nums", unit && "pr-14", className)}
			/>
		);
		if (!unit) return input;
		return (
			<div className="relative">
				{input}
				<span
					aria-hidden="true"
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-ink-muted text-xs"
				>
					{unit}
				</span>
			</div>
		);
	},
);
NumberInput.displayName = "NumberInput";

/** A `NumberInput` bound to a react-hook-form field holding a digit string. */
export function FormNumberInput<
	TValues extends FieldValues,
	TName extends FieldPath<TValues>,
	TContext,
	// A form whose resolver transforms its values (e.g. digits into a number).
	TTransformed = TValues,
>({
	control,
	name,
	...props
}: Omit<NumberInputProps, "value" | "onValueChange" | "name"> & {
	control: Control<TValues, TContext, TTransformed>;
	name: TName;
}) {
	const { field } = useController<TValues, TName, TTransformed>({
		control,
		name,
	});
	return (
		<NumberInput
			{...props}
			ref={field.ref}
			name={field.name}
			value={digitsOf(field.value)}
			onValueChange={field.onChange}
			onBlur={(event) => {
				field.onBlur();
				props.onBlur?.(event);
			}}
			disabled={props.disabled ?? field.disabled}
		/>
	);
}
