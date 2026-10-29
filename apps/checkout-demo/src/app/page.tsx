import Link from "next/link";
import { PACKAGE_NAME as apiClient } from "@even/api-client";
import { PACKAGE_NAME as payments } from "@even/payments";
import { PACKAGE_NAME as ui } from "@even/ui";

// App de prueba: confirma que una app del monorepo consume los paquetes compartidos.
export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Even Checkout Core</h1>
      <ul className="mt-4 list-disc pl-6">
        {[apiClient, payments, ui].map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <Link href="/pagos" className="mt-6 inline-block text-blue-600 hover:underline">
        Métodos de pago
      </Link>
    </main>
  );
}
