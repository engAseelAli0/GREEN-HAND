import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, RefreshCw } from 'lucide-react';

const SecurityGuard = ({ children }) => {
  const { i18n } = useTranslation();
  const [isBlocked, setIsBlocked] = useState(false);
  const isBlockedRef = useRef(false);

  // Update a ref to avoid stale closures in event listeners and loops
  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    // 1. Prevent right-click context menu (which has "Inspect Element")
    const handleContextMenu = (e) => {
      // Allow context menu only if it's not a production build or we are admin (optional bypass, but let's lock it for everyone to be secure)
      e.preventDefault();
      return false;
    };
    window.addEventListener('contextmenu', handleContextMenu);

    // 2. Prevent standard keyboard shortcuts to open DevTools
    const handleKeyDown = (e) => {
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
      let isDevToolsOpen = false;

      // Method A: Dimension Check (Works when DevTools is docked to the window)
      // Skip this check on mobile devices to prevent false positives from browser bars, safe areas, virtual keyboards, and zoom.
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (!isMobile) {
        const threshold = 160;
        const widthDifference = window.outerWidth - window.innerWidth;
        const heightDifference = window.outerHeight - window.innerHeight;

        // If DevTools is docked on the right/left or bottom
        const isDockedSide = widthDifference > threshold;
        const isDockedBottom = heightDifference > threshold;

        // Verify it's not just a standard window resize/maximize by checking typical browser chrome borders (usually < 50px)
        if (isDockedSide || isDockedBottom) {
          isDevToolsOpen = true;
        }
      }

      // Method B: Debugger timing check (Works for docked, undocked/floating, or separate window DevTools)
      // Using new Function to prevent bundlers/minifiers from stripping or optimizing the debugger statement
      const startTime = performance.now();
      try {
        const debuggerFn = new Function('debugger');
        debuggerFn();
      } catch {
        // Suppress any errors
      }
      const endTime = performance.now();
      
      // If DevTools is open, the 'debugger' statement pauses execution.
      // Once resumed, the time difference will be significantly higher than normal execution (usually < 1ms)
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
    // Immediate force-check
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let isDimensionDetect = false;
    if (!isMobile) {
      const threshold = 160;
      const widthDifference = window.outerWidth - window.innerWidth;
      const heightDifference = window.outerHeight - window.innerHeight;
      if (widthDifference > threshold || heightDifference > threshold) {
        isDimensionDetect = true;
      }
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
      // Force reload page to clear any inspector state
      window.location.reload();
    }
  };

  const isRtl = i18n.language === 'ar';

  if (isBlocked) {
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
          zIndex: 99999999, // Ensure it is above EVERYTHING else
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
            maxWidth: '520px',
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
          {/* Pulsing Lock / Shield Icon */}
          <div 
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
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)'
            }}
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
            marginBottom: '2.5rem',
            fontFamily: 'Tajawal, sans-serif'
          }}>
            {isRtl 
              ? 'لحماية أمان النظام وخصوصية البيانات من أي محاولة فحص أو تعديل غير مصرح بها، تم حظر الوصول مؤقتاً. يرجى إغلاق أدوات المطور للمتابعة.'
              : 'To safeguard system integrity and maintain strict data confidentiality, access has been temporarily restricted. Please close Developer Tools to proceed.'}
          </p>

          <button 
            onClick={handleRetry}
            style={{
              backgroundColor: 'var(--accent-color, #d4af37)',
              color: '#0d1117',
              border: 'none',
              borderRadius: '10px',
              padding: '0.85rem 2.5rem',
              fontSize: '1.05rem',
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
            <RefreshCw size={20} />
            <span>{isRtl ? 'إعادة الفحص والتشغيل' : 'Recheck & Access'}</span>
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default SecurityGuard;
