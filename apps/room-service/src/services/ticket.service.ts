const API_BASE = process.env.NEXT_PUBLIC_API_URL;

class TicketService {
  async downloadTicketPdf(transactionId: string): Promise<Blob> {
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

    const response = await fetch(`${API_BASE}/tickets/${transactionId}/pdf`, {
      headers,
    });

    if (!response.ok) throw new Error("Error al descargar el ticket.");
    return response.blob();
  }
}

export const ticketService = new TicketService();
