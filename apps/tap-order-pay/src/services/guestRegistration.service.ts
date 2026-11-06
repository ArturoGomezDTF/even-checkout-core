const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TERMS_SOURCE = "tap-order-and-pay";

function ensureGuestId(current: string | null): string {
  if (current) return current;
  let id = localStorage.getItem("even-guest-id");
  if (!id) {
    id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("even-guest-id", id);
  }
  return id;
}

// Registra al invitado con su aceptación de Términos y Aviso de Privacidad.
// Devuelve false si el backend no la guardó: el invitado no debe avanzar.
export async function registerGuestWithTerms(params: {
  guestId: string | null;
  name: string;
  restaurantId?: string | number | null;
  branchNumber?: string | number | null;
}): Promise<boolean> {
  const guestId = ensureGuestId(params.guestId);
  try {
    const response = await fetch(`${API_URL}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-id": guestId },
      body: JSON.stringify({
        guestId,
        name: params.name,
        acceptedTerms: true,
        source: TERMS_SOURCE,
        restaurantId: params.restaurantId ?? null,
        branchNumber: params.branchNumber ?? null,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("Error registering guest:", error);
    return false;
  }
}
