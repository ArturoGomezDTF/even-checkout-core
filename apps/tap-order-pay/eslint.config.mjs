import { defineConfig } from "eslint/config";
import evenConfig from "@even/eslint-config";

export default defineConfig([
  ...evenConfig,
  {
    // Código heredado del repo even-tap-order-pay: estas reglas eran warning
    // allí (o no existían antes de eslint-config-next 16). Se dejan en warning
    // para migrar sin tocar el flujo de cobro; corregirlas en PRs aparte.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);
