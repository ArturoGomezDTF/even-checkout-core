/**
 * Tipos relacionados con autenticación y perfiles de usuario
 */

export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
  accountType: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate?: string;
  gender?: "male" | "female" | "other";
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface SendOTPRequest {
  phone: string;
}

export interface VerifyOTPRequest {
  phone: string;
  token: string;
}

export interface CreateProfileRequest {
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: "male" | "female" | "other";
  photoUrl?: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: "male" | "female" | "other";
  photoUrl?: string;
}

export interface LinkGuestOrdersRequest {
  guestId: string;
  userId: string;
  restaurantId?: string;
  branchNumber?: number;
}
