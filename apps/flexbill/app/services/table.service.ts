// Table Service - Handles all table and order operations
// This service separates table/order concerns from the generic API service

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    message: string;
    details?: any;
  };
}

// ===============================================
// TYPES
// ===============================================

export interface DishOrder {
  dish_order_id: string;
  menu_item_id?: number | null;
  item: string;
  quantity: number;
  price: number;
  total_price: number;
  // Precio con la comisión de Flex Bill ya incrustada (ver
  // commissionCalculator.js en el backend) — lo que se le muestra al
  // cliente en vez de price/total_price.
  display_price?: number;
  total_display_price?: number;
  status: "pending" | "preparing" | "ready" | "delivered";
  payment_status: "not_paid" | "paid";
  user_id?: string;
  guest_id?: string | null;
  guest_name: string;
  table_order_id: string;
  images: string[];
  custom_fields?: any;
  extra_price?: number;
  is_promo_item?: boolean;
  promo_discount_percentage?: number | null;
}

export interface TableSummary {
  restaurant_id: number;
  branch_number: number;
  table_number: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  no_items: number;
  status: "not_paid" | "partial" | "paid";
}

export interface ActiveUser {
  id: string;
  restaurant_id: number;
  branch_number: number;
  table_number: string;
  user_id?: string;
  guest_id?: string;
  guest_name: string;
  total_paid_individual: number;
  total_paid_amount: number;
  updated_at: string;
}

export interface EqualSplitSelection {
  id: string;
  restaurant_id: number;
  branch_number: number;
  table_number: string;
  included_active_user_ids: string[];
  created_at: string;
  updated_at: string;
}

// ===============================================
// HELPER FUNCTIONS
// ===============================================

async function makeRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Get auth token from localStorage
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("even_access_token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        // For guests, add guest identification headers
        const guestId = localStorage.getItem("even-guest-id");
        if (guestId) {
          headers["x-guest-id"] = guestId;
        }

        const tableNumber = localStorage.getItem("even-table-number");
        if (tableNumber) {
          headers["x-table-number"] = tableNumber;
        }
      }

      // Sesión de mesa (Flex Bill) — obligatoria para crear órdenes, sin
      // importar si el guest está autenticado o no (la sesión es de mesa,
      // no de usuario). Ver even-backend/src/middleware/tableSessionAuth.js.
      const tableSession = localStorage.getItem("even-table-session");
      if (tableSession) {
        headers["x-table-session"] = tableSession;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          type: "http_error",
          message:
            data.message || data.error?.message || `HTTP Error: ${response.status}`,
          details: data,
        },
      };
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error("Table Service - API Request failed:", error);

    return {
      success: false,
      error: {
        type: "network_error",
        message:
          error instanceof Error ? error.message : "Network error occurred",
        details: error,
      },
    };
  }
}

// ===============================================
// TABLE OPERATIONS
// ===============================================

/**
 * Get table summary information
 */
async function getTableSummary(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/summary`,
  );
}

/**
 * Get table orders
 */
async function getTableOrders(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/orders`,
  );
}

/**
 * Get active users for a table
 */
async function getActiveUsers(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/active-users`,
  );
}

/**
 * Get the current "Dividir cuenta" selection for a table (or null if nobody
 * has set one yet)
 */
async function getEqualSplitSelection(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/equal-split-selection`,
  );
}

/**
 * Set the "Dividir cuenta" selection for a table — idempotent, si ya existe
 * una selección devuelve esa en vez de sobreescribirla (ver backend).
 */
async function setEqualSplitSelection(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
  includedActiveUserIds: string[],
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/equal-split-selection`,
    {
      method: "POST",
      body: JSON.stringify({ includedActiveUserIds }),
    },
  );
}

/**
 * Get all tables for a restaurant branch
 */
async function getAllTables(
  restaurantId: string,
  branchNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables`,
  );
}

/**
 * Check table availability
 */
async function checkTableAvailability(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/availability`,
  );
}

/**
 * Best-effort: pull dishes added directly at the POS terminal into flex-bill.
 * No-ops silently if the branch has no POS integration or the agent is offline.
 */
async function syncOrderFromPOS(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/sync-from-pos`,
    { method: "POST" },
  );
}

// ===============================================
// ORDER OPERATIONS
// ===============================================

/**
 * Create a new dish order for a table
 */
async function createDishOrder(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
  userId: string | null,
  guestName: string,
  item: string,
  quantity: number,
  price: number,
  guestId?: string | null,
  images: string[] = [],
  customFields?: Array<{
    fieldId: string;
    fieldName: string;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
    }>;
  }>,
  extraPrice?: number,
  menuItemId?: number | null,
  orderNotes?: string | null,
  specialInstructions?: string | null,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/dishes`,
    {
      method: "POST",
      body: JSON.stringify({
        userId,
        guestName,
        item,
        quantity,
        price,
        guestId,
        images,
        customFields,
        extraPrice,
        menuItemId,
        orderNotes: orderNotes || null,
        specialInstructions: specialInstructions || null,
      }),
    },
  );
}

/**
 * Create multiple dish orders for a table in a single request (cart submit).
 * Backend emits ONE print job for all items, so the kitchen gets one ticket
 * per printer/category instead of one ticket per item.
 */
async function createMultipleDishOrders(
  restaurantId: string,
  branchNumber: string,
  tableNumber: string,
  userId: string | null,
  guestName: string,
  items: Array<{
    item: string;
    quantity: number;
    price: number;
    images?: string[];
    customFields?: Array<{
      fieldId: string;
      fieldName: string;
      selectedOptions: Array<{
        optionId: string;
        optionName: string;
        price: number;
      }>;
    }> | null;
    extraPrice?: number;
    menuItemId?: number | null;
    specialInstructions?: string | null;
  }>,
  guestId?: string | null,
  orderNotes?: string | null,
): Promise<ApiResponse<any>> {
  return makeRequest(
    `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/dishes/bulk`,
    {
      method: "POST",
      body: JSON.stringify({
        userId,
        guestName,
        guestId,
        orderNotes: orderNotes || null,
        items,
      }),
    },
  );
}

/**
 * Update dish status (for kitchen)
 */
async function updateDishStatus(
  dishId: string,
  status: string,
): Promise<ApiResponse<any>> {
  return makeRequest(`/dishes/${dishId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ===============================================
// EXPORTS
// ===============================================

export const tableService = {
  // Table operations
  getTableSummary,
  getTableOrders,
  getActiveUsers,
  getEqualSplitSelection,
  setEqualSplitSelection,
  getAllTables,
  checkTableAvailability,
  syncOrderFromPOS,

  // Order operations
  createDishOrder,
  createMultipleDishOrders,
  updateDishStatus,
};
