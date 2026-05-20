import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import MfaChallengeModal from './MfaChallengeModal';

const ProtectedRoute = ({ children }) => {
  const { t } = useTranslation();
  const { user, loading, hasAccess, mfaPending } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-main)' }}>
        {t('auth.loading')}
      </div>
    );
  }

  // If not logged in, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If Two-Factor Authentication is pending, block the route and show the challenge screen
  if (mfaPending) {
    return <MfaChallengeModal />;
  }

  // If logged in but trying to access an unauthorized route
  if (!hasAccess(location.pathname)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
