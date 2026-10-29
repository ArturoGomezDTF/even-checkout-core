import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

type ChoiceProps = Omit<ComponentProps<"input">, "type"> & {
  /** Texto junto al control. Sin label, pasa `aria-label`. */
  label?: ReactNode;
  containerClassName?: string;
};

// Reemplaza las clases .mycheckbox/.myradio de cada app.
const checkboxClasses = cn(
  "relative size-5 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-full border border-gray-300 bg-gray-100",
  "checked:border-even-grass checked:bg-even-grass",
  "after:absolute after:top-[45%] after:left-1/2 after:hidden after:h-[9px] after:w-[5px] after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45",
  "after:border-r-[2.5px] after:border-b-[2.5px] after:border-even-evergreen checked:after:block",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-even-evergreen",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

const radioClasses = cn(
  "relative size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-gray-300 bg-gray-100",
  "checked:border-transparent checked:bg-even-grass",
  "before:absolute before:inset-0 before:m-auto before:hidden before:size-1.5 before:rounded-full before:bg-white checked:before:block",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-even-evergreen",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

function Choice({
  type,
  label,
  containerClassName,
  className,
  controlClasses,
  ...props
}: ChoiceProps & { type: "checkbox" | "radio"; controlClasses: string }) {
  const control = <input type={type} className={cn(controlClasses, className)} {...props} />;
  if (!label) return control;
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-3 text-base text-even-evergreen has-disabled:cursor-not-allowed has-disabled:opacity-60",
        containerClassName,
      )}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}

export type CheckboxProps = ChoiceProps;

export function Checkbox(props: CheckboxProps) {
  return <Choice type="checkbox" controlClasses={checkboxClasses} {...props} />;
}

export type RadioProps = ChoiceProps;

export function Radio(props: RadioProps) {
  return <Choice type="radio" controlClasses={radioClasses} {...props} />;
}
