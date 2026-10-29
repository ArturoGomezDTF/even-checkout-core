import { Restaurant } from "../interfaces/restaurante";

// Datos centralizados del restaurante
export const restaurantData: Restaurant = {
  id: 1,
  user_id: 1,
  name: "Café Delicias",
  description: "Sabores auténticos que despiertan tus sentidos",
  logo_url: "/restaurant-logo.png",
  banner_url: null,
  address: null,
  phone: null,
  email: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Función para obtener los datos del restaurante
export function getRestaurantData(): Restaurant {
  return restaurantData;
}
