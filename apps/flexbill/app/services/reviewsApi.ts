import { apiService, ApiResponse } from "../utils/api";

export interface Review {
  id: number;
  menu_item_id: number;
  reviewer_identifier: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewStats {
  menu_item_id: number;
  total_reviews: number;
  average_rating: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  two_star_count: number;
  one_star_count: number;
  last_review_date: string;
}

// Wrapper type para respuestas del backend que tienen estructura anidada { data: { data: T } }
export interface NestedApiResponse<T> {
  data: T;
}

// Acceso al método privado makeRequest a través de casting
export const reviewsApi = {
  // Crear una review
  async createReview(data: {
    menu_item_id: number;
    rating: number;
    user_id?: string | null;
    guest_id?: string | null;
  }): Promise<ApiResponse<Review>> {
    return (apiService as any).makeRequest("/restaurants/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Obtener reviews de un platillo
  async getReviewsByMenuItem(
    menuItemId: number
  ): Promise<ApiResponse<Review[]>> {
    return (apiService as any).makeRequest(
      `/restaurants/reviews/menu-item/${menuItemId}`
    );
  },

  // Obtener estadísticas de un platillo
  async getMenuItemStats(
    menuItemId: number
  ): Promise<ApiResponse<NestedApiResponse<ReviewStats>>> {
    return (apiService as any).makeRequest(
      `/restaurants/reviews/menu-item/${menuItemId}/stats`
    );
  },

  // Obtener review del usuario actual para un platillo
  async getMyReview(
    menuItemId: number,
    userId: string | null,
    guestId: string | null
  ): Promise<ApiResponse<NestedApiResponse<Review | null>>> {
    // Agregar guest_id como query param si existe
    const queryParam = userId || guestId;

    return (apiService as any).makeRequest(
      `/restaurants/reviews/menu-item/${menuItemId}/my-review/${queryParam}`
    );
  },

  // Actualizar una review
  async updateReview(
    reviewId: number,
    rating: number,
    user_id: string | null,
    guest_id: string | null
  ): Promise<ApiResponse<Review>> {
    return (apiService as any).makeRequest(`/restaurants/reviews/${reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ rating, user_id, guest_id }),
    });
  },

  // Eliminar una review
  async deleteReview(
    reviewId: number
  ): Promise<ApiResponse<{ message: string }>> {
    return (apiService as any).makeRequest(`/restaurants/reviews/${reviewId}`, {
      method: "DELETE",
    });
  },
};
