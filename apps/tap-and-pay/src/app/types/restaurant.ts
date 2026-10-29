export interface Restaurant {
  id: number;
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  billing_enabled?: boolean;
}

export interface Branch {
  id: number;
  restaurant_id: number;
  branch_number: number;
  name: string;
  address?: string;
}

export interface RestaurantParams {
  restaurantId: string;
  branchNumber: string;
  tableNumber?: string;
}
