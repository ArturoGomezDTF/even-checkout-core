import { Restaurant } from "../interfaces/restaurant";

// Datos centralizados del restaurante - Datos de ejemplo para Pick & Go
export const restaurantData: Restaurant = {
  id: 3,
  user_id: 1,
  name: "Café Delicias",
  description: "Sabores auténticos que despiertan tus sentidos",
  logo_url: "/restaurant-logo.png",
  banner_url: "/restaurant-banner.png",
  address: "Calle Principal 123, Ciudad",
  phone: "+52 55 1234 5678",
  email: "info@cafedelicias.com",
  is_active: true,
  opening_hours: {
    monday: { is_closed: false, open_time: "08:00", close_time: "22:00" },
    tuesday: { is_closed: false, open_time: "08:00", close_time: "22:00" },
    wednesday: { is_closed: false, open_time: "08:00", close_time: "22:00" },
    thursday: { is_closed: false, open_time: "08:00", close_time: "22:00" },
    friday: { is_closed: false, open_time: "08:00", close_time: "23:00" },
    saturday: { is_closed: false, open_time: "09:00", close_time: "23:00" },
    sunday: { is_closed: false, open_time: "09:00", close_time: "21:00" }
  },
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z"
};

// Función para obtener los datos del restaurante
export function getRestaurantData(): Restaurant {
  return restaurantData;
}

// Función para obtener datos específicos del restaurante con datos dinámicos
export function getRestaurantDataWithId(id: number): Restaurant {
  return {
    ...restaurantData,
    id: id
  };
}