/**
 * Tipos relacionados con usuarios
 */

export interface UserInfo {
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}

export interface UsersInfoResponse {
  [userId: string]: UserInfo;
}

export interface LinkGuestOrdersRequest {
  guestId: string;
  userId: string;
  tableNumber?: string;
  restaurantId?: string;
}
