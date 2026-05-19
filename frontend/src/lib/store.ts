import { create } from "zustand";
import { persist } from "zustand/middleware";

// ENTERPRISE FIX: Explicitly defined strict roles. Removed arbitrary 'string'.
// This ensures Next.js layout/middleware routing has 100% type safety.
export type UserRole = "Student" | "Teacher" | "SuperAdmin";

interface AppState {
  accessToken: string | null;
  userRole: UserRole | null;
  
  // Enterprise Fix: Track hydration state to prevent premature Next.js redirects
  _hasHydrated: boolean; 
  
  // Enterprise Multi-LLM Routing: Stores user's preferred model
  preferredLLM: string;
  
  // Action to securely save the session data after a successful login
  // Replaced generic 'string' with dynamic strict normalization logic
  setAuth: (token: string, role: string) => void;
  
  // Action to wipe out all session data during logout or 401 Unauthorized errors
  clearAuth: () => void;

  // Internal action strictly used by persist middleware to acknowledge storage load
  setHasHydrated: (state: boolean) => void;

  // Action to update the user's preferred LLM
  setPreferredLLM: (model: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state is completely empty (unauthenticated)
      accessToken: null,
      userRole: null,
      _hasHydrated: false, // Strictly false until localStorage is fully read
      
      // Default to Google Gemini for fastest response times
      preferredLLM: "gemini-1.5-flash",
      
      // Atomically updates both the token and the role in a single state change
      setAuth: (token, role) => {
        // ENTERPRISE GUARDRAIL: Bulletproof Role Normalization
        // Ensures that no matter what case the DB or API sends (e.g., 'SUPERADMIN', 'student'),
        // the frontend strictly conforms to the expected PascalCase routing constraints.
        let normalizedRole: UserRole = "Student"; // Fail-safe default
        const upperRole = role.toUpperCase();
        
        if (upperRole === "SUPERADMIN") {
          normalizedRole = "SuperAdmin";
        } else if (upperRole === "TEACHER") {
          normalizedRole = "Teacher";
        } else if (upperRole === "STUDENT") {
          normalizedRole = "Student";
        }

        set({ 
          accessToken: token, 
          userRole: normalizedRole 
        });
      },
        
      // Securely flushes the authentication context but keeps user settings like LLM preference
      clearAuth: () => 
        set({ 
          accessToken: null, 
          userRole: null 
        }),
        
      // Updates hydration status
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Updates the selected LLM model
      setPreferredLLM: (model) => set({ preferredLLM: model }),
    }),
    {
      name: "app-auth-storage", // The exact key used in the browser's localStorage
      
      // Enterprise Integration: Hooks into the persist lifecycle.
      // Triggers when Zustand successfully syncs the state with the browser's storage.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);