"use client";

import { useState, useEffect } from "react";
import { Phone, ChevronDown, User } from "lucide-react";
import Flag from "react-world-flags";
import { useTranslations } from "next-intl";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";
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

export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const tp = useTranslations("AuthSelectionPage");
  const { navigateWithTable } = useTableNavigation();
  const { validationError } = useValidateAccess();
  const { guestName } = useGuest();
  const {
    verifyOTP,
    createOrUpdateProfile: updateProfile,
    refreshProfile,
    profile,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+52");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberDisplay, setPhoneNumberDisplay] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const formatPhoneNumber = (num: string) => {
    if (!num) return "";
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.length === 10)
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    if (cleaned.length > 10) {
      const cc = cleaned.slice(0, cleaned.length - 10);
      const area = cleaned.slice(-10, -7);
      const first = cleaned.slice(-7, -4);
      const last = cleaned.slice(-4);
      return `+${cc} (${area}) ${first}-${last}`;
    }
    return num;
  };

  const formatPhoneInput = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
    if (cleaned.length <= 10)
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
  };

  // Después de verificar el OTP, isAuthenticated/profile se actualizan
  // juntos en un solo render (ver AuthContext.verifyOTP), así que este
  // efecto decide a qué step ir una vez que el contexto ya se sincronizó,
  // en vez de decidirlo a mano dentro del callback del verify con un fetch
  // aparte — eso era lo que mostraba el step de perfil a usuarios ya
  // registrados cuando ese fetch aparte llegaba con un perfil a medias.
  // Bloquea el body para que iOS no deje la pantalla desplazada al cerrar el teclado.
  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      height: document.body.style.height,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
    };
  }, []);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || step !== "verify") return;
    if (profile?.firstName) {
      navigateWithTable("/order-confirm");
    } else {
      setStep("profile");
    }
  }, [isAuthLoading, isAuthenticated, profile, step, navigateWithTable]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".country-selector")) setIsDropdownOpen(false);
    };
    if (isDropdownOpen)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

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
    } catch {
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
      if (!response.success) {
        setError(response.error || t("errorInvalidCode"));
      }
      // El useEffect que sincroniza con isAuthenticated/profile (arriba)
      // decide el siguiente step (profile u order-confirm) una vez que el
      // contexto se actualiza con el perfil ya resuelto por verifyOTP.
    } catch {
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
      if (response.success) setCountdown(60);
      else setError(response.error || t("errorResendCode"));
    } catch {
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
        navigateWithTable("/order-confirm");
      } else {
        setError(response.error || t("errorSaveProfile"));
      }
    } catch {
      setError(t("errorSaveProfile"));
    } finally {
      setLoading(false);
    }
  };

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="h-screen overflow-hidden brand-evergreen flex flex-col">
      <MenuHeaderBack />

      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="mb-6 md:mb-8 text-center">
            <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2">
              {step === "phone"
                ? tp("phoneStepTitle")
                : step === "verify"
                  ? t("verifyStepTitle")
                  : t("profileStepTitle")}
            </h1>
            <p className="text-white/80 text-sm md:text-base">
              {step === "phone"
                ? tp("phoneStepSubtitle")
                : step === "verify"
                  ? `${t("verifyStepSubtitlePrefix")} ${formatPhoneNumber(phone)}`
                  : t("profileStepSubtitle")}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-white text-sm">
              {error}
            </div>
          )}

          {/* Phone Step */}
          {step === "phone" && (
            <div className="space-y-4">
              <form onSubmit={handleSendOTP} className="space-y-3">
                <div className="space-y-2">
                  <div className="flex gap-3">
                    {/* Country Code Selector */}
                    <div className="relative country-selector">
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="h-[52px] w-[90px] px-3 text-gray-700 font-medium bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-even-evergreen cursor-pointer flex items-center justify-between gap-1.5"
                        disabled={loading}
                      >
                        <div className="flex items-center gap-1.5">
                          <Flag
                            code={
                              countries.find((c) => c.code === countryCode)
                                ?.flag || "MX"
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
                                style={{
                                  width: 20,
                                  height: 15,
                                  borderRadius: 2,
                                }}
                              />
                              <span className="text-sm font-medium text-gray-700">
                                {country.code}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Phone Input */}
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
                      <input
                        required
                        type="tel"
                        value={phoneNumberDisplay}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "");
                          setPhoneNumber(value);
                          setPhoneNumberDisplay(formatPhoneInput(value));
                        }}
                        className="h-[52px] w-full pl-10 pr-3 text-gray-700 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-even-evergreen"
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
                  className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3.5 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed active:scale-95"
                >
                  {loading ? t("sending") : tp("accessCta")}
                </button>
              </form>

              {/* Guest link */}
              <div className="text-center pt-1">
                <button
                  onClick={() =>
                    navigateWithTable(guestName ? "/order-confirm" : "/user")
                  }
                  className="text-white/70 hover:text-white text-sm underline underline-offset-2 transition-colors"
                >
                  {t("continueAsGuest")}
                </button>
              </div>
            </div>
          )}

          {/* OTP Step */}
          {step === "verify" && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full px-3 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-even-evergreen text-center tracking-widest text-2xl"
                required
                disabled={loading}
                autoFocus
                autoComplete="one-time-code"
              />
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3.5 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? t("verifying") : t("verifyCode")}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={countdown > 0 || loading}
                  className={`text-sm underline transition-colors ${
                    countdown > 0
                      ? "text-white/40 cursor-not-allowed"
                      : "text-white/80 hover:text-white cursor-pointer"
                  }`}
                >
                  {countdown > 0
                    ? t("resendIn", { seconds: countdown })
                    : t("resendCta")}
                </button>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setError("");
                  }}
                  className="text-sm text-white/80 hover:text-white underline"
                >
                  {t("changeNumber")}
                </button>
              </div>
            </form>
          )}

          {/* Profile Step */}
          {step === "profile" && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
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
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed mt-6"
              >
                {loading ? t("saving") : t("continueCta")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
