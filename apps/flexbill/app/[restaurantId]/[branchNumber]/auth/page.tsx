"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Phone, User, ChevronDown } from "lucide-react";
import Flag from "react-world-flags";
import { authService } from "@/app/services/auth.service";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useAuth } from "@/app/context/AuthContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";

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

export default function AuthPage() {
  const t = useTranslations("Auth");
  const tp = useTranslations("AuthPage");
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const {
    verifyOTP,
    createOrUpdateProfile: updateProfile,
    refreshProfile,
  } = useAuth();

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const tableNumber = searchParams.get("table");

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+52");
  const [phoneNumber, setPhoneNumber] = useState(""); // Solo números sin formato
  const [phoneNumberDisplay, setPhoneNumberDisplay] = useState(""); // Con formato para mostrar
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
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
    if (tableNumber) {
      sessionStorage.setItem("pendingTableRedirect", tableNumber);
    }
    if (restaurantId) {
      sessionStorage.setItem("pendingRestaurantId", restaurantId);
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [
    tableNumber,
    restaurantId,
    branchNumber,
    setRestaurantId,
    setBranchNumber,
  ]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Limpia los flags de sessionStorage cuando se abandona la página sin
  // completar el auth (se usan para decidir a dónde redirigir después del
  // login — ver handleAuthRedirect). No se limpian si el auth sí se
  // completó (authCompletedRef), ya que handleAuthRedirect los necesita
  // primero y los borra él mismo.
  const cleanupPendingAuthFlags = () => {
    if (!authCompletedRef.current) {
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("even-post-auth-redirect");
    }
  };

  // Página usa UNA sola entrada de historial "guardia" (en vez de una por
  // step). Los cambios de step hacia adelante (phone->verify->profile) son
  // puro estado de React, no tocan el historial. El gesto/botón atrás
  // dispara `popstate`, que consume esa entrada: si hay un step anterior al
  // que volver, la re-empujamos (se "absorbe" el back como un cambio de
  // step); si no, se limpian los flags pendientes y se deja salir de verdad
  // hacia la página anterior. Al completar el login, esa única entrada se
  // reemplaza (ver handleAuthRedirect), así que un "atrás" posterior salta
  // directo a la pantalla previa sin pasar de nuevo por acá.
  useEffect(() => {
    window.history.replaceState({ evenAuth: true }, "");
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (step === "profile") {
        // No se puede salir del step de perfil con el gesto/botón atrás.
        window.history.pushState({ evenAuth: true }, "");
        return;
      }
      if (step === "verify") {
        // Absorbe el back como un paso atrás (verify -> phone), sin salir.
        setStep("phone");
        setOtp("");
        setError("");
        window.history.pushState({ evenAuth: true }, "");
        return;
      }
      // step === "phone": se deja salir de verdad de la página.
      cleanupPendingAuthFlags();
    };
    window.addEventListener("popstate", handlePopState);
    // For page unload (close tab, refresh)
    window.addEventListener("beforeunload", cleanupPendingAuthFlags);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", cleanupPendingAuthFlags);
    };
  }, [step]);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      // Navigate directly to the saved URL — replace para que la única
      // entrada de historial "guardia" de esta página se reemplace en vez
      // de dejarse en el stack (así un "atrás" posterior salta directo a
      // la pantalla previa a auth, sin pasar de nuevo por acá).
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Clear all session flags
    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu && tableNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithTable("/dashboard", true);
    } else if (authFromPaymentFlow && tableNumber) {
      // User signed up during payment flow, redirect to payment-options
      navigateWithTable("/card-selection", true);
    } else {
      // Default redirect to menu
      navigateWithTable("/menu", true);
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
        // Refresh profile data to get the updated information
        await refreshProfile();

        // Redirect based on context
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
    <div className="min-h-new brand-evergreen flex flex-col justify-center items-center px-4">
      {/* Back Button — siempre pasa por router.back() (y por lo tanto por
          el listener de popstate de arriba) en vez de tocar el step
          directamente, para no dejar una entrada de historial sin
          consumir que luego dispare el popstate handler por duplicado. */}
      <button
        onClick={() => {
          if (step === "profile") return; // no se puede regresar, ya autenticado
          router.back();
        }}
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
        <div className="mb-8 text-center">
          <img
            src="/even/even-asterisk-grass.svg"
            alt="Even"
            className="size-16 md:size-20 lg:size-24 mx-auto mb-6"
          />
          <h1 className="text-2xl font-medium text-white">
            {step === "phone"
              ? t("phoneStepTitle")
              : step === "verify"
                ? t("verifyStepTitle")
                : t("profileStepTitle")}
          </h1>
          <p className="text-gray-200 mt-2">
            {step === "phone" ? (
              tp("phoneStepSubtitle")
            ) : step === "verify" ? (
              <>
                {t("verifyStepSubtitlePrefix")}
                <br />
                {formatPhoneNumber(phone)}
              </>
            ) : (
              t("profileStepSubtitle")
            )}
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
                    className="h-[48px] w-[90px] px-3 text-gray-700 font-medium bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent cursor-pointer hover:border-gray-400 transition-colors flex items-center justify-between gap-1.5"
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
                    className="h-[48px] w-full pl-10 pr-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent"
                    placeholder={t("phonePlaceholder")}
                    disabled={loading}
                    maxLength={14}
                  />
                </div>
              </div>
              <p className="text-gray-300 text-xs">
                {tp("examplePrefix")}{" "}
                {countryCode === "+52"
                  ? "500 555 0006"
                  : countryCode === "+1"
                    ? "500 555 0006"
                    : "123 456 789"}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneNumber || phoneNumber.length < 8}
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
            >
              {loading ? t("sending") : t("sendCode")}
            </button>
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
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
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
                onClick={() => router.back()}
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
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("firstNamePlaceholder")}
                  className="h-[48px] w-full pl-10 pr-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                  required
                  disabled={loading}
                />
              </div>

              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("lastNamePlaceholder")}
                className="h-[48px] w-full px-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                disabled={loading}
              />
            </div>

            {/* Age */}
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
                className="h-[48px] w-full px-3 text-gray-600 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen cursor-pointer appearance-none"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !firstName || age === ""}
              className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed mt-6"
            >
              {loading ? t("saving") : t("continueCta")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
