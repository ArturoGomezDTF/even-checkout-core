import { createPlaywrightConfig } from "@even/e2e";
import { API_URL } from "./e2e/api";

// La app asume que NEXT_PUBLIC_API_URL termina en /api (el CSP y algunos
// servicios lo quitan para obtener el host del backend).
export default createPlaywrightConfig({ port: 3101, env: { NEXT_PUBLIC_API_URL: API_URL } });
