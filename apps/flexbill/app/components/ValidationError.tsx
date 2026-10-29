import { Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface ValidationErrorProps {
  errorType:
    | "RESTAURANT_NOT_FOUND"
    | "BRANCH_NOT_FOUND"
    | "TABLE_NOT_FOUND"
    | "NO_BRANCHES"
    | "SERVICE_NOT_AVAILABLE"
    | "SESSION_EXPIRED"
    | "SESSION_REQUIRED"
    | "SESSION_INVALID"
    | "VALIDATION_ERROR";
}

export default function ValidationError({ errorType }: ValidationErrorProps) {
  const router = useRouter();
  const t = useTranslations("ValidationError");

  const errorMessages = {
    RESTAURANT_NOT_FOUND: {
      title: t("restaurantNotFoundTitle"),
      description: t("restaurantNotFoundDescription"),
      detail: t("restaurantNotFoundDetail"),
    },
    BRANCH_NOT_FOUND: {
      title: t("branchNotFoundTitle"),
      description: t("branchNotFoundDescription"),
      detail: t("branchNotFoundDetail"),
    },
    TABLE_NOT_FOUND: {
      title: t("tableNotFoundTitle"),
      description: t("tableNotFoundDescription"),
      detail: t("tableNotFoundDetail"),
    },
    NO_BRANCHES: {
      title: t("noBranchesTitle"),
      description: t("noBranchesDescription"),
      detail: t("noBranchesDetail"),
    },
    SERVICE_NOT_AVAILABLE: {
      title: t("serviceNotAvailableTitle"),
      description: t("serviceNotAvailableDescription"),
      detail: t("serviceNotAvailableDetail"),
    },
    SESSION_EXPIRED: {
      title: t("sessionExpiredTitle"),
      description: t("sessionExpiredDescription"),
      detail: "",
    },
    SESSION_REQUIRED: {
      title: t("sessionExpiredTitle"),
      description: t("sessionInvalidDescription"),
      detail: t("sessionInvalidDetail"),
    },
    SESSION_INVALID: {
      title: t("sessionExpiredTitle"),
      description: t("sessionInvalidDescription"),
      detail: t("sessionInvalidDetail"),
    },
    VALIDATION_ERROR: {
      title: t("validationErrorTitle"),
      description: t("validationErrorDescription"),
      detail: t("validationErrorDetail"),
    },
  };

  const errorInfo = errorMessages[errorType];

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-6 md:mb-8 lg:mb-10 text-center">
            <img
              src="/brand/even-wordmark-grass.svg"
              alt="Even Logo"
              className="w-44 md:w-52 lg:w-60 mx-auto h-auto"
            />
            <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
              {errorInfo.title}
            </h1>
            <p className="text-white/80 text-sm md:text-base lg:text-lg mb-2">
              {errorInfo.description}
            </p>
            <p className="text-white/60 text-xs md:text-sm lg:text-base">
              {errorInfo.detail}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
