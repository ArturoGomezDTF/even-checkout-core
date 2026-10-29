"use client";

import { CardScanner as BaseCardScanner, type CardScannerProps } from "@even/payments/react";
import { useTranslations } from "next-intl";

export default function CardScanner(props: Omit<CardScannerProps, "labels">) {
  const t = useTranslations("CardScanner");
  return (
    <BaseCardScanner
      {...props}
      labels={{
        title: t("title"),
        subtitle: t("subtitle"),
        scanningCta: t("scanningCta"),
        errorCameraAccess: t("errorCameraAccess"),
        errorScan: t("errorScan"),
      }}
    />
  );
}
