import type { Metadata } from "next";
import { UiShowcase } from "./showcase";

export const metadata: Metadata = {
  title: "@even/ui · Even Checkout Demo",
};

export default function UiPage() {
  return <UiShowcase />;
}
