import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const useAuthController = () => {
  const { user, login: authLogin, logout: authLogout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authLogin(email, password);
      if (!result.success) {
        setError(result.message || "Login failed");
      }
      return result;
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  }, [authLogin]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await authLogout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  }, [authLogout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    user,
    loading,
    error,
    login,
    logout,
    clearError,
    isAuthenticated: !!user,
  };
};

export default useAuthController;
