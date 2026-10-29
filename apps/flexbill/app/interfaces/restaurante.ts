// Interface que coincide con la estructura de la base de datos
export interface Restaurant {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  billing_enabled?: boolean;
  opening_hours?: {
    [key: string]: {
      is_closed: boolean;
      open_time: string;
      close_time: string;
      is_all_day?: boolean;
    };
  };
  created_at: string;
  updated_at: string;
}

// Interface simplificada para uso en componentes
export interface RestaurantDisplay {
  id: number;
  name: string;
  description: string;
  logo: string;
  banner: string;
}
