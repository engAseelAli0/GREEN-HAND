import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Home } from 'lucide-react';

const Unauthorized = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-color)',
      padding: '1rem',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '450px',
        width: '100%',
        padding: '3rem 2rem',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        borderTop: '4px solid #ef4444'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          marginBottom: '1.5rem'
        }}>
          <AlertTriangle size={40} color="#ef4444" />
        </div>
        
        <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
          {t('auth.unauthorized')}
        </h1>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
          {t('auth.unauthorized_desc')}
        </p>

        <button
          onClick={() => navigate('/')}
          className="btn btn-outline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.5rem',
            borderColor: 'var(--accent-color)',
            color: 'var(--accent-color)'
          }}
        >
          <Home size={20} />
          {t('auth.return_home')}
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
