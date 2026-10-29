"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Phone, User, ChevronDown } from "lucide-react";
import Flag from "react-world-flags";
import { useTranslations } from "next-intl";
import { authService } from "@/services/auth.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useAuth } from "@/context/AuthContext";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import { useGuest } from "@/context/GuestContext";

type Step = "phone" | "verify" | "profile";

interface Country {
  code: string;
  flag: string;
  name: string;
}

const countries: Country[] = [
  { code: "+52", flag: "MX", name: "México" },
  { code: "+1", flag: "US", name: "Estados Unidos" },
  { code: "+34", flag: "ES", name: "España" },
  { code: "+54", flag: "AR", name: "Argentina" },
  { code: "+57", flag: "CO", name: "Colombia" },
  { code: "+58", flag: "VE", name: "Venezuela" },
];

// Perfil completo = tiene nombre Y fecha de nacimiento (apellido es opcional en el form).
const isProfileComplete = (
  p?: { firstName?: string; birthDate?: string } | null,
) => !!p?.firstName && !!p?.birthDate;

const ageFromBirthDate = (birthDate?: string): number | "" => {
  if (!birthDate) return "";
  const year = new Date(birthDate).getUTCFullYear();
  return Number.isNaN(year) ? "" : new Date().getUTCFullYear() - year;
};

export default function AuthPage() {
  const t = useTranslations("Auth");
  const tp = useTranslations("AuthPage");
  const router = useRouter();
  const { navigateWithRoom } = useRoomNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const {
    verifyOTP,
    createOrUpdateProfile: updateProfile,
    refreshProfile,
    profile,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuth();

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const roomNumber = searchParams.get("room");

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+52");
  const [phoneNumber, setPhoneNumber] = useState(""); // Solo números sin formato
  const [phoneNumberDisplay, setPhoneNumberDisplay] = useState(""); // Con formato para mostrar
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const { guestName } = useGuest();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const authCompletedRef = useRef(false);

  // Formatear número de teléfono para mostrar
  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return "";

    const cleaned = phoneNumber.replace(/\D/g, "");

    // Sin código de país - solo 10 dígitos
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }

    // Con código de país
    if (cleaned.length > 10) {
      const countryCode = cleaned.slice(0, cleaned.length - 10);
      const areaCode = cleaned.slice(-10, -7);
      const firstPart = cleaned.slice(-7, -4);
      const lastPart = cleaned.slice(-4);
      return `+${countryCode} (${areaCode}) ${firstPart}-${lastPart}`;
    }

    return phoneNumber;
  };

  // Formatear número mientras se escribe (para el input)
  const formatPhoneInput = (value: string) => {
    const cleaned = value.replace(/\D/g, "");

    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
    } else if (cleaned.length <= 10) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }

    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".country-selector")) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Store context
  useEffect(() => {
    if (roomNumber) {
      sessionStorage.setItem("pendingRoomRedirect", roomNumber);
    }
    if (restaurantId) {
      sessionStorage.setItem("pendingRestaurantId", restaurantId);
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [
    roomNumber,
    restaurantId,
    branchNumber,
    setRestaurantId,
    setBranchNumber,
  ]);

  // Si ya hay una sesión activa (CartView redirige acá cuando el usuario está
  // autenticado pero el perfil quedó incompleto), no tiene sentido pedir
  // teléfono/OTP de nuevo: saltar directo al step de perfil, precargando lo
  // que ya exista. Si el perfil ya está completo, no hace falta hacer nada
  // acá — es un caso límite (CartView normalmente no manda a un usuario así
  // a esta pantalla), no el flujo principal.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || step === "profile") return;
    if (!isProfileComplete(profile)) {
      setFirstName(profile?.firstName || "");
      setLastName(profile?.lastName || "");
      setAge(ageFromBirthDate(profile?.birthDate));
      setStep("profile");
    }
  }, [isAuthLoading, isAuthenticated, profile, step]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Flags de sessionStorage usados para decidir a dónde volver una vez que
  // el usuario termina teléfono+perfil (ver handleAuthRedirect). Si en vez
  // de eso abandona el flujo (back hasta el step de teléfono, cierra la
  // pestaña), hay que limpiarlos para que no queden flags viejos que
  // contaminen un intento de auth futuro.
  const clearAuthSessionFlags = () => {
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");
    sessionStorage.removeItem("pendingRoomRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
  };

  // Limpieza al cerrar/recargar la pestaña sin completar el login.
  useEffect(() => {
    const cleanup = () => {
      if (!authCompletedRef.current) clearAuthSessionFlags();
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  // Toda la página usa UNA sola entrada de historial "guardia" (en vez de
  // una por step). Los cambios de step hacia adelante (phone->verify->
  // profile) son puro estado de React, no tocan el historial. El gesto/
  // botón atrás dispara `popstate`, que consume esa entrada: si hay un
  // step anterior al que volver, la re-empujamos (se "absorbe" el back
  // como un cambio de step); si no, se deja salir de verdad hacia la
  // pantalla anterior (y se limpian los flags de sessionStorage). Al
  // completar el login con éxito, esa única entrada se reemplaza (ver
  // handleAuthRedirect), así que un "atrás" posterior salta directo sin
  // volver a pasar por esta pantalla.
  useEffect(() => {
    window.history.replaceState({ evenAuthGuard: true }, "");
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (step === "profile") {
        // No se puede salir del step de perfil con el gesto/botón atrás.
        window.history.pushState({ evenAuthGuard: true }, "");
        return;
      }
      if (step === "verify") {
        // Absorbe el back como un paso atrás (verify -> phone), sin salir.
        setStep("phone");
        setOtp("");
        setError("");
        window.history.pushState({ evenAuthGuard: true }, "");
        return;
      }
      // step === "phone": se deja salir de la página de verdad.
      if (!authCompletedRef.current) clearAuthSessionFlags();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [step]);

  // Consume la entrada guardia para que sea `popstate` quien decida si hay
  // que volver un step o salir de verdad de la página — usado por el botón
  // atrás en pantalla y por "Cambiar número". Si en vez de esto se hiciera
  // `setStep` directo, quedaría una entrada de historial sin consumir que
  // luego dispara un `popstate` duplicado en el siguiente back real.
  const goToPreviousStep = useCallback(() => {
    if (step === "profile") return;
    router.back();
  }, [step, router]);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      // Navigate directly to the saved URL, replacing so the single
      // evenAuthGuard history entry doesn't linger (see guard effect above).
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    clearAuthSessionFlags();

    // replace: true — mismo motivo que arriba, reemplaza la única entrada
    // guardia en vez de apilar una más.
    if (authFromMenu && roomNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithRoom("/dashboard", true);
    } else if (authFromPaymentFlow && roomNumber) {
      navigateWithRoom("/order-confirm", true);
    } else {
      // Default redirect to menu
      navigateWithRoom("/menu", true);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const fullPhone = countryCode + phoneNumber;
      setPhone(fullPhone);

      const response = await authService.sendPhoneOTP(fullPhone);

      if (response.success) {
        setStep("verify");
        setCountdown(60);
      } else {
        setError(response.error || t("errorSendCode"));
      }
    } catch (err) {
      setError(t("errorSendCodeGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (otp.length !== 6) {
      setError(t("errorInvalidCodeLength"));
      setLoading(false);
      return;
    }

    try {
      const response = await verifyOTP(phone, otp);

      if (response.success) {
        // Check if profile exists
        const profileResponse = await authService.getMyProfile();

        if (profileResponse.success && profileResponse.data) {
          // Handle nested data structure: data.data.profile or data.profile or data
          const responseData = profileResponse.data as any;
          const profile =
            responseData.data?.profile ||
            responseData.profile ||
            responseData.data ||
            responseData;

          console.log("👤 profile object:", profile);
          console.log("👤 profile.firstName:", profile.firstName);

          // If profile has firstName, redirect based on context
          if (profile.firstName) {
            await refreshProfile();
            handleAuthRedirect();
          } else {
            // Profile exists but incomplete, go to profile step
            setStep("profile");
          }
        } else {
          // No profile, go to profile step
          setStep("profile");
        }
      } else {
        setError(response.error || t("errorInvalidCode"));
      }
    } catch (err) {
      console.error("❌ Error in handleVerifyOTP:", err);
      setError(t("errorVerifyCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;

    setError("");
    setLoading(true);

    try {
      const response = await authService.sendPhoneOTP(phone);

      if (response.success) {
        setCountdown(60);
      } else {
        setError(response.error || t("errorResendCode"));
      }
    } catch (err) {
      setError(t("errorResendCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (age === "") return;
    setError("");
    setLoading(true);

    try {
      const birthYear = new Date().getUTCFullYear() - Number(age);
      const response = await updateProfile({
        firstName,
        lastName,
        birthDate: `${birthYear}-01-01`,
      });

      if (response.success) {
        await refreshProfile();
        handleAuthRedirect();
      } else {
        setError(response.error || t("errorSaveProfile"));
      }
    } catch (err) {
      setError(t("errorSaveProfile"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col justify-center items-center px-4">
      {/* Back Button */}
      <button
        onClick={goToPreviousStep}
        disabled={step === "profile"}
        className={`absolute top-4 md:top-6 lg:top-8 left-4 md:left-6 lg:left-8 p-2 md:p-3 text-white rounded-full transition-all active:bg-white/10 z-20 ${
          step === "profile"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-white/10"
        }`}
      >
        <ArrowLeft className="size-5 md:size-6 lg:size-7" />
      </button>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img
            src="/even/even-asterisk-grass.svg"
            alt="Even Logo"
            className="size-16 md:size-20 lg:size-24 mx-auto mb-4"
          />
          <h1 className="text-2xl font-medium text-white">
            {step === "phone"
              ? t("phoneStepTitle")
              : step === "verify"
                ? t("verifyStepTitle")
                : t("profileStepTitle")}
          </h1>
          <p className="text-gray-200 mt-2">
            {step === "phone"
              ? tp("phoneStepSubtitle")
              : step === "verify"
                ? `${t("verifyStepSubtitlePrefix")} ${formatPhoneNumber(phone)}`
                : t("profileStepSubtitle")}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-white text-sm">
            {error}
          </div>
        )}

        {/* Phone Input Step */}
        {step === "phone" && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div className="space-y-2">
              <div className="flex gap-3">
                {/* Country Code Selector */}
                <div className="relative country-selector">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="h-12 w-22.5 px-3 text-gray-700 font-medium bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent cursor-pointer hover:border-gray-400 transition-colors flex items-center justify-between gap-1.5"
                    disabled={loading}
                  >
                    <div className="flex items-center gap-1.5">
                      <Flag
                        code={
                          countries.find((c) => c.code === countryCode)?.flag ||
                          "MX"
                        }
                        style={{ width: 20, height: 15, borderRadius: 2 }}
                      />
                      <span className="text-sm">{countryCode}</span>
                    </div>
                    <ChevronDown className="size-3 text-gray-500 shrink-0" />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 overflow-hidden">
                      {countries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setCountryCode(country.code);
                            setIsDropdownOpen(false);
                          }}
                          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left"
                        >
                          <Flag
                            code={country.flag}
                            style={{ width: 20, height: 15, borderRadius: 2 }}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {country.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phone Number Input */}
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
                  <input
                    required
                    type="tel"
                    value={phoneNumberDisplay}
                    onChange={(e) => {
                      // Only allow numbers
                      const value = e.target.value.replace(/\D/g, "");
                      setPhoneNumber(value);
                      setPhoneNumberDisplay(formatPhoneInput(value));
                    }}
                    className="h-12 w-full pl-10 pr-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent"
                    placeholder={t("phonePlaceholder")}
                    disabled={loading}
                    maxLength={14}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneNumber || phoneNumber.length < 8}
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
            >
              {loading ? t("sending") : t("sendCode")}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() =>
                  navigateWithRoom(guestName ? "/order-confirm" : "/user")
                }
                className="text-white/70 hover:text-white text-sm underline underline-offset-2 transition-colors"
              >
                {t("continueAsGuest")}
              </button>
            </div>
          </form>
        )}

        {/* OTP Verification Step */}
        {step === "verify" && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full px-3 py-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen text-center tracking-widest text-2xl"
              required
              disabled={loading}
              autoFocus
              autoComplete="one-time-code"
            />

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
            >
              {loading ? t("verifying") : t("verifyCode")}
            </button>

            {/* Resend Button */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={countdown > 0 || loading}
                className={`text-sm underline transition-colors ${
                  countdown > 0
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-white hover:text-gray-200 cursor-pointer"
                }`}
              >
                {countdown > 0
                  ? t("resendIn", { seconds: countdown })
                  : t("resendCta")}
              </button>
            </div>

            {/* Change Number */}
            <div className="text-center">
              <button
                type="button"
                onClick={goToPreviousStep}
                className="text-sm text-white hover:text-gray-200 underline"
              >
                {t("changeNumber")}
              </button>
            </div>
          </form>
        )}

        {/* Profile Completion Step */}
        {step === "profile" && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("firstNamePlaceholder")}
                  className="h-12 w-full pl-10 pr-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                  required
                  disabled={loading}
                />
              </div>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("lastNamePlaceholder")}
                className="h-12 w-full px-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                {t("ageLabel")}
              </label>
              <select
                required
                value={age}
                onChange={(e) =>
                  setAge(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="h-12 w-full px-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen cursor-pointer appearance-none"
                disabled={loading}
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

            <button
              type="submit"
              disabled={loading || !firstName || age === ""}
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed mt-6"
            >
              {loading ? t("saving") : t("continueCta")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
