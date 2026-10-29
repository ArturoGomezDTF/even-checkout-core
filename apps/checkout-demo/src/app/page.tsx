import { PACKAGE_NAME as apiClient } from "@even/api-client";
import { PACKAGE_NAME as payments } from "@even/payments";
import { PACKAGE_NAME as ui } from "@even/ui";
import Link from "next/link";
import { ScannerDemo } from "./ScannerDemo";

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
      <nav className="mt-6 flex flex-col gap-2">
        <Link href="/ui" className="underline">
          Ver catálogo de @even/ui
        </Link>
        <Link href="/pagos" className="underline">
          Métodos de pago
        </Link>
      </nav>
      <ScannerDemo />
    </main>
  );
}
