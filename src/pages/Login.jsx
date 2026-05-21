import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Lock, User, ShieldCheck, Eye, EyeOff, Fingerprint, ArrowLeft } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import ThemeToggle from '../components/ThemeToggle';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import logoLight from '../assets/light.jpg';
import logoDark from '../assets/dark.jpg';

/* ═══════════════════════════════════════════════════
   Animated floating particles canvas
   ═══════════════════════════════════════════════════ */
const ParticleCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let particles = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.pulse = Math.random() * Math.PI * 2;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.pulse += 0.02;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
          this.reset();
        }
      }
      draw() {
        const glowOpacity = this.opacity * (0.5 + 0.5 * Math.sin(this.pulse));
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 175, 55, ${glowOpacity})`;
        ctx.fill();
        // Glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 175, 55, ${glowOpacity * 0.15})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < 60; i++) {
      particles.push(new Particle());
    }

    const connectParticles = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(212, 175, 55, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      connectParticles();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 0, pointerEvents: 'none'
    }} />
  );
};

const Login = () => {
  const savedUsername = localStorage.getItem('greenhand_remembered_username') || '';
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(!!savedUsername);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
    <>
      <style>{`
        @keyframes loginCardEnter {
          0% { opacity: 0; transform: translateY(40px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loginLogoEnter {
          0% { opacity: 0; transform: scale(0.5) rotate(-180deg); }
          60% { transform: scale(1.1) rotate(10deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes loginTitleEnter {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginFieldEnter {
          0% { opacity: 0; transform: translateX(-20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes loginBtnEnter {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes floatShape {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(15px, -15px) rotate(5deg); }
          50% { transform: translate(-10px, -25px) rotate(-3deg); }
          75% { transform: translate(-15px, 10px) rotate(3deg); }
        }
        @keyframes orbPulse {
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.05); }
        }
        @keyframes ringRotate {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes logoRingRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loginSpinner {
          to { transform: rotate(360deg); }
        }
        .login-input-wrap {
          position: relative;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .login-input-wrap.focused {
          transform: translateY(-2px);
        }
        .login-input-wrap.focused .login-input-glow {
          opacity: 1;
        }
        .login-input-glow {
          position: absolute;
          inset: -2px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.3), rgba(212, 175, 55, 0.05), rgba(212, 175, 55, 0.3));
          opacity: 0;
          transition: opacity 0.35s ease;
          z-index: -1;
          filter: blur(4px);
        }
        .login-input {
          width: 100%;
          padding: 0.9rem 1rem 0.9rem 3.2rem;
          border: 1.5px solid var(--border-color);
          border-radius: 14px;
          font-family: 'Tajawal', sans-serif;
          font-size: 1rem;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          background: rgba(13, 17, 23, 0.6);
          color: var(--text-main);
          outline: none;
          backdrop-filter: blur(8px);
        }
        .login-input:focus {
          border-color: var(--accent-color);
          box-shadow: 0 0 0 4px rgba(212, 175, 55, 0.12), 0 4px 20px rgba(212, 175, 55, 0.1);
          background: rgba(13, 17, 23, 0.8);
        }
        .login-input::placeholder {
          color: var(--text-muted);
          opacity: 0.6;
        }
        .login-submit-btn {
          position: relative;
          width: 100%;
          height: 56px;
          border: none;
          border-radius: 14px;
          font-family: 'Tajawal', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          background: linear-gradient(135deg, #d4af37, #b58d27, #d4af37);
          background-size: 200% 100%;
          color: #0d1117;
          letter-spacing: 0.5px;
        }
        .login-submit-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(212, 175, 55, 0.35), 0 0 20px rgba(212, 175, 55, 0.15);
          background-position: 100% center;
        }
        .login-submit-btn:active:not(:disabled) {
          transform: translateY(-1px);
        }
        .login-submit-btn:disabled {
          opacity: 0.8;
          cursor: not-allowed;
        }
        .login-submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          background-size: 200% 100%;
          animation: shimmer 3s infinite linear;
        }
        .login-check-label {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--text-muted);
          transition: color 0.2s;
          user-select: none;
        }
        .login-check-label:hover {
          color: var(--text-main);
        }
        .login-custom-check {
          width: 20px; height: 20px; border-radius: 6px;
          border: 2px solid var(--border-color);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.3s ease;
          background: transparent;
          flex-shrink: 0;
        }
        .login-custom-check.checked {
          border-color: var(--accent-color);
          background: var(--accent-color);
        }
        .login-toggle-pw {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.3rem;
          display: flex;
          align-items: center;
          transition: color 0.2s;
          z-index: 2;
        }
        .login-toggle-pw:hover {
          color: var(--accent-color);
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-color)',
        position: 'relative',
        overflow: 'hidden',
        padding: '1rem'
      }}>
        {!isMobile && (
          <>
            <ParticleCanvas />

            {/* Ambient orbs */}
            <div style={{
              position: 'fixed', top: '10%', left: '5%',
              width: '350px', height: '350px',
              background: 'radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%)',
              borderRadius: '50%', filter: 'blur(60px)',
              animation: 'orbPulse 6s ease-in-out infinite', zIndex: 0
            }} />
            <div style={{
              position: 'fixed', bottom: '5%', right: '5%',
              width: '400px', height: '400px',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
              borderRadius: '50%', filter: 'blur(80px)',
              animation: 'orbPulse 8s ease-in-out infinite 2s', zIndex: 0
            }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%',
              width: '500px', height: '500px',
              border: '1px solid rgba(212, 175, 55, 0.04)',
              borderRadius: '50%',
              animation: 'ringRotate 40s linear infinite', zIndex: 0
            }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%',
              width: '700px', height: '700px',
              border: '1px solid rgba(212, 175, 55, 0.02)',
              borderRadius: '50%',
              animation: 'ringRotate 60s linear infinite reverse', zIndex: 0
            }} />

            {/* Floating geometric shapes */}
            {[
              { top: '15%', left: '10%', size: 60, delay: '0s', dur: '15s', rot: '45deg', opacity: 0.04 },
              { top: '70%', left: '80%', size: 80, delay: '3s', dur: '20s', rot: '30deg', opacity: 0.03 },
              { top: '40%', left: '85%', size: 40, delay: '5s', dur: '18s', rot: '60deg', opacity: 0.05 },
              { top: '80%', left: '15%', size: 50, delay: '2s', dur: '16s', rot: '15deg', opacity: 0.04 },
            ].map((s, i) => (
              <div key={i} style={{
                position: 'fixed', top: s.top, left: s.left,
                width: `${s.size}px`, height: `${s.size}px`,
                border: `1px solid rgba(212, 175, 55, ${s.opacity * 5})`,
                borderRadius: i % 2 === 0 ? '12px' : '50%',
                transform: `rotate(${s.rot})`,
                animation: `floatShape ${s.dur} ease-in-out infinite ${s.delay}`,
                zIndex: 0, opacity: s.opacity * 3
              }} />
            ))}
          </>
        )}

        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--surface-highlight)',
              color: 'var(--text-main)',
              border: '1px solid var(--accent-color)',
              fontFamily: 'Tajawal, sans-serif',
              boxShadow: 'var(--shadow-gold)',
              borderRadius: '12px',
              padding: '12px 20px'
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: 'var(--surface-color)' },
              style: { border: '1px solid #ef4444' }
            },
          }}
        />

        {/* Top Controls */}
        <div style={{
          position: 'fixed', top: '1.5rem', right: '2rem',
          display: 'flex', gap: '0.75rem', zIndex: 10,
          animation: 'loginTitleEnter 0.6s ease backwards 0.2s'
        }}>
          <ThemeToggle />
          <LanguageSelector />
        </div>

        {/* Main Card */}
        <div style={{
          maxWidth: '440px', width: '100%',
          position: 'relative', zIndex: 1,
          animation: mounted ? 'loginCardEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
          opacity: mounted ? 1 : 0
        }}>
          {/* Card glow border effect */}
          <div style={{
            position: 'absolute', inset: '-1px',
            borderRadius: '26px',
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.4), rgba(212, 175, 55, 0.05), rgba(139, 92, 246, 0.15), rgba(212, 175, 55, 0.3))',
            zIndex: -1, filter: 'blur(1px)'
          }} />

          <div style={{
            padding: '3rem 2.5rem',
            borderRadius: '24px',
            background: 'linear-gradient(145deg, rgba(22, 27, 34, 0.95), rgba(13, 17, 23, 0.98))',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 30px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(212, 175, 55, 0.05), inset 0 1px 0 rgba(255,255,255,0.05)',
            border: '1px solid rgba(212, 175, 55, 0.15)',
            position: 'relative', overflow: 'hidden'
          }}>
            {/* Inner subtle gradient overlay */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '120px',
              background: 'linear-gradient(180deg, rgba(212, 175, 55, 0.04) 0%, transparent 100%)',
              pointerEvents: 'none'
            }} />

            {/* Logo */}
            <div style={{
              textAlign: 'center', marginBottom: '2rem', position: 'relative',
              animation: 'loginLogoEnter 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) backwards 0.3s'
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '100px', height: '100px', borderRadius: '16px',
                background: theme === 'light' ? '#ffffff' : '#000000',
                border: '2px solid rgba(212, 175, 55, 0.4)',
                boxShadow: '0 0 30px rgba(212, 175, 55, 0.15), inset 0 0 20px rgba(212, 175, 55, 0.05)',
                marginBottom: '1.25rem', position: 'relative'
              }}>
                {/* Rotating ring around logo */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '138px',
                  height: '138px',
                  borderRadius: '50%',
                  border: '1px dashed rgba(212, 175, 55, 0.25)',
                  animation: 'ringRotate 20s linear infinite',
                  zIndex: 0
                }} />
                <img 
                  src={theme === 'light' ? logoLight : logoDark} 
                  alt="Green Hand Logo" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderRadius: '14px', 
                    objectFit: 'contain',
                    zIndex: 1
                  }} 
                />
              </div>
            </div>

            {/* Title */}
            <div style={{
              textAlign: 'center', marginBottom: '2.5rem',
              animation: 'loginTitleEnter 0.7s ease backwards 0.5s'
            }}>
              <h1 style={{
                fontSize: '1.85rem', fontWeight: '800',
                marginBottom: '0.5rem', letterSpacing: '-0.5px',
                background: 'linear-gradient(135deg, var(--text-strong) 30%, var(--accent-color) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {t('app_title')}
              </h1>
              <p style={{
                color: 'var(--text-muted)', fontSize: '0.95rem',
                lineHeight: '1.6', maxWidth: '280px', margin: '0 auto'
              }}>
                {t('auth.login_desc')}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Username field */}
              <div style={{ animation: 'loginFieldEnter 0.6s ease backwards 0.6s' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '0.6rem', fontSize: '0.88rem', fontWeight: '600',
                  color: focusedField === 'user' ? 'var(--accent-color)' : 'var(--text-muted)',
                  transition: 'color 0.3s'
                }}>
                  <User size={14} />
                  {t('auth.username')}
                </label>
                <div className={`login-input-wrap ${focusedField === 'user' ? 'focused' : ''}`}>
                  <div className="login-input-glow" />
                  <div style={{
                    position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)',
                    color: focusedField === 'user' ? 'var(--accent-color)' : 'var(--text-muted)',
                    transition: 'color 0.3s', zIndex: 2, display: 'flex'
                  }}>
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField('user')}
                    onBlur={() => setFocusedField(null)}
                    className="login-input"
                    placeholder={t('auth.username')}
                    required
                    autoComplete="username"
                    enterKeyHint="next"
                  />
                </div>
              </div>

              {/* Password field */}
              <div style={{ animation: 'loginFieldEnter 0.6s ease backwards 0.75s' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '0.6rem', fontSize: '0.88rem', fontWeight: '600',
                  color: focusedField === 'pass' ? 'var(--accent-color)' : 'var(--text-muted)',
                  transition: 'color 0.3s'
                }}>
                  <Lock size={14} />
                  {t('auth.password')}
                </label>
                <div className={`login-input-wrap ${focusedField === 'pass' ? 'focused' : ''}`}>
                  <div className="login-input-glow" />
                  <div style={{
                    position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)',
                    color: focusedField === 'pass' ? 'var(--accent-color)' : 'var(--text-muted)',
                    transition: 'color 0.3s', zIndex: 2, display: 'flex'
                  }}>
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                    className="login-input"
                    style={{ paddingRight: '3rem' }}
                    placeholder={t('auth.password')}
                    required
                    autoComplete="current-password"
                    enterKeyHint="done"
                  />
                  <button
                    type="button"
                    className="login-toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div style={{
                animation: 'loginFieldEnter 0.6s ease backwards 0.9s',
                marginTop: '-0.25rem'
              }}>
                <label
                  className="login-check-label"
                  onClick={() => setRememberMe(!rememberMe)}
                >
                  <div className={`login-custom-check ${rememberMe ? 'checked' : ''}`}>
                    {rememberMe && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="#0d1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {t('auth.remember_me')} (Remember Me)
                </label>
              </div>

              {/* Submit */}
              <div style={{ animation: 'loginBtnEnter 0.7s ease backwards 1s', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="login-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'loginSpinner 0.8s linear infinite' }}>
                        <circle cx="11" cy="11" r="9" stroke="#0d1117" strokeWidth="2.5" fill="none" strokeDasharray="42" strokeDashoffset="14" strokeLinecap="round" />
                      </svg>
                      {t('auth.logging_in')}
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', position: 'relative', zIndex: 1 }}>
                      <ArrowLeft size={20} />
                      {t('auth.login_btn')}
                    </span>
                  )}
                </button>
              </div>
            </form>

            {/* Bottom security badge */}
            <div style={{
              textAlign: 'center', marginTop: '2rem',
              animation: 'loginBtnEnter 0.7s ease backwards 1.2s'
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', borderRadius: '20px',
                background: 'rgba(212, 175, 55, 0.06)',
                border: '1px solid rgba(212, 175, 55, 0.1)',
                fontSize: '0.78rem', color: 'var(--text-muted)'
              }}>
                <ShieldCheck size={14} color="#d4af37" />
                <span>Secured Access · SSL Encrypted</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
