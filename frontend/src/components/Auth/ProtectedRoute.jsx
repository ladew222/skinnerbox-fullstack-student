import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';


const ProtectedRoute = ({ adminOnly = false }) => {
  const { isAdmin, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="container text-center">
        <p>Checking your access...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/LogIn" state={{ from: location }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate replace to="/Home" />;
  }

  return <Outlet />;
};


export default ProtectedRoute;
