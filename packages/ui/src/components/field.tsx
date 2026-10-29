"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn";

type FieldOwnProps = {
  label?: ReactNode;
  /** Texto de ayuda bajo el campo. Se oculta si hay error. */
  hint?: ReactNode;
  /** Mensaje de error. Marca el campo como inválido. */
  error?: ReactNode;
};

const controlClasses = cn(
  "w-full rounded-lg border border-stroke-soft bg-white/70 px-3 text-base text-gray-700 placeholder:text-gray-400",
  "focus:outline-none focus:ring-2 focus:ring-even-evergreen",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:focus:ring-danger",
);

function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const generated = useId();
  const controlId = id ?? generated;
  const messageId = error || hint ? `${controlId}-message` : undefined;
  return { controlId, messageId };
}

function FieldShell({
  controlId,
  messageId,
  label,
  hint,
  error,
  className,
  children,
}: FieldOwnProps & { controlId: string; messageId?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={controlId} className="text-sm font-medium text-even-evergreen">
          {label}
        </label>
      )}
      {children}
      {messageId && (
        <p id={messageId} className={cn("text-xs", error ? "text-danger" : "text-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export type InputProps = ComponentProps<"input"> &
  FieldOwnProps & {
    /** Icono dentro del campo, a la izquierda (p. ej. un icono de lucide-react). */
    leadingIcon?: ReactNode;
    /** Clases del contenedor (label + campo + mensaje). `className` va al <input>. */
    containerClassName?: string;
  };

export function Input({
  id,
  label,
  hint,
  error,
  leadingIcon,
  containerClassName,
  className,
  ...props
}: InputProps) {
  const { controlId, messageId } = useFieldIds(id, hint, error);
  return (
    <FieldShell
      controlId={controlId}
      messageId={messageId}
      label={label}
      hint={hint}
      error={error}
      className={containerClassName}
    >
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 text-gray-400 [&>svg]:size-4">
            {leadingIcon}
          </span>
        )}
        <input
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={cn(controlClasses, "h-12", leadingIcon && "pl-10", className)}
          {...props}
        />
      </div>
    </FieldShell>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & FieldOwnProps & { containerClassName?: string };

export function Textarea({ id, label, hint, error, containerClassName, className, ...props }: TextareaProps) {
  const { controlId, messageId } = useFieldIds(id, hint, error);
  return (
    <FieldShell
      controlId={controlId}
      messageId={messageId}
      label={label}
      hint={hint}
      error={error}
      className={containerClassName}
    >
      <textarea
        id={controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(controlClasses, "h-24 resize-none bg-surface py-2 md:h-28 md:py-3", className)}
        {...props}
      />
    </FieldShell>
  );
}
