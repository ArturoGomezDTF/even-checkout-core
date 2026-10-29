import { requestWithAuth, type ApiResponse } from "./request-helper";

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

class ReviewsService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return requestWithAuth<T>(endpoint, options);
  }

  // Crear una review
  async createReview(data: {
    menu_item_id: number;
    rating: number;
    user_id?: string | null;
    guest_id?: string | null;
  }): Promise<ApiResponse<Review>> {
    return this.request<Review>("/restaurants/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Obtener reviews de un platillo
  async getReviewsByMenuItem(
    menuItemId: number
  ): Promise<ApiResponse<Review[]>> {
    return this.request<Review[]>(
      `/restaurants/reviews/menu-item/${menuItemId}`
    );
  }

  // Obtener estadísticas de un platillo
  async getMenuItemStats(
    menuItemId: number
  ): Promise<ApiResponse<ReviewStats>> {
    return this.request<ReviewStats>(
      `/restaurants/reviews/menu-item/${menuItemId}/stats`
    );
  }

  // Obtener review del usuario actual para un platillo
  async getMyReview(
    menuItemId: number,
    userId: string | null,
    guestId: string | null
  ): Promise<ApiResponse<Review | null>> {
    const queryParam = userId || guestId;

    return this.request<Review | null>(
      `/restaurants/reviews/menu-item/${menuItemId}/my-review/${queryParam}`
    );
  }

  // Actualizar una review
  async updateReview(
    reviewId: number,
    rating: number,
    user_id: string | null,
    guest_id: string | null
  ): Promise<ApiResponse<Review>> {
    return this.request<Review>(`/restaurants/reviews/${reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ rating, user_id, guest_id }),
    });
  }

  // Eliminar una review
  async deleteReview(
    reviewId: number
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/restaurants/reviews/${reviewId}`,
      {
        method: "DELETE",
      }
    );
  }
}

export const reviewsService = new ReviewsService();
