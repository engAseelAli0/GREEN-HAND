import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Settings, Edit3 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="app-container">
      <header className="glass-panel" style={{ margin: '1rem 2rem', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            background: 'var(--accent-color)', 
            color: 'white', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-gold)'
          }}>
            <Edit3 size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }} className="text-gradient">
              نظام إدارة الطلبيات
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              إدخال وتتبع بيانات المنتجات والمصانع
            </p>
          </div>
        </div>

        <nav className="no-print" style={{ display: 'flex', gap: '1rem' }}>
          {location.pathname !== '/' && (
            <Link 
              to="/" 
              className="btn btn-outline"
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
            >
              <span style={{ fontSize: '1.2rem' }}>🏠</span>
              عودة للرئيسية
            </Link>
          )}
        </nav>
      </header>

      <main className="main-content fade-in">
        <Outlet />
      </main>

      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--surface-highlight)',
            color: 'var(--text-main)',
            border: '1px solid var(--accent-color)',
            fontFamily: 'Tajawal, sans-serif',
            boxShadow: 'var(--shadow-gold)'
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: 'var(--surface-color)',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: 'var(--surface-color)',
            },
            style: {
              border: '1px solid #ef4444'
            }
          },
        }}
      />
    </div>
  );
};

export default AppLayout;
