"use client";

import { forwardRef, useId } from "react";
import { m } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn, rangeProgress } from "@/lib/utils";

/* ==========================================================================
   Form primitives. Every one is a real labelled control — the glass styling is
   applied on top of native elements rather than replacing them, so keyboard
   navigation, form autofill and screen readers all keep working.
   ========================================================================== */

const FIELD_SHELL =
  "glass-subtle w-full rounded-2xl px-4 text-sm text-[color:var(--page-fg)] " +
  "transition-[border-color,background-color,box-shadow] duration-300 " +
  "hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent/40";

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-baseline justify-between gap-3 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--page-fg-muted)]"
    >
      <span>{children}</span>
      {hint !== undefined && (
        <span className="tabular text-xs font-bold normal-case tracking-normal text-accent-300">{hint}</span>
      )}
    </label>
  );
}

interface SelectProps extends React.ComponentPropsWithoutRef<"select"> {
  label: string;
  options: readonly string[] | readonly { value: string; label: string }[];
}

export function Select({ label, options, className, id, ...rest }: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={fieldId}
          className={cn(FIELD_SHELL, "h-11 appearance-none pe-10")}
          {...rest}
        >
          {options.map((option) =>
            typeof option === "string" ? (
              <option key={option} value={option}>
                {option}
              </option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-[color:var(--page-fg-muted)]"
        />
      </div>
    </div>
  );
}

interface TextFieldProps extends React.ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(FIELD_SHELL, "h-11", error && "border-rose-400/60 ring-1 ring-rose-400/40")}
        {...rest}
      />
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs font-medium text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
});

interface RangeFieldProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  label: string;
  value: number;
  min: number;
  max: number;
}

export function RangeField({ label, value, min, max, className, id, ...rest }: RangeFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <FieldLabel htmlFor={fieldId} hint={value}>
        {label}
      </FieldLabel>
      <input
        id={fieldId}
        type="range"
        value={value}
        min={min}
        max={max}
        // Drives the gradient fill on the track (see globals.css).
        style={{ "--range-progress": rangeProgress(value, min, max) } as React.CSSProperties}
        className="cursor-pointer"
        {...rest}
      />
    </div>
  );
}

/**
 * Floating-label field for the contact form: the label starts inside the input
 * and rises into the border on focus or when the field has content.
 */
interface FloatingFieldProps extends React.ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
  multiline?: boolean;
  rows?: number;
}

export function FloatingField({
  label,
  error,
  multiline = false,
  rows = 4,
  className,
  id,
  value,
  ...rest
}: FloatingFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const shared = {
    id: fieldId,
    value,
    placeholder: " ", // enables :placeholder-shown, which drives the label state
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${fieldId}-error` : undefined,
    className: cn(
      "peer glass-subtle w-full rounded-2xl px-4 pb-2.5 pt-6 text-sm text-[color:var(--page-fg)]",
      "transition-[border-color,background-color,box-shadow] duration-300 placeholder:text-transparent",
      "hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent/40",
      error && "border-rose-400/60 ring-1 ring-rose-400/40",
    ),
  } as const;

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <div className="relative">
        {multiline ? (
          <textarea
            rows={rows}
            {...shared}
            {...(rest as unknown as React.ComponentPropsWithoutRef<"textarea">)}
          />
        ) : (
          <input {...shared} {...rest} />
        )}
        <label
          htmlFor={fieldId}
          className={cn(
            "pointer-events-none absolute start-4 top-4 origin-[0_0] text-sm text-[color:var(--page-fg-muted)]",
            "transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            // Resting state (empty + unfocused) sits centred; otherwise it floats.
            "peer-placeholder-shown:top-4 peer-placeholder-shown:scale-100",
            "-translate-y-2 scale-[0.78] peer-focus:-translate-y-2 peer-focus:scale-[0.78] peer-focus:text-accent-300",
            "peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-[0.78]",
          )}
        >
          {label}
        </label>
      </div>
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="ps-1 text-xs font-medium text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Segmented control / tabs                                                  */
/* -------------------------------------------------------------------------- */
interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  /** Shared layoutId so the pill slides between tabs across instances. */
  layoutId: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  layoutId,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("glass inline-flex flex-wrap gap-1 rounded-full p-1.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full px-4 py-2 text-[0.8125rem] font-semibold transition-colors duration-300",
              active ? "text-white" : "text-[color:var(--page-fg-muted)] hover:text-[color:var(--page-fg)]",
            )}
          >
            {active && (
              // layoutId makes the highlight travel rather than cross-fade.
              <m.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-full"
                style={{ background: "linear-gradient(120deg, #5b5ff0, #22d3ee)" }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass-subtle inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-[color:var(--page-fg-muted)]">
      {children}
    </span>
  );
}

/** Thin progress meter used for reliability/coverage columns. */
export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <span
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/10"
      role="img"
      aria-label={label ?? `${value} out of 100`}
    >
      <m.span
        className="absolute inset-y-0 start-0 rounded-full"
        style={{ background: "linear-gradient(90deg, #5b5ff0, #22d3ee)" }}
        initial={{ width: 0 }}
        whileInView={{ width: `${value}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}
