"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

/**
 * Sincroniza el firstName del perfil con cartState.userName cuando el usuario
 * está logueado. Así todos los handlers de pago tienen el nombre disponible
 * sin importar el orden en que carguen los contextos.
 */
export default function AuthCartSync() {
  const { profile } = useAuth();
  const { state: cartState, setUserName } = useCart();

  useEffect(() => {
    if (profile?.firstName && !cartState.userName) {
      setUserName(profile.firstName);
    }
  }, [profile?.firstName, cartState.userName, setUserName]);

  return null;
}
