"use client";

import { Suspense } from "react";
import DashboardView from "@/components/DashboardView";
import Loader from "@/components/UI/Loader";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";

export default function DashboardPage() {
  const { validationError } = useValidateAccess();

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <Suspense fallback={<Loader />}>
      <DashboardView />
    </Suspense>
  );
}
