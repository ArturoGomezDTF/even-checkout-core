"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { useScrollLock } from "../lib/use-scroll-lock";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Acciones al pie (normalmente uno o dos <Button fullWidth />). */
  footer?: ReactNode;
  /** Cerrar al tocar el fondo. Por defecto true. */
  dismissible?: boolean;
  /** Clases del panel blanco. */
  className?: string;
  /** Requerido si no hay `title`, para que el diálogo tenga nombre accesible. */
  "aria-label"?: string;
};

/**
 * Bottom sheet de Even: panel blanco que sube desde abajo sobre un fondo oscuro.
 * Bloquea el scroll del body, cierra con Escape y devuelve el foco al cerrar.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
  "aria-label": ariaLabel,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-[99999] flex animate-fade-in items-end justify-center bg-black/50"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className={cn(
          "mx-4 max-h-[90dvh] w-full animate-slide-up overflow-y-auto rounded-t-4xl bg-white text-black shadow-xl outline-none md:mx-6 lg:mx-8",
          className,
        )}
      >
        <div className="mx-auto max-w-2xl p-6 md:p-8 lg:p-10">
          {title && (
            <h2
              id={titleId}
              className="mb-4 text-center text-2xl font-semibold md:mb-5 md:text-3xl lg:mb-6 lg:text-4xl"
            >
              {title}
            </h2>
          )}
          {description && (
            <p id={descriptionId} className="text-center text-base text-gray-600 md:text-lg lg:text-xl">
              {description}
            </p>
          )}
          {children && <div className={cn(description && "mt-4 md:mt-5 lg:mt-6")}>{children}</div>}
          {footer && <div className="mt-6 flex flex-col gap-3 md:mt-8 lg:mt-10">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
