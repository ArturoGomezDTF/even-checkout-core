// EcartPay SDK types
declare global {
  interface Window {
    Pay?: {
      Checkout: {
        create(options: EcartPayCheckoutOptions): Promise<EcartPayCheckoutResult>;
      };
    };
  }
}

export interface EcartPayCheckoutOptions {
  publicID: string;
  order: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    currency: string;
    items: Array<{
      name: string;
      price: number;
      quantity: number;
    }>;
    shipping?: {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
  };
  successUrl?: string;
  cancelUrl?: string;
  failureUrl?: string;
  onSuccess?: (result: any) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
}

export interface EcartPayCheckoutResult {
  success: boolean;
  payment?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
  order?: {
    id: string;
    status: string;
  };
  error?: {
    message: string;
    code: string;
  };
}