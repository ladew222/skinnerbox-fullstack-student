import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  AUTH_INVALID_EVENT_NAME,
  clearAuthSession,
  getCurrentUser,
  getStoredAuthUser,
  loginUser,
  logoutUser,
  registerUser,
  storeAuthSession,
} from '../utilities/api';


const AuthContext = createContext(null);


export const AuthProvider = ({ children }) => {
  // Load the last known user quickly, then verify the real cookie-backed session with /me.
  const [user, setUser] = useState(() => getStoredAuthUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const response = await getCurrentUser();
        if (!isMounted) {
          return;
        }
        setUser(response.user);
        storeAuthSession({ user: response.user });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        clearAuthSession();
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleForcedLogout = () => {
      clearAuthSession();
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener(AUTH_INVALID_EVENT_NAME, handleForcedLogout);
    return () => {
      window.removeEventListener(AUTH_INVALID_EVENT_NAME, handleForcedLogout);
    };
  }, []);

  const register = async (formValues) => registerUser(formValues);

  const login = async (credentials) => {
    const response = await loginUser(credentials);
    storeAuthSession({
      user: response.user,
    });
    setUser(response.user);
    return response;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      // Even if the backend token is already invalid, clear the local session.
    } finally {
      clearAuthSession();
      setUser(null);
    }
  };

  const refreshCurrentUser = async () => {
    const response = await getCurrentUser();
    setUser(response.user);
    storeAuthSession({
      user: response.user,
    });
    return response.user;
  };

  const contextValue = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    login,
    logout,
    register,
    refreshCurrentUser,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
};
