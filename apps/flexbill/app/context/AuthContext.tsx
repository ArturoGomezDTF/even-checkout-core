"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  authService,
  type AuthResponse,
  type ProfileData,
} from "../services/auth.service";

interface User {
  id: string;
  phone?: string;
  email?: string;
  accountType: string;
}

interface Profile {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  photoUrl?: string;
  userContext?: string;
  accountType: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sendOTP: (phone: string) => Promise<AuthResponse>;
  verifyOTP: (phone: string, token: string) => Promise<AuthResponse>;
  createOrUpdateProfile: (profileData: ProfileData) => Promise<AuthResponse>;
  updateProfile: (updates: Partial<ProfileData>) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref para leer el perfil actual dentro de event handlers sin stale closures
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Cargar usuario del localStorage al montar
  useEffect(() => {
    const loadUser = async () => {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        // Set auth token in AuthService first
        if (currentUser.token) {
          authService.setAuthToken(currentUser.token);
        }

        // Verificar si el token está por expirar o ya expiró
        const expiresAt = localStorage.getItem("even_expires_at");
        if (expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          const expiration = parseInt(expiresAt);
          const timeUntilExpiry = expiration - now;

          // Si ya expiró o expira en menos de 5 minutos, refrescar ahora
          if (timeUntilExpiry < 300) {
            const refreshResponse = await authService.refreshToken();
            if (refreshResponse.success && refreshResponse.data?.session) {
              authService.setAuthToken(
                refreshResponse.data.session.access_token,
              );
            } else if (refreshResponse.status === 401) {
              // El servidor rechazó el refresh token — sesión inválida
              await performLogout();
              setIsLoading(false);
              return;
            }
            // Refresh exitoso, o error de red/5xx (sesión se conserva y se
            // reintenta vía visibility/online/retry de getMyProfile)
            const profileOk = await loadProfileWithValidation();
            if (profileOk) {
              setUser(currentUser);
            } else {
              await performLogout();
            }
            setIsLoading(false);
            return;
          }
        }

        // Token válido - cargar perfil primero, luego establecer usuario
        const profileOk = await loadProfileWithValidation();
        if (profileOk) {
          setUser(currentUser);
        } else {
          await performLogout();
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

  // Refresh token periódicamente mientras el usuario está autenticado
  useEffect(() => {
    if (!user) return;

    // Refrescar cada 50 minutos (el token expira en 1 hora por defecto)
    const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutos en ms

    const refreshTokenPeriodically = async () => {
      try {
        const refreshResponse = await authService.refreshToken();
        if (refreshResponse.success && refreshResponse.data?.session) {
          const newToken = refreshResponse.data.session.access_token;
          authService.setAuthToken(newToken);
        } else {
          console.warn("⚠️ Periodic refresh failed:", refreshResponse.error);
        }
      } catch (error) {
        console.error("❌ Error in periodic refresh:", error);
      }
    };

    const intervalId = setInterval(refreshTokenPeriodically, REFRESH_INTERVAL);

    // También refrescar cuando la app vuelve a estar visible
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const expiresAt = localStorage.getItem("even_expires_at");
        if (expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          const expiration = parseInt(expiresAt);
          const timeUntilExpiry = expiration - now;

          // Si ya expiró o expira en menos de 10 minutos, refrescar
          if (timeUntilExpiry < 600) {
            const refreshResponse = await authService.refreshToken();
            if (refreshResponse.success && refreshResponse.data?.session) {
              authService.setAuthToken(
                refreshResponse.data.session.access_token,
              );
              console.log("✅ Token refreshed on visibility change");
            } else if (refreshResponse.status === 401) {
              // El servidor rechazó el refresh token — sesión inválida
              console.error("❌ Refresh token rejected, logging out user");
              await performLogout();
            } else {
              // Error de red o del servidor — conservar la sesión; se
              // reintentará en el próximo visibility/online/timer
              console.warn(
                "⚠️ Transient refresh failure on visibility change, keeping session",
              );
            }
          }
        }

        // Si el perfil no está cargado, intentarlo ahora que la app es visible
        if (!profileRef.current) {
          await loadProfile();
        }
      }
    };

    // Cargar perfil cuando la red vuelve (móvil despertando con red inestable)
    const handleNetworkOnline = async () => {
      if (!profileRef.current) {
        await loadProfile();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleNetworkOnline);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleNetworkOnline);
    };
  }, [user]);

  // Función interna para hacer logout sin async issues
  const performLogout = async () => {
    await authService.logout();
    authService.clearAuthToken();
    authService.clearAllSessionData();
    setUser(null);
    setProfile(null);
  };

  const loadProfile = async () => {
    try {
      const response = await authService.getMyProfile();

      if (response.success && response.data) {
        const responseData = (response as any).data;
        const profileData =
          responseData?.data?.profile || responseData?.profile;

        if (profileData) {
          setProfile(profileData);
        } else {
          console.warn("⚠️ No profile data found in response");
        }
      } else if (response.error?.includes("Sesión expirada")) {
        // Token refresh failed - user was logged out by authService
        setUser(null);
        setProfile(null);
      } else {
        console.warn("⚠️ Error loading profile:", response.error);
      }
    } catch (error) {
      console.error("❌ Error loading profile:", error);
    }
  };

  // Versión que retorna si fue exitoso (para validación en carga inicial)
  const loadProfileWithValidation = async (): Promise<boolean> => {
    try {
      const response = await authService.getMyProfile();

      if (response.success && response.data) {
        const responseData = (response as any).data;
        const profileData =
          responseData?.data?.profile || responseData?.profile;

        if (profileData) {
          setProfile(profileData);
          return true;
        } else {
          console.warn("⚠️ No profile data found in response");
          // No hay perfil pero la request fue exitosa - usuario nuevo
          return true;
        }
      }

      // Cerrar sesión si no hay token o si el servidor rechazó el refresh
      // (la sesión murió de verdad). Otros errores son fallas de red
      // transitorias y conservan la sesión para reintentar luego.
      if (
        response.error === "No estás autenticado" ||
        response.error === "Sesión expirada"
      ) {
        return false;
      }

      // Error de red o del servidor — conservar la sesión para no desloguear
      // al usuario cuando el móvil acaba de despertar con red inestable.
      console.warn(
        "⚠️ Could not load profile on startup, keeping session:",
        response.error,
      );
      return true;
    } catch (error) {
      // Error de red — mantener sesión, no desloguear
      console.error(
        "❌ Network error loading profile, keeping session:",
        error,
      );
      return true;
    }
  };

  const sendOTP = async (phone: string): Promise<AuthResponse> => {
    const response = await authService.sendPhoneOTP(phone);
    return response;
  };

  const verifyOTP = async (
    phone: string,
    token: string,
  ): Promise<AuthResponse> => {
    const response = await authService.verifyPhoneOTP(phone, token);

    if (response.success && response.data) {
      // Add token to user object for context consistency
      const userWithToken = {
        ...response.data.user,
        token: response.data.session.access_token,
      };

      setUser(userWithToken);
      if (response.data.profile) {
        setProfile(response.data.profile);
      }

      // Set auth token in AuthService immediately
      authService.setAuthToken(response.data.session.access_token);
    }

    return response;
  };

  const createOrUpdateProfile = async (
    profileData: ProfileData,
  ): Promise<AuthResponse> => {
    const response = await authService.createOrUpdateProfile(profileData);

    if (response.success && response.data?.profile) {
      setProfile(response.data.profile);
    }

    return response;
  };

  const updateProfile = async (
    updates: Partial<ProfileData>,
  ): Promise<AuthResponse> => {
    const response = await authService.updateMyProfile(updates);

    if (response.success && response.data?.profile) {
      setProfile(response.data.profile);
    }

    return response;
  };

  const logout = async () => {
    await authService.logout();
    // Clear auth token from AuthService
    authService.clearAuthToken();
    // Clear all session data
    authService.clearAllSessionData();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  const value = {
    user,
    profile,
    isAuthenticated: !!user,
    isLoading,
    sendOTP,
    verifyOTP,
    createOrUpdateProfile,
    updateProfile,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a AuthProvider");
  }
  return context;
}
