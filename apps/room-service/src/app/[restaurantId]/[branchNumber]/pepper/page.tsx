"use client";

import { useRouter } from "next/navigation";
import ChatView from "@/components/ChatView";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";

export default function PepperPage() {
  const { validationError } = useValidateAccess();
  const router = useRouter();

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  const handleBack = () => {
    router.back();
  };

  return <ChatView onBack={handleBack} />;
}
