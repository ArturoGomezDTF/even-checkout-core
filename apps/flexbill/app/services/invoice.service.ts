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

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("even_access_token");
    const guestId = localStorage.getItem("even-guest-id") || "";
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else if (guestId) {
      headers["x-guest-id"] = guestId;
    }
  }
  return headers;
}

async function requestWithAuth<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options?.headers as Record<string, string>) },
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.message || "Request failed" };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

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
    const response = await fetch(`${API_BASE}/invoices/preview`, {
      method: "POST",
      headers: getAuthHeaders(),
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
      throw new Error(res.error || "Error al crear la factura.");
    }
    return res.data;
  }

  async downloadInvoicePdf(
    invoiceId: string,
    restaurantId: number,
  ): Promise<Blob> {
    const response = await fetch(
      `${API_BASE}/invoices/${invoiceId}/pdf?restaurantId=${restaurantId}`,
      { headers: getAuthHeaders() },
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
      throw new Error(res.error || "Error al enviar la factura.");
    }
  }
}

export const invoiceService = new InvoiceService();
