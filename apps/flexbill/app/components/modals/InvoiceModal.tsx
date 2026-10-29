"use client";

import { useState, useEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  X,
  FileText,
  Eye,
  Check,
  Mail,
  Download,
  Loader2,
  ChevronLeft,
  Calendar,
} from "lucide-react";
import {
  invoiceService,
  type FiscalData,
  type BillingProfile,
} from "@/app/services/invoice.service";
import { lockScroll, unlockScroll } from "@/app/utils/scrollLock";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";

// SAT catalog values shown in dropdowns
const REGIMEN_FISCAL_OPTIONS = [
  { value: "601", label: "601 – General de Ley Personas Morales" },
  { value: "603", label: "603 – Personas Morales con Fines no Lucrativos" },
  {
    value: "605",
    label: "605 – Sueldos y Salarios e Ingresos Asimilados a Salarios",
  },
  { value: "606", label: "606 – Arrendamiento" },
  {
    value: "607",
    label: "607 – Régimen de Enajenación o Adquisición de Bienes",
  },
  { value: "608", label: "608 – Demás ingresos" },
  { value: "609", label: "609 – Consolidación" },
  {
    value: "610",
    label:
      "610 – Residentes en el Extranjero sin Establecimiento Permanente en México",
  },
  {
    value: "611",
    label: "611 – Ingresos por Dividendos (socios y accionistas)",
  },
  {
    value: "612",
    label:
      "612 – Personas Físicas con Actividades Empresariales y Profesionales",
  },
  { value: "614", label: "614 – Ingresos por intereses" },
  {
    value: "615",
    label: "615 – Régimen de los ingresos por obtención de premios",
  },
  { value: "616", label: "616 – Sin obligaciones fiscales" },
  {
    value: "620",
    label:
      "620 – Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  },
  { value: "621", label: "621 – Incorporación Fiscal" },
  {
    value: "622",
    label: "622 – Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  },
  { value: "623", label: "623 – Opcional para Grupos de Sociedades" },
  { value: "624", label: "624 – Coordinados" },
  {
    value: "625",
    label:
      "625 – Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  },
  { value: "626", label: "626 – Régimen Simplificado de Confianza (RESICO)" },
];

const USO_CFDI_OPTIONS = [
  { value: "G01", label: "G01 – Adquisición de mercancias" },
  { value: "G03", label: "G03 – Gastos en general" },
  { value: "S01", label: "S01 – Sin efectos fiscales" },
];

type Step = "info" | "form" | "preview" | "done";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  restaurantId: number;
  isAuthenticated: boolean;
  onInvoiceCreated?: (invoiceId: string) => void;
  existingInvoiceId?: string | null;
}

export default function InvoiceModal({
  isOpen,
  onClose,
  transactionId,
  restaurantId,
  isAuthenticated,
  onInvoiceCreated,
  existingInvoiceId,
}: Props) {
  const t = useTranslations("InvoiceModal");
  const format = useFormatter();
  const [step, setStep] = useState<Step>("info");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingCreate, setIsLoadingCreate] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const [fiscalData, setFiscalData] = useState<FiscalData>({
    rfc: "",
    razonSocial: "",
    regimenFiscal: "601",
    codigoPostal: "",
    email: "",
    usoCfdi: "G03",
  });

  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  const prevBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isOpen]);

  // Load billing profile for registered users
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    setIsLoadingProfile(true);
    invoiceService
      .getBillingProfile()
      .then((profile: BillingProfile | null) => {
        if (profile) {
          setFiscalData({
            rfc: profile.rfc,
            razonSocial: profile.razon_social,
            regimenFiscal: profile.regimen_fiscal,
            codigoPostal: profile.codigo_postal,
            email: profile.email || "",
            usoCfdi: profile.uso_cfdi || "G03",
          });
          setEmailInput(profile.email || "");
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingProfile(false));
  }, [isOpen, isAuthenticated]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setStep("info");
      setError(null);
      setPreviewBlobUrl(null);
      setInvoiceId(null);
      setEmailSent(false);
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
    }
  }, [isOpen]);

  // Jump straight to done step when reopening an already-issued invoice
  useEffect(() => {
    if (isOpen && existingInvoiceId) {
      setInvoiceId(existingInvoiceId);
      setStep("done");
    }
  }, [isOpen, existingInvoiceId]);

  // El back gesto/botón del dispositivo: en "preview" retrocede a "form"
  // (mismo destino que el chevron de la UI); en el resto, cierra el modal
  // completo (mismo efecto que la X/backdrop).
  const handleBack = (rearm?: () => void) => {
    if (step === "preview") {
      setStep("form");
      rearm?.();
      return;
    }
    onClose();
  };

  useModalBackClose(isOpen, handleBack);

  if (!isOpen) return null;

  const lastDayOfMonth = format.dateTime(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    { day: "numeric", month: "long", year: "numeric" },
  );

  function updateField(field: keyof FiscalData, value: string) {
    setFiscalData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function validateForm(): boolean {
    if (!fiscalData.rfc.trim()) {
      setError(t("errorRfcRequired"));
      return false;
    }
    if (!fiscalData.razonSocial.trim()) {
      setError(t("errorRazonSocialRequired"));
      return false;
    }
    if (!fiscalData.regimenFiscal) {
      setError(t("errorRegimenFiscalRequired"));
      return false;
    }
    if (!fiscalData.codigoPostal.trim()) {
      setError(t("errorCodigoPostalRequired"));
      return false;
    }
    if (!fiscalData.usoCfdi) {
      setError(t("errorUsoCfdiRequired"));
      return false;
    }
    return true;
  }

  async function handlePreview() {
    if (!validateForm()) return;
    setIsLoadingPreview(true);
    setError(null);
    try {
      const blob = await invoiceService.previewInvoice(
        transactionId,
        fiscalData,
        restaurantId,
      );
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      const url = URL.createObjectURL(blob);
      prevBlobRef.current = url;
      setPreviewBlobUrl(url);
      setStep("preview");
    } catch (err: any) {
      setError(err.message || t("errorPreview"));
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleCreate() {
    setIsLoadingCreate(true);
    setError(null);
    try {
      const result = await invoiceService.createInvoice(
        transactionId,
        fiscalData,
        restaurantId,
      );
      setInvoiceId(result.invoiceId);
      setEmailInput(fiscalData.email || "");
      setStep("done");
      onInvoiceCreated?.(result.invoiceId);
    } catch (err: any) {
      setError(err.message || t("errorCreate"));
    } finally {
      setIsLoadingCreate(false);
    }
  }

  async function handleDownload() {
    if (!invoiceId) return;
    try {
      const blob = await invoiceService.downloadInvoicePdf(
        invoiceId,
        restaurantId,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `factura-${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("errorDownload"));
    }
  }

  async function handleSendEmail() {
    if (!invoiceId || !emailInput.trim()) return;
    setIsSendingEmail(true);
    setError(null);
    try {
      await invoiceService.sendInvoiceByEmail(
        invoiceId,
        restaurantId,
        emailInput.trim(),
      );
      setEmailSent(true);
    } catch (err: any) {
      setError(err.message || t("errorSendEmail"));
    } finally {
      setIsSendingEmail(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-9999 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-even-offwhite w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b border-black/10">
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button
                onClick={() => setStep("form")}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-even-evergreen" />
              </button>
            )}
            <h2 className="text-even-evergreen font-medium text-lg">
              {step === "info" && t("stepInfoTitle")}
              {step === "form" && t("stepFormTitle")}
              {step === "preview" && t("previewTitle")}
              {step === "done" && t("stepDoneTitle")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5 text-even-evergreen" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* STEP 0: Info */}
          {step === "info" && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-even-grass/20 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-even-evergreen" />
              </div>
              <div className="space-y-2">
                <p className="text-even-evergreen font-medium text-base">
                  {t("billingDeadlineTitle")}
                </p>
                <p className="text-sm text-black/55 leading-relaxed">
                  {t.rich("billingDeadlineMessage", {
                    date: lastDayOfMonth,
                    strong: (chunks) => (
                      <span className="font-semibold text-even-evergreen">
                        {chunks}
                      </span>
                    ),
                  })}
                </p>
              </div>
            </div>
          )}

          {/* STEP 1: Formulario */}
          {step === "form" && (
            <div className="space-y-4">
              {isLoadingProfile && (
                <div className="flex items-center gap-2 text-even-shamrock text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("loadingSavedData")}
                </div>
              )}

              <Field label="RFC">
                <input
                  type="text"
                  value={fiscalData.rfc}
                  onChange={(e) =>
                    updateField("rfc", e.target.value.toUpperCase())
                  }
                  placeholder="XAXX010101000"
                  maxLength={13}
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                />
              </Field>

              <Field label={t("razonSocialLabel")}>
                <input
                  type="text"
                  value={fiscalData.razonSocial}
                  onChange={(e) =>
                    updateField("razonSocial", e.target.value.toUpperCase())
                  }
                  placeholder="MI EMPRESA SA DE CV"
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                />
              </Field>

              <Field label={t("regimenFiscalLabel")}>
                <select
                  value={fiscalData.regimenFiscal}
                  onChange={(e) => updateField("regimenFiscal", e.target.value)}
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                >
                  {REGIMEN_FISCAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("codigoPostalLabel")}>
                <input
                  type="text"
                  value={fiscalData.codigoPostal}
                  onChange={(e) => updateField("codigoPostal", e.target.value)}
                  placeholder="06600"
                  maxLength={5}
                  inputMode="numeric"
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                />
              </Field>

              <Field label={t("usoCfdiLabel")}>
                <select
                  value={fiscalData.usoCfdi}
                  onChange={(e) => updateField("usoCfdi", e.target.value)}
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                >
                  {USO_CFDI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("emailLabelOptional")}>
                <input
                  type="email"
                  value={fiscalData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="correo@empresa.com"
                  className="w-full bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                />
              </Field>

              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          )}

          {/* STEP 2: PDF Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-black/50">{t("previewDisclaimer")}</p>
              {previewBlobUrl && (
                <a
                  href={previewBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full border border-black/10 rounded-xl py-4 text-sm font-medium text-even-evergreen hover:bg-black/5 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  {t("openPreview")}
                </a>
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          )}

          {/* STEP 3: Listo */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-even-grass flex items-center justify-center">
                  <Check className="w-7 h-7 text-even-evergreen" />
                </div>
                <p className="text-even-evergreen font-medium text-center">
                  {t("invoiceIssuedSuccess")}
                </p>
              </div>

              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 bg-even-evergreen text-even-grass rounded-2xl py-4 font-medium text-sm hover:bg-even-evergreen/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                {t("downloadPdf")}
              </button>

              <div className="space-y-2">
                <p className="text-xs text-black/50 uppercase tracking-wide">
                  {t("sendByEmail")}
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailSent(false);
                    }}
                    placeholder="correo@empresa.com"
                    className="flex-1 bg-white border border-black/15 rounded-xl px-4 py-3 text-even-evergreen placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-even-grass text-sm"
                  />
                  <button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailInput.trim()}
                    className="flex items-center gap-1.5 bg-even-grass text-even-evergreen px-4 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-even-grass/90 transition-colors"
                  >
                    {isSendingEmail ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : emailSent ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    {emailSent ? t("sent") : t("send")}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {step === "info" && (
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-black/10">
            <button
              onClick={() => setStep("form")}
              className="w-full flex items-center justify-center gap-2 bg-even-evergreen text-even-grass rounded-2xl py-4 font-medium text-sm hover:bg-even-evergreen/90 transition-colors"
            >
              {t("continueCta")}
            </button>
          </div>
        )}

        {step === "form" && (
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-black/10">
            <button
              onClick={handlePreview}
              disabled={isLoadingPreview}
              className="w-full flex items-center justify-center gap-2 bg-even-evergreen text-even-grass rounded-2xl py-4 font-medium text-sm disabled:opacity-60 hover:bg-even-evergreen/90 transition-colors"
            >
              {isLoadingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {t("previewTitle")}
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-black/10">
            <button
              onClick={handleCreate}
              disabled={isLoadingCreate}
              className="w-full flex items-center justify-center gap-2 bg-even-grass text-even-evergreen rounded-2xl py-4 font-medium text-sm disabled:opacity-60 hover:bg-even-grass/90 transition-colors"
            >
              {isLoadingCreate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {t("issueInvoiceCta")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-black/50 uppercase tracking-wide font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
