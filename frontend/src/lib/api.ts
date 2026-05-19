import axios from "axios";
import { useAppStore } from "./store"; // Relative import to prevent TypeScript alias issues

// 1. Initialize an Axios instance with the base API Gateway URL
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// 2. Request Interceptor: Automatically inject the JWT token into headers
api.interceptors.request.use(
  (config) => {
    // Access the current global state directly from Zustand without React hooks
    const token = useAppStore.getState().accessToken;
    
    // If a token exists, attach it as a Bearer token
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    // Forward any request preparation errors
    return Promise.reject(error);
  }
);

// 3. Response Interceptor: Handle global API errors gracefully
api.interceptors.response.use(
  (response) => {
    // If the request succeeds, just return the response
    return response;
  },
  (error) => {
    // Security Guard: Handle 401 Unauthorized globally
    if (error.response && error.response.status === 401) {
      // The token has either expired or is invalid.
      // Clear the local state to log the user out completely.
      useAppStore.getState().clearAuth();
      
      // Perform a hard redirect to the login page.
      // We check for 'window' to ensure this doesn't crash during Next.js SSR (Server-Side Rendering).
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    
    // Propagate the error so individual components can still handle specific UI messages
    return Promise.reject(error);
  }
);

export default api;