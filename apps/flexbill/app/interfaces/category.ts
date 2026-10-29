import { MenuItemData, MenuItem } from "./menuItemData";

// Interface que coincide con la estructura de la base de datos (menu_sections)
export interface MenuSection {
  id: number;
  name: string;
  is_active: boolean;
  display_order: number;
  restaurant_id: number;
  created_at: string;
  updated_at: string;
  items: MenuItem[];
}

// Interface legacy para compatibilidad con código existente
export interface Category {
  id: number;
  category: string;
  icon: string;
  items: MenuItemData[];
}