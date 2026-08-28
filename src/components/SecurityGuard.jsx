import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, RefreshCw, Unlock, Lock, X } from 'lucide-react';
import toast from 'react-hot-toast';

const SecurityGuard = ({ children }) => {
  const { i18n } = useTranslation();
  const [isBlocked, setIsBlocked] = useState(false);
  const isBlockedRef = useRef(false);

  // Check if disabled from localStorage or URL parameter (?debug=1 or ?dev=1)
  const [isDisabled, setIsDisabled] = useState(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('debug') === '1' || searchParams.get('debug') === 'true' || searchParams.get('dev') === '1') {
        return true;
      }
      return localStorage.getItem('security_guard_disabled') === 'true';
    } catch {
      return false;
    }
  });
  const isDisabledRef = useRef(isDisabled);

  // Secret click counter for the shield icon on blocked screen
  const [shieldClickCount, setShieldClickCount] = useState(0);

  const isRtl = i18n.language === 'ar';

  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    isDisabledRef.current = isDisabled;
  }, [isDisabled]);

  const toggleSecurity = (forcedValue) => {
    const next = typeof forcedValue === 'boolean' ? forcedValue : !isDisabledRef.current;
    isDisabledRef.current = next;
    setIsDisabled(next);

    if (next) {
      localStorage.setItem('security_guard_disabled', 'true');
      setIsBlocked(false);
      isBlockedRef.current = false;
      setTimeout(() => {
        toast.success(
          isRtl
            ? '🔓 تم إيقاف حماية المطور مؤقتاً — يمكنك الآن استخدام F12 والفحص بحرية (Shift+F12 أو Ctrl+Shift+X للإعادة)'
            : '🔓 DevTools protection disabled — You can now use F12 & Inspect (Shift+F12 to re-enable)',
          { duration: 5000, id: 'sec-guard-toggle' }
        );
      }, 0);
    } else {
      localStorage.removeItem('security_guard_disabled');
      setTimeout(() => {
        toast.success(
          isRtl
            ? '🔒 تم تفعيل حماية وأمان المطور بنجاح'
            : '🔒 DevTools protection re-enabled successfully',
          { duration: 3500, id: 'sec-guard-toggle' }
        );
      }, 0);
    }
  };

  // Expose global window helpers for power users
  useEffect(() => {
    window.__toggleSecurityGuard = () => toggleSecurity();
    window.__disableSecurityGuard = () => toggleSecurity(true);
    window.__enableSecurityGuard = () => toggleSecurity(false);

    return () => {
      delete window.__toggleSecurityGuard;
      delete window.__disableSecurityGuard;
      delete window.__enableSecurityGuard;
    };
  }, [isRtl]);

  useEffect(() => {
    // 1. Prevent right-click context menu (which has "Inspect Element")
    const handleContextMenu = (e) => {
      if (isDisabledRef.current) return;
      e.preventDefault();
      return false;
    };
    window.addEventListener('contextmenu', handleContextMenu);

    // 2. Prevent standard keyboard shortcuts to open DevTools
    const handleKeyDown = (e) => {
      // Safe Toggle Shortcuts for Linux/Windows/Mac:
      // Option 1: Shift + F12
      // Option 2: Ctrl + Shift + X
      // Option 3: Alt + Z
      if (
        (e.shiftKey && e.key === 'F12') ||
        (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x' || e.key === 'ء')) ||
        (e.altKey && (e.key === 'Z' || e.key === 'z' || e.key === 'ئ'))
      ) {
        e.preventDefault();
        toggleSecurity();
        return false;
      }

      // If protection is disabled, allow all developer keys
      if (isDisabledRef.current) return;

      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      
      // Ctrl + Shift + I (Inspect)
      // Ctrl + Shift + J (Console)
      // Ctrl + Shift + C (Element selector)
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        return false;
      }

      // Ctrl + U (View Source code)
      if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        return false;
      }

      // Ctrl + S (Save page offline - prevents inspecting static HTML files)
      if (e.ctrlKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        return false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 3. Active DevTools Detection Loop (Debugger timing + Window dimension checks)
    const checkDevTools = () => {
      if (isDisabledRef.current) {
        if (isBlockedRef.current) {
          setIsBlocked(false);
        }
        return;
      }

      // Skip all checks on mobile/tablet devices
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                       (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

      if (isMobile) {
        if (isBlockedRef.current) {
          setIsBlocked(false);
        }
        return;
      }

      let isDevToolsOpen = false;

      // Method A: Dimension Check (Works when DevTools is docked to the window)
      const threshold = 160;
      const widthDifference = window.outerWidth - window.innerWidth;
      const heightDifference = window.outerHeight - window.innerHeight;

      const isDockedSide = widthDifference > threshold;
      const isDockedBottom = heightDifference > threshold;

      if (isDockedSide || isDockedBottom) {
        isDevToolsOpen = true;
      }

      // Method B: Debugger timing check (Works for docked, undocked/floating, or separate window DevTools)
      const startTime = performance.now();
      try {
        const debuggerFn = new Function('debugger');
        debuggerFn();
      } catch {
        // Suppress any errors
      }
      const endTime = performance.now();
      
      if (endTime - startTime > 100) {
        isDevToolsOpen = true;
      }

      // If state changes, update it
      if (isDevToolsOpen) {
        if (!isBlockedRef.current) {
          setIsBlocked(true);
        }
      } else {
        if (isBlockedRef.current) {
          setIsBlocked(false);
        }
      }
    };

    // Run immediately and then start interval
    checkDevTools();
    const interval = setInterval(checkDevTools, 1500);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(interval);
    };
  }, []);

  const handleRetry = () => {
    if (isDisabledRef.current) {
      setIsBlocked(false);
      return;
    }

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                     (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (isMobile) {
      setIsBlocked(false);
      return;
    }

    let isDimensionDetect = false;
    const threshold = 160;
    const widthDifference = window.outerWidth - window.innerWidth;
    const heightDifference = window.outerHeight - window.innerHeight;
    if (widthDifference > threshold || heightDifference > threshold) {
      isDimensionDetect = true;
    }
    
    const startTime = performance.now();
    try {
      const debuggerFn = new Function('debugger');
      debuggerFn();
    } catch {
      // Suppress any errors
    }
    const endTime = performance.now();

    const stillOpen = isDimensionDetect || (endTime - startTime > 100);

    if (!stillOpen) {
      setIsBlocked(false);
    } else {
      window.location.reload();
    }
  };

  const handleShieldSecretClick = () => {
    const nextCount = shieldClickCount + 1;
    setShieldClickCount(nextCount);
    if (nextCount >= 3) {
      toggleSecurity(true);
      setShieldClickCount(0);
    } else {
      toast(isRtl ? `تبقت ${3 - nextCount} نقرات لفتح وضع المطور` : `${3 - nextCount} clicks left to unlock`, { id: 'shield-click-hint', duration: 1500 });
    }
  };

  if (isBlocked && !isDisabled) {
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(10, 11, 15, 0.92)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999999,
          fontFamily: 'Tajawal, sans-serif',
          color: '#e6edf3',
          direction: isRtl ? 'rtl' : 'ltr',
          padding: '1.5rem',
          boxSizing: 'border-box',
          overflow: 'hidden',
          userSelect: 'none'
        }}
      >
        {/* Decorative background gradients */}
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%)',
          top: '-10%',
          right: '-10%',
          zIndex: -1
        }} />
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%)',
          bottom: '-10%',
          left: '-10%',
          zIndex: -1
        }} />

        <div 
          style={{
            maxWidth: '540px',
            width: '100%',
            backgroundColor: '#161b22',
            border: '2px solid var(--accent-color, #d4af37)',
            borderRadius: '20px',
            padding: '3rem 2rem',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 25px rgba(212, 175, 55, 0.15)',
            boxSizing: 'border-box'
          }}
        >
          {/* Pulsing Lock / Shield Icon - 3 clicks to unlock */}
          <div 
            onClick={handleShieldSecretClick}
            title={isRtl ? 'انقر 3 مرات للفتح السريع لوضع المطور' : 'Click 3 times to unlock dev mode'}
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '2.5px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 2rem',
              color: '#ef4444',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)',
              cursor: 'pointer',
              transition: 'transform 0.15s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <ShieldAlert size={48} style={{ animation: 'pulse 2s infinite' }} />
          </div>

          <h2 style={{ 
            fontSize: '1.9rem', 
            fontWeight: '800', 
            marginBottom: '1.25rem', 
            color: 'var(--accent-color, #d4af37)',
            fontFamily: 'Tajawal, sans-serif'
          }}>
            {isRtl ? 'تم كشف أدوات المطور (DevTools)' : 'Developer Tools Detected'}
          </h2>
          
          <p style={{ 
            color: '#8b949e', 
            fontSize: '1.05rem', 
            lineHeight: '1.7', 
            marginBottom: '2rem',
            fontFamily: 'Tajawal, sans-serif'
          }}>
            {isRtl 
              ? 'لحماية أمان النظام وخصوصية البيانات من أي محاولة فحص أو تعديل غير مصرح بها، تم حظر الوصول مؤقتاً. يرجى إغلاق أدوات المطور للمتابعة.'
              : 'To safeguard system integrity and maintain strict data confidentiality, access has been temporarily restricted. Please close Developer Tools to proceed.'}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={handleRetry}
              style={{
                backgroundColor: 'var(--accent-color, #d4af37)',
                color: '#0d1117',
                border: 'none',
                borderRadius: '10px',
                padding: '0.85rem 1.8rem',
                fontSize: '1rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                transition: 'all 0.2s ease',
                boxShadow: '0 6px 20px rgba(212,175,55,0.3)',
                fontFamily: 'Tajawal, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(212,175,55,0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(212,175,55,0.3)';
              }}
            >
              <RefreshCw size={18} />
              <span>{isRtl ? 'إعادة الفحص والتشغيل' : 'Recheck & Access'}</span>
            </button>

            <button 
              onClick={() => toggleSecurity(true)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                padding: '0.85rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                fontFamily: 'Tajawal, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <Unlock size={18} />
              <span>{isRtl ? 'السماح بأدوات المطور (F12)' : 'Allow DevTools'}</span>
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: '#8b949e' }}>
            {isRtl ? 'اختصارات لوحة المفاتيح البديلة: Shift + F12 أو Ctrl + Shift + X' : 'Toggle shortcuts: Shift + F12 or Ctrl + Shift + X'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {isDisabled && (
        <div 
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            zIndex: 9999,
            backgroundColor: 'rgba(26, 32, 44, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            borderRadius: '50px',
            padding: '0.35rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            fontSize: '0.78rem',
            color: '#d4af37',
            fontWeight: 'bold',
            userSelect: 'none',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <Unlock size={14} color="#34d399" />
          <span>{isRtl ? 'وضع الفحص نشط (F12 متاح)' : 'Dev Mode Active (F12 Allowed)'}</span>
          <button
            onClick={() => toggleSecurity(false)}
            title={isRtl ? 'إعادة قفل وتفعيل الحماية' : 'Re-enable protection'}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              marginLeft: '4px'
            }}
          >
            <Lock size={11} />
          </button>
        </div>
      )}
    </>
  );
};

export default SecurityGuard;
