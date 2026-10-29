"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/auth.service";
import {
  User,
  Camera,
  Loader2,
  Phone,
  X,
  LogOut,
  LogIn,
  CircleAlert,
} from "lucide-react";
import { useNavigation } from "@/hooks/useNavigation";
import { useModalBackClose } from "@/hooks/useModalBackClose";

interface ProfileTabProps {
  onLogout?: () => void;
}

export default function ProfileTab({ onLogout }: ProfileTabProps = {}) {
  const t = useTranslations("ProfileTab");
  const tc = useTranslations("Common");
  const { navigateWithRestaurantId } = useNavigation();
  const {
    user,
    profile,
    isLoading,
    logout: contextLogout,
    refreshProfile,
    updateProfile,
  } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [firstName, setFirstName] = useState(profile?.firstName || "");
  const [lastName, setLastName] = useState(profile?.lastName || "");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useModalBackClose(isLogoutModalOpen, () => setIsLogoutModalOpen(false));
  useModalBackClose(!!errorMessage, () => setErrorMessage(null));
  const [phone, setPhone] = useState(profile?.phone || "");
  const [age, setAge] = useState<number | "">(
    profile?.birthDate
      ? new Date().getUTCFullYear() -
          new Date(profile.birthDate).getUTCFullYear()
      : "",
  );
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl || "");
  const isAuthenticated = !!user;

  // Formatear número de teléfono
  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return "";

    const cleaned = phoneNumber.replace(/\D/g, "");

    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }

    if (cleaned.length > 10) {
      const areaCode = cleaned.slice(-10, -7);
      const firstPart = cleaned.slice(-7, -4);
      const lastPart = cleaned.slice(-4);
      return `${areaCode} ${firstPart} ${lastPart}`;
    }

    return phoneNumber;
  };

  // Sincronizar campos con el profile del AuthContext
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setPhone(profile.phone || "");
      setAge(
        profile.birthDate
          ? new Date().getUTCFullYear() -
              new Date(profile.birthDate).getUTCFullYear()
          : "",
      );
      setPhotoUrl(profile.photoUrl || "");
    } else if (!isLoading && user) {
      // Usuario autenticado pero sin perfil - intentar cargar de nuevo
      refreshProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isLoading, user]);

  const handleUpdateProfile = async () => {
    if (!isAuthenticated || age === "") return;

    setIsUpdating(true);
    try {
      const birthYear = new Date().getFullYear() - Number(age);
      const birthDate = `${birthYear}-01-01`;

      const response = await updateProfile({
        firstName,
        lastName,
        birthDate,
      });

      if (response.success) {
        await refreshProfile();
      } else {
        throw new Error(response.error || "Error al actualizar");
      }
    } catch (error) {
      console.error("Error al actualizar el perfil:", error);
      setErrorMessage(t("errorUpdateProfile"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAuthenticated || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];

    // Validar tamaño (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(t("errorImageTooLarge"));
      return;
    }

    // Validar tipo
    if (!file.type.startsWith("image/")) {
      setErrorMessage(t("errorInvalidImageType"));
      return;
    }

    setIsUpdating(true);

    try {
      const token = authService.getAccessToken();
      if (!token) {
        setErrorMessage(t("errorNotAuthenticated"));
        setIsUpdating(false);
        return;
      }

      const formData = new FormData();
      formData.append("photo", file);

      const uploadUrl = `${process.env.NEXT_PUBLIC_API_URL}/profiles/upload-photo`;
      let response = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) {
        const newToken = await authService.handleTokenRefresh();
        if (!newToken) throw new Error("Sesión expirada");
        response = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${newToken}` },
          body: formData,
        });
      }

      const data = await response.json();

      if (data.success && data.data?.photoUrl) {
        setPhotoUrl(data.data.photoUrl);
      } else {
        throw new Error(data.error || "Error al subir la foto");
      }
    } catch (error) {
      console.error("Error al actualizar la foto:", error);
      setErrorMessage(t("errorUpdatePhoto"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLogoutModalOpen(false);
      if (onLogout) {
        // El padre (modal) cierra con animación y limpia la sesión después,
        // para evitar el flash de AuthView durante la animación de cierre.
        onLogout();
      } else {
        await contextLogout();
        navigateWithRestaurantId("/menu");
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      setErrorMessage(t("errorLogout"));
    }
  };

  if (isLoading || (user && !profile)) {
    return (
      <div className="flex items-center justify-center py-12 md:py-16 lg:py-20">
        <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-even-shamrock" />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 overflow-y-scroll min-h-0">
      {/* Profile Image */}
      <div className="flex flex-col items-center">
        <div className="relative group mb-4">
          <div className="size-28 md:size-32 lg:size-36 rounded-full bg-gray-200 overflow-hidden border-2 md:border-4 border-even-evergreen flex items-center justify-center">
            {isAuthenticated && photoUrl ? (
              <img
                src={photoUrl}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <div>
                <img
                  src="/logos/pp_default.jpg"
                  alt="Profile Pic"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
          {isAuthenticated && (
            <label
              htmlFor="profile-image"
              className="absolute bottom-0 right-0 bg-even-grass text-even-evergreen p-2 md:p-2.5 lg:p-3 rounded-full cursor-pointer hover:bg-[#74cf4e] transition-colors"
            >
              <Camera className="size-4 md:size-5 lg:size-6" />
              <input
                id="profile-image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isUpdating}
              />
            </label>
          )}
        </div>
      </div>

      {/* Fila 1: Nombre + Apellido */}
      <div className="flex gap-3 md:gap-4 lg:gap-5 mb-4 md:mb-5 lg:mb-6">
        <div className="space-y-2 flex-1">
          <label className="gap-1.5 md:gap-2 flex items-center text-sm md:text-base lg:text-lg text-gray-700">
            <User className="size-3.5 md:size-4 lg:size-5" />
            {t("firstNameLabel")}
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("firstNamePlaceholder")}
            className="w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 border text-black text-base md:text-lg lg:text-xl border-gray-300 rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={isUpdating || !isAuthenticated}
          />
        </div>
        <div className="space-y-2 flex-1">
          <label className="gap-1.5 md:gap-2 flex items-center text-sm md:text-base lg:text-lg text-gray-700">
            <User className="size-3.5 md:size-4 lg:size-5" />
            {t("lastNameLabel")}
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("lastNamePlaceholder")}
            className="w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 border text-black text-base md:text-lg lg:text-xl border-gray-300 rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={isUpdating || !isAuthenticated}
          />
        </div>
      </div>

      {/* Fila 2: Teléfono + Edad */}
      <div className="flex gap-3 md:gap-4 lg:gap-5 mb-6 md:mb-8 lg:mb-10">
        <div className="space-y-2 flex-1 min-w-0">
          <label className="gap-1.5 md:gap-2 flex items-center text-sm md:text-base lg:text-lg text-gray-700">
            <Phone className="size-3.5 md:size-4 lg:size-5" />
            {t("phoneLabel")}
          </label>
          <div className="w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 text-base md:text-lg lg:text-xl truncate">
            {formatPhoneNumber(phone)}
          </div>
        </div>
        <div className="space-y-2 flex-1 min-w-0">
          <label className="gap-1.5 md:gap-2 flex items-center text-sm md:text-base lg:text-lg text-gray-700">
            {t("ageLabel")}
          </label>
          <select
            value={age}
            onChange={(e) =>
              setAge(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="cursor-pointer w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 border text-black text-base md:text-lg lg:text-xl border-gray-300 rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
            disabled={isUpdating || !isAuthenticated}
          >
            <option value="" disabled>
              {t("selectAge")}
            </option>
            {Array.from({ length: 59 }, (_, i) => i + 12).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logout/Login */}
      <div className="flex items-center justify-end gap-4">
        <button
          onClick={() => setIsLogoutModalOpen(true)}
          className={`font-medium text-sm md:text-base lg:text-lg flex items-center gap-2 cursor-pointer ${
            isAuthenticated
              ? "text-red-600 hover:text-red-700"
              : "text-even-shamrock hover:text-even-evergreen"
          }`}
        >
          {isAuthenticated ? (
            <>
              <LogOut className="size-4 md:size-5 lg:size-6" />
              {t("logout")}
            </>
          ) : (
            <>
              <LogIn className="size-4 md:size-5 lg:size-6" />
              {t("login")}
            </>
          )}
        </button>
      </div>

      {/* Update Button */}
      {isAuthenticated && (
        <button
          onClick={handleUpdateProfile}
          disabled={isUpdating}
          className="mt-6 md:mt-8 lg:mt-10 bg-even-grass hover:opacity-90 w-full text-even-evergreen py-3 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-full cursor-pointer transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <div className="flex items-center justify-center gap-1 md:gap-2">
              <Loader2 className="size-5 md:size-6 lg:size-7 animate-spin" />
              {t("updating")}
            </div>
          ) : (
            t("saveChanges")
          )}
        </button>
      )}

      {/* Error Modal */}
      {errorMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
            onClick={() => setErrorMessage(null)}
          >
            <div
              className="bg-white rounded-t-4xl w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 max-w-2xl mx-auto">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <CircleAlert
                      className="size-7 text-red-500"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-black text-center">
                    {tc("errorTitle")}
                  </h2>
                </div>
                <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm text-center">
                    {errorMessage}
                  </p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
                >
                  {tc("understood")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 flex items-end justify-center"
            style={{ zIndex: 99999 }}
          >
            {/* Fondo */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsLogoutModalOpen(false)}
            ></div>

            <div className="relative bg-white rounded-t-4xl w-full mx-4 p-6 md:p-7 lg:p-8">
              {/* Close Button */}
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="absolute top-4 md:top-5 lg:top-6 right-4 md:right-5 lg:right-6 text-gray-400 hover:text-gray-600"
              >
                <X className="size-5 md:size-6 lg:size-7" />
              </button>

              {/* Modal Title */}
              <h3 className="text-base md:text-xl lg:text-2xl font-semibold text-gray-800 mb-4 md:mb-5">
                {t("confirmLogoutTitle")}
              </h3>

              {/* Confirmation Message */}
              <p className="text-sm md:text-base text-gray-600 mb-6 md:mb-8">
                {t("confirmLogoutMessage")}
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3 md:gap-4">
                <button
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 md:py-3 text-base md:text-lg rounded-full cursor-pointer transition-colors"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 md:py-3 text-base md:text-lg rounded-full cursor-pointer transition-colors"
                >
                  {t("logout")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
