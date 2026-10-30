export const PACKAGE_NAME = "@even/api-client";
export type { ApiResponse, Requester } from "./types";
export { getBackendOrigin } from "./origin";
export {
  AUTH_TOKEN_STORAGE_KEY,
  GUEST_ID_STORAGE_KEY,
  createApiClient,
  readAuthTokenFromStorage,
  readGuestIdFromStorage,
  type ApiClientConfig,
} from "./request";
