import { getAuthHeaders } from "./invoice.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

class TicketService {
  async downloadTicketPdf(transactionId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/tickets/${transactionId}/pdf`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Error al descargar el ticket.");
    return response.blob();
  }
}

export const ticketService = new TicketService();
