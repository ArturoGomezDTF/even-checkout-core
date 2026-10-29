"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardView from "@/app/components/DashboardView";
import Loader from "@/app/components/UI/Loader";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";

function DashboardContent() {
  const { validationError, isValidating } = useValidateAccess();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab") as
    | "profile"
    | "cards"
    | "history"
    | "support"
    | null;

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  if (isValidating) {
    return <Loader />;
  }

  return <DashboardView initialTab={tab || undefined} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loader />}>
      <DashboardContent />
    </Suspense>
  );
}
