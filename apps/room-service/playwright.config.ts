import { createPlaywrightConfig } from "@even/e2e";
import { API_URL } from "./e2e/mocks";

export default createPlaywrightConfig({ port: 3102, env: { NEXT_PUBLIC_API_URL: API_URL } });
