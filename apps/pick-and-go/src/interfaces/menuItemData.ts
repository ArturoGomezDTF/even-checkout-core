// Custom field para campos personalizados del menú
export interface CustomFieldOption {
  id: string;
  name: string;
  price: number;
  agotado?: boolean;
}

export interface CustomField {
  id: string;
  name: string;
  type: string;
  options?: CustomFieldOption[];
  required?: boolean;
  maxSelections?: number;
  // Solo lo traen items sincronizados de un POS con addons/modificadores
  // (ej. Givex) — "addon" (con precio) vs "modifier" (sin precio, ej. tipo
  // de pan). Necesario para reconstruir addon_list/modifier_list al armar
  // la orden en el POS.
  origin?: "addon" | "modifier";
}

// Interface que coincide con la estructura de la base de datos
export interface MenuItem {
  id: number;
  section_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  discount: number;
  custom_fields: CustomField[];
  is_available: boolean;
  is_out_of_stock?: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Interface legacy para compatibilidad con código existente
export interface MenuItemData {
  id: number;
  name: string;
  description: string;
  price: number;
  images: string[];
  features: string[];
  discount: number;
  customFields?: Array<{
    fieldId: string;
    fieldName: string;
    origin?: "addon" | "modifier";
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
      quantity: number;
    }>;
  }>;
  extraPrice?: number;
  specialInstructions?: string | null;
  // Descuento de producto que aplica a este platillo para el
  // usuario actual — viaja al agregar al carrito para que el backend lo
  // valide y lo aplique (ver add_to_cart). null/undefined = ninguno.
  userDiscountId?: string | null;
}
