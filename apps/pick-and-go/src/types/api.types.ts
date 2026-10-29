/**
 * Tipos compartidos para todas las llamadas API
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string | {
    type: string;
    message: string;
    details?: any;
  };
}

// Tipo para respuestas con estructura anidada { data: { data: T } }
export interface NestedDataResponse<T> {
  data: T;
}

export interface ApiConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
