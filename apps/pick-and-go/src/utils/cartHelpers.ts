/**
 * Cart Helper Utilities
 * Extracted and adapted from TableContext.tsx for reusability
 */

// ===============================================
// TYPES AND INTERFACES
// ===============================================

export interface CustomFieldOption {
  optionId: string;
  optionName: string;
  price: number;
}

export interface CustomField {
  fieldId: string;
  fieldName: string;
  selectedOptions: CustomFieldOption[];
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  description?: string;
  images?: string[];
  // Enhanced custom fields support
  customFields?: CustomField[];
  extraPrice?: number;
  // Legacy support for simple extras
  extras?: string[];
}

// ===============================================
// HELPER FUNCTIONS
// ===============================================

/**
 * Compare two sets of custom fields for equality
 * Extracted from TableContext.tsx [lines 214-234]
 */
export const areCustomFieldsEqual = (
  cf1?: CustomField[],
  cf2?: CustomField[],
): boolean => {
  if (!cf1 && !cf2) return true;
  if (!cf1 || !cf2) return false;
  if (cf1.length !== cf2.length) return false;

  return cf1.every((field1, index) => {
    const field2 = cf2[index];
    if (field1.fieldId !== field2.fieldId) return false;
    if (field1.selectedOptions.length !== field2.selectedOptions.length)
      return false;

    return field1.selectedOptions.every((opt1, idx) => {
      const opt2 = field2.selectedOptions[idx];
      return opt1.optionId === opt2.optionId;
    });
  });
};

/**
 * Calculate totals for cart items including extraPrice
 * Extracted from TableContext.tsx [lines 193-201]
 */
export const calculateTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + (item.price + (item.extraPrice || 0)) * item.quantity,
    0,
  );
  return { totalItems, totalPrice };
};

/**
 * Find existing cart item that matches ID and custom fields
 * Enhanced version based on TableContext logic
 */
export const findExistingCartItem = (
  items: CartItem[],
  targetItem: Partial<CartItem>,
): CartItem | undefined => {
  return items.find(
    (item) =>
      item.id === targetItem.id &&
      areCustomFieldsEqual(item.customFields, targetItem.customFields),
  );
};

/**
 * Add item to cart with intelligent consolidation
 * Based on TableContext ADD_ITEM_TO_CURRENT_USER logic [lines 213-265]
 */
export const addItemToCart = (
  currentItems: CartItem[],
  newItem: CartItem,
): CartItem[] => {
  const existingItem = findExistingCartItem(currentItems, newItem);

  if (existingItem) {
    // Item exists with same custom fields - increment quantity
    return currentItems.map((item) =>
      item.id === newItem.id &&
      areCustomFieldsEqual(item.customFields, newItem.customFields)
        ? { ...item, quantity: item.quantity + newItem.quantity }
        : item,
    );
  } else {
    // New item or different custom fields - add to cart
    return [...currentItems, newItem];
  }
};

/**
 * Update item quantity with custom fields support
 * Based on TableContext UPDATE_QUANTITY_CURRENT_USER logic [lines 281-321]
 */
export const updateCartItemQuantity = (
  currentItems: CartItem[],
  itemId: string,
  quantity: number,
  customFields?: CustomField[],
): CartItem[] => {
  return currentItems
    .map((item) =>
      item.id === itemId &&
      areCustomFieldsEqual(item.customFields, customFields)
        ? { ...item, quantity: Math.max(0, quantity) }
        : item,
    )
    .filter((item) => item.quantity > 0);
};

/**
 * Remove item from cart
 */
export const removeItemFromCart = (
  currentItems: CartItem[],
  itemId: string,
  customFields?: CustomField[],
): CartItem[] => {
  if (customFields) {
    // Remove specific variant with custom fields
    return currentItems.filter(
      (item) =>
        !(
          item.id === itemId &&
          areCustomFieldsEqual(item.customFields, customFields)
        ),
    );
  } else {
    // Remove all variants of this item
    return currentItems.filter((item) => item.id !== itemId);
  }
};

/**
 * Clear entire cart
 */
export const clearCart = (): CartItem[] => {
  return [];
};

// ===============================================
// USER AUTHENTICATION HELPERS
// ===============================================

/**
 * Determine user authentication status and info
 * Based on TableContext authentication logic [lines 814-826]
 */
export const getUserAuthInfo = (
  isLoaded: boolean,
  user: any,
  profile?: any,
) => {
  const isAuthenticated = isLoaded && user;

  if (isAuthenticated) {
    return {
      isAuthenticated: true,
      userId: user.id,
      displayName:
        profile?.fullName || profile?.firstName || user.email || "User",
      email: user.email,
      guestId: null,
    };
  } else {
    // Guest user logic
    const guestId =
      typeof window !== "undefined"
        ? localStorage.getItem("even-guest-id")
        : null;

    const guestName =
      typeof window !== "undefined"
        ? localStorage.getItem("even-guest-name")
        : null;

    return {
      isAuthenticated: false,
      userId: null,
      displayName: guestName || "Guest",
      email: null,
      guestId,
    };
  }
};

/**
 * Save guest information to localStorage
 */
export const saveGuestInfo = (name: string, guestId?: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("even-guest-name", name);
    if (guestId) {
      localStorage.setItem("even-guest-id", guestId);
    }
  }
};

/**
 * Generate unique guest ID
 */
export const generateGuestId = (): string => {
  return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ===============================================
// VALIDATION HELPERS
// ===============================================

/**
 * Validate cart item before adding
 * Note: id is optional since it gets generated in addToCart
 */
export const validateCartItem = (item: Partial<CartItem>): boolean => {
  return !!(
    item.name &&
    typeof item.price === "number" &&
    item.price >= 0 &&
    typeof item.quantity === "number" &&
    item.quantity > 0
  );
};

/**
 * Validate custom fields structure
 */
export const validateCustomFields = (customFields?: CustomField[]): boolean => {
  if (!customFields) return true;

  return customFields.every(
    (field) =>
      field.fieldId &&
      field.fieldName &&
      Array.isArray(field.selectedOptions) &&
      field.selectedOptions.every(
        (option) =>
          option.optionId &&
          option.optionName &&
          typeof option.price === "number",
      ),
  );
};
