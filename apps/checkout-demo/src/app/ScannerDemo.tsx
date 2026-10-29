"use client";

import { CardScanner, type CardScanResult } from "@even/payments/react";
import { useState } from "react";

// Prueba de humo de @even/payments/react dentro de una app Next.
export function ScannerDemo() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CardScanResult | null>(null);

  return (
    <section className="mt-6">
      <button type="button" className="rounded-full border px-4 py-2" onClick={() => setOpen(true)}>
        Probar CardScanner
      </button>
      {result && <p className="mt-2 text-sm">•••• {result.cardNumber.slice(-4)}</p>}
      {open && (
        <CardScanner
          onScanSuccess={(r) => {
            setResult(r);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
