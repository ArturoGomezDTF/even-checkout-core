export interface Branch {
  id: number;
  restaurant_id: number;
  branch_number: number;
  name: string;
  address: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BranchContextType {
  selectedBranchNumber: number | null;
  branches: Branch[];
  isLoading: boolean;
  branchInitialized: boolean;
  setSelectedBranchNumber: (branchNumber: number | null) => void;
  fetchBranches: (restaurantId: number) => Promise<void>;
}
