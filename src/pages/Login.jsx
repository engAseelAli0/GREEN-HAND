import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Lock, User, ShieldCheck } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import ThemeToggle from '../components/ThemeToggle';
import { Toaster } from 'react-hot-toast';

const Login = () => {
  const savedUsername = localStorage.getItem('greenhand_remembered_username') || '';
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(!!savedUsername);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    
    if (rememberMe) {
      localStorage.setItem('greenhand_remembered_username', username);
    } else {
      localStorage.removeItem('greenhand_remembered_username');
    }

    setIsLoading(true);
    const success = await login(username, password);
    setIsLoading(false);
    
    if (success) {
      navigate('/');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--bg-color) 0%, rgba(212, 175, 55, 0.05) 100%)',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative Background Elements */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '300px', height: '300px', background: 'var(--accent-color)', borderRadius: '50%', filter: 'blur(100px)', opacity: 0.1, zIndex: 0 }}></div>
      <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '400px', height: '400px', background: 'rgba(139, 92, 246, 1)', borderRadius: '50%', filter: 'blur(120px)', opacity: 0.08, zIndex: 0 }}></div>

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

      {/* Top Controls */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '2rem', display: 'flex', gap: '1rem', zIndex: 10 }}>
        <ThemeToggle />
        <LanguageSelector />
      </div>

      <div className="glass-panel fade-in" style={{
        maxWidth: '420px',
        width: '100%',
        padding: '3rem 2.5rem',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 20px rgba(212, 175, 55, 0.1)',
        border: '1px solid rgba(212, 175, 55, 0.2)',
        borderTop: '4px solid var(--accent-color)',
        background: 'var(--surface-color)',
        position: 'relative',
        zIndex: 1,
        backdropFilter: 'blur(16px)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.05) 100%)',
            border: '2px solid rgba(212, 175, 55, 0.5)',
            boxShadow: '0 0 20px rgba(212, 175, 55, 0.2)',
            marginBottom: '1.5rem'
          }}>
            <ShieldCheck size={40} color="var(--accent-color)" />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.5px' }} className="text-gradient">
            {t('app_title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>
            {t('auth.login_desc') || 'أدخل بيانات الاعتماد الخاصة بك للوصول إلى النظام'}
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)' }}>
              {t('auth.username')}
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-color)', opacity: 0.8 }}>
                <User size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-control"
                style={{ 
                  paddingLeft: '3rem', 
                  height: '52px', 
                  fontSize: '1rem', 
                  borderRadius: '12px',
                  background: 'var(--bg-color)',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.3s ease'
                }}
                placeholder={t('auth.username')}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)' }}>
              {t('auth.password')}
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-color)', opacity: 0.8 }}>
                <Lock size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control"
                style={{ 
                  paddingLeft: '3rem', 
                  height: '52px', 
                  fontSize: '1rem', 
                  borderRadius: '12px',
                  background: 'var(--bg-color)',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.3s ease'
                }}
                placeholder={t('auth.password')}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: '-0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: 'var(--accent-color)', width: '18px', height: '18px', cursor: 'pointer' }}
              />
              تذكرني (Remember Me)
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ 
              marginTop: '1rem', 
              height: '56px', 
              fontSize: '1.15rem',
              fontWeight: '700',
              borderRadius: '12px',
              letterSpacing: '0.5px',
              boxShadow: '0 8px 20px rgba(212, 175, 55, 0.3)',
              transition: 'all 0.3s ease',
              transform: isLoading ? 'scale(0.98)' : 'scale(1)'
            }}
          >
            {isLoading ? 'جاري تسجيل الدخول...' : t('auth.login_btn')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
