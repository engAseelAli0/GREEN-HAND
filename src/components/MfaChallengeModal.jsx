import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Lock, LogOut, ShieldAlert } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const MfaChallengeModal = () => {
  const { t } = useTranslation();
  const { mfaFactors, challengeAndVerifyMfa, logout } = useAuth();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    // Auto-focus first input on load
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;
    
    const newCode = [...code];
    // Keep only the last character entered
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Backspace: clear current and focus previous
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0 && inputRefs.current[index - 1]) {
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1].focus();
      } else {
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pastedData)) {
      toast.error(t('auth.messages.invalid_totp_format', { defaultValue: 'الرمز يجب أن يكون 6 أرقام' }));
      return;
    }

    const digits = pastedData.split('');
    setCode(digits);
    // Focus last input
    if (inputRefs.current[5]) {
      inputRefs.current[5].focus();
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      toast.error(t('auth.messages.fill_all_digits', { defaultValue: 'يرجى إدخال الـ 6 أرقام كاملة' }));
      return;
    }

    if (!mfaFactors || mfaFactors.length === 0) {
      toast.error(t('auth.messages.no_mfa_factors', { defaultValue: 'لا توجد وسائل مصادقة ثنائية مفعلة' }));
      return;
    }

    setIsVerifying(true);
    try {
      const activeFactor = mfaFactors[0];
      await challengeAndVerifyMfa(activeFactor.id, fullCode);
      toast.success(t('auth.messages.mfa_verified_success', { defaultValue: 'تم التحقق بنجاح!' }));
    } catch (error) {
      console.error('MFA challenge failed:', error);
      toast.error(t('auth.messages.wrong_totp_code', { defaultValue: 'الرمز المدخل غير صحيح أو انتهت صلاحيته' }));
      // Clear inputs and refocus first
      setCode(['', '', '', '', '', '']);
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Submit automatically when all 6 digits are filled
  useEffect(() => {
    if (code.every(digit => digit !== '')) {
      handleVerify();
    }
  }, [code]);

  return (
    <div style={styles.overlay}>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-card, #1e293b)',
            color: 'var(--text-main, #f8fafc)',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            fontFamily: 'Tajawal, sans-serif',
          }
        }}
      />
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <Lock size={32} color="var(--accent-color)" style={styles.lockIcon} />
        </div>
        
        <h2 style={styles.title}>{t('auth.mfa_title', { defaultValue: 'التحقق بخطوتين (2FA)' })}</h2>
        <p style={styles.subtitle}>
          {t('auth.mfa_subtitle', { defaultValue: 'يرجى إدخال الرمز المكون من 6 أرقام المتولد في تطبيق المصادقة الخاص بك.' })}
        </p>

        <form onSubmit={handleVerify} style={styles.form}>
          <div style={styles.inputContainer}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                style={styles.digitInput}
                disabled={isVerifying}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={isVerifying || code.some(d => d === '')}
            style={{
              ...styles.submitButton,
              opacity: (isVerifying || code.some(d => d === '')) ? 0.6 : 1,
              cursor: (isVerifying || code.some(d => d === '')) ? 'not-allowed' : 'pointer'
            }}
          >
            {isVerifying ? t('auth.verifying', { defaultValue: 'جاري التحقق...' }) : t('auth.verify_btn', { defaultValue: 'تأكيد الرمز' })}
          </button>
        </form>

        <button onClick={logout} style={styles.logoutButton}>
          <LogOut size={16} />
          <span>{t('auth.logout_btn', { defaultValue: 'تسجيل الخروج والعودة' })}</span>
        </button>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
  },
  card: {
    backgroundColor: 'var(--bg-card, #1e293b)',
    border: '1px solid rgba(212, 175, 55, 0.2)', // Gold accent border
    borderRadius: '16px',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '460px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
    textAlign: 'center',
    color: 'var(--text-main, #f8fafc)',
    animation: 'mfaCardEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 auto 24px auto',
  },
  lockIcon: {
    animation: 'mfaLockPulse 2s infinite',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '12px',
    fontFamily: 'Tajawal, sans-serif',
    color: 'var(--accent-color, #d4af37)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-muted, #94a3b8)',
    lineHeight: '1.6',
    marginBottom: '32px',
    fontFamily: 'Tajawal, sans-serif',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  inputContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    direction: 'ltr', // Code entry should always display left-to-right visually
  },
  digitInput: {
    width: '52px',
    height: '56px',
    borderRadius: '8px',
    border: '2px solid rgba(148, 163, 184, 0.2)',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    outline: 'none',
    transition: 'all 0.2s',
  },
  submitButton: {
    backgroundColor: 'var(--accent-color, #d4af37)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    fontFamily: 'Tajawal, sans-serif',
    transition: 'all 0.2s',
  },
  logoutButton: {
    marginTop: '24px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-muted, #94a3b8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
    transition: 'color 0.2s',
  }
};

// Add raw CSS keyframes to the document to keep everything packaged cleanly
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes mfaCardEnter {
      0% { opacity: 0; transform: scale(0.9) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes mfaLockPulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }
    .digitInput:focus {
      border-color: var(--accent-color, #d4af37) !important;
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2) !important;
      background-color: rgba(15, 23, 42, 0.6) !important;
    }
  `;
  document.head.appendChild(style);
}

export default MfaChallengeModal;
