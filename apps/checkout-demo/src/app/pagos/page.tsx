import type { Metadata } from "next";
import Link from "next/link";
import { PaymentMethods } from "./payment-methods";

export const metadata: Metadata = {
  title: "Métodos de pago · Even Checkout Demo",
};

// Consume @even/payments desde el navegador; los tests E2E mockean la API aquí.
export default function PagosPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Inicio
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Métodos de pago</h1>
      <PaymentMethods />
    </main>
  );
}
