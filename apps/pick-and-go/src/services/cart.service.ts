import { requestWithAuth, type ApiResponse } from "./request-helper";

export interface CartItem {
  id: string; // cart_item_id
  menu_item_id: number;
  name: string;
  description: string;
  images: string[];
  features: string[];
  quantity: number;
  price: number;
  discount: number;
  extraPrice: number;
  customFields: Array<{
    fieldId: string;
    fieldName: string;
    origin?: "addon" | "modifier";
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
      quantity?: number;
    }>;
  }>;
  specialInstructions?: string | null;
  subtotal: number;
  isPromoItem?: boolean;
  promoDiscountPercentage?: number | null;
  userDiscountId?: string | null;
}

export interface Cart {
  cart_id: string | null;
  items: CartItem[];
  total_items: number;
  total_amount: number;
  order_notes?: string | null;
}

export interface CartTotals {
  cart_id: string | null;
  total_items: number;
  total_amount: number;
}

class CartService {
  private supabaseUserId: string | null = null;
  private restaurantId: number | null = null;
  private branchNumber: number | null = null;

  // Establecer el supabase_user_id manualmente (cambio de Clerk a Supabase)
  public setSupabaseUserId(userId: string | null) {
    this.supabaseUserId = userId;
  }

  // Establecer el restaurant_id manualmente
  public setRestaurantId(restaurantId: number | null) {
    this.restaurantId = restaurantId;
  }

  // Establecer el branch_number manualmente
  public setBranchNumber(branchNumber: number | null) {
    this.branchNumber = branchNumber;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    return requestWithAuth<T>(endpoint, options);
  }

  /**
   * Obtener guest_id desde localStorage
   * Solo lee el guest_id existente - NO genera uno nuevo
   */
  private getGuestId(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("even-guest-id") || "";
  }

  // Obtener identificador de usuario (user_id o guest_id)
  private getUserIdentifier(): { user_id?: string; guest_id?: string } {
    if (this.supabaseUserId) {
      return { user_id: this.supabaseUserId };
    }
    return { guest_id: this.getGuestId() };
  }

  // Agregar item al carrito
  async addToCart(
    menuItemId: number,
    quantity: number = 1,
    customFields: CartItem["customFields"] = [],
    extraPrice: number = 0,
    price?: number,
    specialInstructions?: string | null,
    userDiscountId?: string | null,
  ): Promise<ApiResponse<{ cart_item_id: string }>> {
    const userId = this.getUserIdentifier();

    const body: any = {
      ...userId,
      menu_item_id: menuItemId,
      quantity,
      custom_fields: customFields,
      extra_price: extraPrice,
      restaurant_id: this.restaurantId,
      branch_number: this.branchNumber,
      special_instructions: specialInstructions || null,
    };

    // Si se proporciona un precio específico, incluirlo en el request
    if (price !== undefined) {
      body.price = price;
    }

    // Descuento de producto de main-portal — el backend valida que
    // sea del usuario/platillo y calcula el precio final él mismo.
    if (userDiscountId) {
      body.user_discount_id = userDiscountId;
    }

    return this.request<{ cart_item_id: string }>("/cart", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Obtener carrito completo
  async getCart(): Promise<ApiResponse<Cart>> {
    const userId = this.getUserIdentifier();
    const params = new URLSearchParams(userId as Record<string, string>);

    if (this.restaurantId) {
      params.append("restaurant_id", this.restaurantId.toString());
    }

    if (this.branchNumber) {
      params.append("branch_number", this.branchNumber.toString());
    }

    return this.request<Cart>(`/cart?${params.toString()}`);
  }

  // Obtener solo totales del carrito (más rápido)
  async getCartTotals(): Promise<ApiResponse<CartTotals>> {
    const userId = this.getUserIdentifier();
    const params = new URLSearchParams(userId as Record<string, string>);

    if (this.restaurantId) {
      params.append("restaurant_id", this.restaurantId.toString());
    }

    if (this.branchNumber) {
      params.append("branch_number", this.branchNumber.toString());
    }

    return this.request<CartTotals>(`/cart/totals?${params.toString()}`);
  }

  // Actualizar cantidad de un item
  async updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/cart/items/${cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  }

  // Editar opciones, notas y cantidad de un item
  async updateCartItem(
    cartItemId: string,
    menuItemId: number,
    quantity: number,
    customFields: CartItem["customFields"] = [],
    extraPrice: number = 0,
    price: number,
    specialInstructions?: string | null,
  ): Promise<ApiResponse<{ cart_item_id: string }>> {
    return this.request<{ cart_item_id: string }>(`/cart/items/${cartItemId}`, {
      method: "PUT",
      body: JSON.stringify({
        ...this.getUserIdentifier(),
        menu_item_id: menuItemId,
        quantity,
        custom_fields: customFields,
        extra_price: extraPrice,
        price,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
        special_instructions: specialInstructions || null,
      }),
    });
  }

  // Eliminar item del carrito
  async removeFromCart(
    cartItemId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/cart/items/${cartItemId}`, {
      method: "DELETE",
    });
  }

  // Limpiar todo el carrito
  async clearCart(): Promise<ApiResponse<{ message: string }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ message: string }>("/cart", {
      method: "DELETE",
      body: JSON.stringify({
        ...userId,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
      }),
    });
  }

  // Actualizar notas de la orden
  async updateOrderNotes(
    orderNotes: string | null,
  ): Promise<ApiResponse<{ message: string }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ message: string }>("/cart/notes", {
      method: "PATCH",
      body: JSON.stringify({
        ...userId,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
        order_notes: orderNotes || null,
      }),
    });
  }

  // Obtener el guest_id actual
  getGuestIdForUser(): string {
    return this.getGuestId();
  }

  // Migrar carrito de invitado a usuario autenticado
  async migrateGuestCart(
    guestId: string,
    userId: string,
  ): Promise<
    ApiResponse<{ items_migrated: number; cart_id: string; message: string }>
  > {
    return this.request<{
      items_migrated: number;
      cart_id: string;
      message: string;
    }>("/cart/migrate", {
      method: "POST",
      body: JSON.stringify({
        guest_id: guestId,
        user_id: userId, // Cambiado de clerk_user_id a user_id
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
      }),
    });
  }

  // Actualizar branch_number de los items del carrito en la base de datos
  async updateCartBranch(
    newBranchNumber: number,
  ): Promise<ApiResponse<{ message: string; items_updated: number }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ message: string; items_updated: number }>(
      "/cart/update-branch",
      {
        method: "PATCH",
        body: JSON.stringify({
          ...userId,
          restaurant_id: this.restaurantId,
          new_branch_number: newBranchNumber,
        }),
      },
    );
  }
}

export const cartService = new CartService();
