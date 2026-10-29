"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// Tipos para los datos de registro del usuario
export interface SignUpData {
  age: number | null;
  gender: string | null;
}

// Tipo para el contexto
interface UserDataContextValue {
  signUpData: SignUpData;
  updateSignUpData: (data: Partial<SignUpData>) => void;
  clearSignUpData: () => void;
}

const UserDataContext = createContext<UserDataContextValue | undefined>(
  undefined,
);

interface UserDataProviderProps {
  children: ReactNode;
}

export function UserDataProvider({ children }: UserDataProviderProps) {
  const [signUpData, setSignUpData] = useState<SignUpData>({
    age: null,
    gender: null,
  });

  // Load from localStorage on mount (for persistence between page changes)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("even-signup-data");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as SignUpData;
          setSignUpData(parsed);
        } catch (error) {
          console.error("Error parsing stored signup data:", error);
        }
      }
    }
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("even-signup-data", JSON.stringify(signUpData));
    }
  }, [signUpData]);

  const updateSignUpData = (data: Partial<SignUpData>) => {
    setSignUpData((prev) => ({ ...prev, ...data }));
  };

  const clearSignUpData = () => {
    setSignUpData({ age: null, gender: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("even-signup-data");
    }
  };

  return (
    <UserDataContext.Provider
      value={{
        signUpData,
        updateSignUpData,
        clearSignUpData,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData(): UserDataContextValue {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error("useUserData must be used within a UserDataProvider");
  }
  return context;
}
