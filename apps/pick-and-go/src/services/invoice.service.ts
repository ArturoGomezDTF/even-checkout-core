import { requestWithAuth } from "./request-helper";

export interface FiscalData {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  email?: string;
  usoCfdi: string;
}

export interface BillingProfile {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  codigo_postal: string;
  email?: string;
  uso_cfdi: string;
}

export interface InvoiceInfo {
  invoiceId: string | null;
  status: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

class InvoiceService {
  async getBillingProfile(): Promise<BillingProfile | null> {
    const res = await requestWithAuth<BillingProfile>(
      "/invoices/billing-profile",
    );
    return res.data ?? null;
  }

  async getTransactionInvoice(
    transactionId: string,
  ): Promise<InvoiceInfo | null> {
    const res = await requestWithAuth<InvoiceInfo>(
      `/invoices/transaction/${transactionId}`,
    );
    return res.data ?? null;
  }

  async previewInvoice(
    transactionId: string,
    fiscalData: FiscalData,
    restaurantId: number,
  ): Promise<Blob> {
    const authToken =
      typeof window !== "undefined"
        ? localStorage.getItem("even_access_token")
        : null;
    const guestId =
      typeof window !== "undefined"
        ? localStorage.getItem("even-guest-id") || ""
        : "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    } else if (guestId) {
      headers["x-guest-id"] = guestId;
    }

    const response = await fetch(`${API_BASE}/invoices/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ transactionId, fiscalData, restaurantId }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Error al generar vista previa.");
    }

    return response.blob();
  }

  async createInvoice(
    transactionId: string,
    fiscalData: FiscalData,
    restaurantId: number,
  ): Promise<{ invoiceId: string; uuid: string; status: string }> {
    const res = await requestWithAuth<{
      invoiceId: string;
      uuid: string;
      status: string;
    }>("/invoices", {
      method: "POST",
      body: JSON.stringify({ transactionId, fiscalData, restaurantId }),
    });

    if (!res.success || !res.data) {
      throw new Error(
        typeof res.error === "string"
          ? res.error
          : "Error al crear la factura.",
      );
    }
    return res.data;
  }

  async downloadInvoicePdf(
    invoiceId: string,
    restaurantId: number,
  ): Promise<Blob> {
    const authToken =
      typeof window !== "undefined"
        ? localStorage.getItem("even_access_token")
        : null;
    const guestId =
      typeof window !== "undefined"
        ? localStorage.getItem("even-guest-id") || ""
        : "";

    const headers: Record<string, string> = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    } else if (guestId) {
      headers["x-guest-id"] = guestId;
    }

    const response = await fetch(
      `${API_BASE}/invoices/${invoiceId}/pdf?restaurantId=${restaurantId}`,
      { headers },
    );

    if (!response.ok) throw new Error("Error al descargar la factura.");
    return response.blob();
  }

  async sendInvoiceByEmail(
    invoiceId: string,
    restaurantId: number,
    email?: string,
  ): Promise<void> {
    const res = await requestWithAuth<{ ok: boolean }>(
      `/invoices/${invoiceId}/email`,
      {
        method: "POST",
        body: JSON.stringify({ restaurantId, email }),
      },
    );

    if (!res.success) {
      throw new Error(
        typeof res.error === "string"
          ? res.error
          : "Error al enviar la factura.",
      );
    }
  }
}

export const invoiceService = new InvoiceService();
