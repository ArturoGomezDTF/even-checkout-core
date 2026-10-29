import { useState, useEffect } from "react";

// Hook para detectar si el navegador soporta autenticación con Passkeys (WebAuthn)

export function usePasskeySupport() {
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        // Verificar si el navegador soporta WebAuthn
        if (
          window.PublicKeyCredential &&
          typeof window.PublicKeyCredential === "function"
        ) {
          // Verificar si hay autenticadores disponibles
          const available =
            await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsSupported(available);
        } else {
          setIsSupported(false);
        }
      } catch (error) {
        console.error("Error al verificar soporte de Passkey:", error);
        setIsSupported(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
  }, []);

  return { isSupported, isLoading };
}
