import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, KeyRound, QrCode, Clipboard, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';

const AccountSecurity = () => {
  const { t } = useTranslation();
  const { enrollMfa, verifyAndActivateMfa, unenrollMfa } = useAuth();
  const [enrolledFactor, setEnrolledFactor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState(1); // 1 = status, 2 = enrollment wizard
  
  // Enrollment details
  const [enrollData, setEnrollData] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [copied, setCopied] = useState(false);

  const checkMfaStatus = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      
      const activeTotp = data.all?.find(f => f.factor_type === 'totp' && f.status === 'verified');
      setEnrolledFactor(activeTotp || null);
    } catch (err) {
      console.error('Error listing MFA factors:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const handleStartSetup = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await enrollMfa();
      if (error) throw error;
      
      setEnrollData(data);
      setStep(2);
    } catch (err) {
      console.error('Failed to start MFA setup:', err);
      toast.error(t('auth.messages.mfa_setup_failed', { defaultValue: 'فشل بدء إعداد التحقق الثنائي' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!enrollData?.totp?.secret) return;
    navigator.clipboard.writeText(enrollData.totp.secret);
    setCopied(true);
    toast.success(t('auth.messages.copied_success', { defaultValue: 'تم نسخ المفتاح السري!' }));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      toast.error(t('auth.messages.invalid_totp_format', { defaultValue: 'الرمز يجب أن يكون 6 أرقام' }));
      return;
    }

    setIsActivating(true);
    try {
      await verifyAndActivateMfa(enrollData.id, totpCode);
      toast.success(t('auth.messages.mfa_enabled_success', { defaultValue: 'تم تفعيل التحقق بخطوتين بنجاح!' }));
      setStep(1);
      setEnrollData(null);
      setTotpCode('');
      await checkMfaStatus();
    } catch (err) {
      console.error('Failed to verify TOTP:', err);
      toast.error(t('auth.messages.wrong_totp_code', { defaultValue: 'الكود المدخل غير صحيح أو انتهت صلاحيته' }));
    } finally {
      setIsActivating(false);
    }
  };

  const handleDisable = async () => {
    if (!enrolledFactor) return;
    if (!window.confirm(t('auth.messages.confirm_disable_mfa', { defaultValue: 'هل أنت متأكد من رغبتك في تعطيل التحقق بخطوتين؟ هذا يقلل من أمان حسابك.' }))) {
      return;
    }

    setIsLoading(true);
    try {
      await unenrollMfa(enrolledFactor.id);
      toast.success(t('auth.messages.mfa_disabled_success', { defaultValue: 'تم تعطيل التحقق بخطوتين بنجاح.' }));
      await checkMfaStatus();
    } catch (err) {
      console.error('Failed to disable MFA:', err);
      toast.error(t('auth.messages.mfa_disable_failed', { defaultValue: 'فشل تعطيل التحقق بخطوتين' }));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && step === 1) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>{t('common.loading', { defaultValue: 'جاري التحميل...' })}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {step === 1 ? (
        enrolledFactor ? (
          // Active MFA UI
          <div style={styles.statusCard}>
            <div style={styles.statusHeader}>
              <div style={styles.statusIconVerified}>
                <ShieldCheck size={36} color="#10b981" />
              </div>
              <div>
                <h3 style={styles.statusTitle}>
                  {t('security.mfa_status_active', { defaultValue: 'التحقق بخطوتين مفعّل ونشط' })}
                </h3>
                <p style={styles.statusSubtitle}>
                  {t('security.mfa_status_active_desc', { defaultValue: 'حسابك محمي بمستوى إضافي من الأمان.' })}
                </p>
              </div>
            </div>

            <div style={styles.infoBox}>
              <ShieldCheck size={20} color="var(--accent-color)" />
              <div style={styles.infoText}>
                {t('security.mfa_info_active', { defaultValue: 'عند تسجيل الدخول في المرة القادمة، سيُطلب منك إدخال رمز التحقق المكون من 6 أرقام من تطبيق المصادقة الخاص بك.' })}
              </div>
            </div>

            <button onClick={handleDisable} style={styles.disableButton}>
              <ShieldAlert size={18} />
              <span>{t('security.disable_mfa_btn', { defaultValue: 'تعطيل التحقق بخطوتين' })}</span>
            </button>
          </div>
        ) : (
          // Inactive MFA UI
          <div style={styles.statusCard}>
            <div style={styles.statusHeader}>
              <div style={styles.statusIconInactive}>
                <ShieldAlert size={36} color="var(--accent-color)" />
              </div>
              <div>
                <h3 style={styles.statusTitle}>
                  {t('security.mfa_status_inactive', { defaultValue: 'التحقق بخطوتين غير مفعل' })}
                </h3>
                <p style={styles.statusSubtitle}>
                  {t('security.mfa_status_inactive_desc', { defaultValue: 'حسابك حالياً محمي بكلمة المرور فقط.' })}
                </p>
              </div>
            </div>

            <div style={styles.infoBox}>
              <KeyRound size={20} color="var(--accent-color)" />
              <div style={styles.infoText}>
                {t('security.mfa_info_inactive', { defaultValue: 'ننصح بشدة بتفعيل التحقق بخطوتين (MFA) لحماية لوحة الإدارة والبيانات من محاولات الاختراق وسرقة الحسابات.' })}
              </div>
            </div>

            <button onClick={handleStartSetup} style={styles.enableButton}>
              <QrCode size={18} />
              <span>{t('security.enable_mfa_btn', { defaultValue: 'البدء في إعداد التحقق بخطوتين' })}</span>
            </button>
          </div>
        )
      ) : (
        // Enrollment Wizard UI
        <div style={styles.wizardCard}>
          <h3 style={styles.wizardTitle}>{t('security.setup_title', { defaultValue: 'إعداد التحقق بخطوتين' })}</h3>
          
          <div style={styles.wizardSteps}>
            {/* Step 1: Scan QR */}
            <div style={styles.wizardStepItem}>
              <span style={styles.stepBadge}>1</span>
              <p style={styles.stepText}>
                {t('security.setup_step_1', { defaultValue: 'قم بمسح رمز الـ QR أدناه باستخدام تطبيق المصادقة (مثل Google Authenticator أو Authy):' })}
              </p>
            </div>

            {/* QR Code Display */}
            {enrollData?.totp?.qr_code && (
              <div style={styles.qrContainer}>
                <img 
                  src={enrollData.totp.qr_code} 
                  alt="MFA QR Code" 
                  style={styles.qrImage}
                />
              </div>
            )}

            {/* Secret key fallback */}
            {enrollData?.totp?.secret && (
              <div style={styles.secretContainer}>
                <p style={styles.secretLabel}>
                  {t('security.setup_secret_label', { defaultValue: 'إذا لم تتمكن من مسح الرمز، أدخل هذا المفتاح يدوياً في التطبيق:' })}
                </p>
                <div style={styles.secretInputWrapper}>
                  <code style={styles.secretCode}>{enrollData.totp.secret}</code>
                  <button onClick={handleCopySecret} style={styles.copyButton}>
                    {copied ? <Check size={16} color="#10b981" /> : <Clipboard size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirm Code */}
            <div style={styles.wizardStepItem} style={{ marginTop: '24px' }}>
              <span style={styles.stepBadge}>2</span>
              <p style={styles.stepText}>
                {t('security.setup_step_2', { defaultValue: 'أدخل الرمز المكون من 6 أرقام المتولد في التطبيق لتأكيد التفعيل:' })}
              </p>
            </div>

            <form onSubmit={handleActivate} style={styles.activationForm}>
              <input
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                style={styles.totpInput}
                disabled={isActivating}
              />

              <div style={styles.wizardActions}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setEnrollData(null);
                    setTotpCode('');
                  }}
                  style={styles.cancelButton}
                  disabled={isActivating}
                >
                  {t('common.cancel', { defaultValue: 'إلغاء' })}
                </button>
                
                <button
                  type="submit"
                  style={{
                    ...styles.confirmButton,
                    opacity: (isActivating || totpCode.length !== 6) ? 0.6 : 1,
                    cursor: (isActivating || totpCode.length !== 6) ? 'not-allowed' : 'pointer'
                  }}
                  disabled={isActivating || totpCode.length !== 6}
                >
                  {isActivating ? t('auth.activating', { defaultValue: 'جاري التنشيط...' }) : t('security.activate_btn', { defaultValue: 'تأكيد وتفعيل' })}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '12px 0',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px 0',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(212, 175, 55, 0.1)',
    borderTop: '3px solid var(--accent-color, #d4af37)',
    borderRadius: '50%',
    animation: 'mfaSpinnerSpin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '14px',
    color: 'var(--text-muted, #94a3b8)',
    fontFamily: 'Tajawal, sans-serif',
  },
  statusCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statusIconVerified: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconInactive: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: '4px',
    fontFamily: 'Tajawal, sans-serif',
  },
  statusSubtitle: {
    fontSize: '13px',
    color: 'var(--text-muted, #94a3b8)',
    fontFamily: 'Tajawal, sans-serif',
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderLeft: '4px solid var(--accent-color, #d4af37)',
  },
  infoText: {
    fontSize: '13px',
    color: 'var(--text-muted, #94a3b8)',
    lineHeight: '1.6',
    fontFamily: 'Tajawal, sans-serif',
  },
  enableButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--accent-color, #d4af37)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    fontFamily: 'Tajawal, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  disableButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '6px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    fontFamily: 'Tajawal, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  wizardCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '28px',
  },
  wizardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: 'var(--accent-color, #d4af37)',
    marginBottom: '24px',
    fontFamily: 'Tajawal, sans-serif',
  },
  wizardSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  wizardStepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stepBadge: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-color, #d4af37)',
    color: '#0f172a',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  stepText: {
    fontSize: '14px',
    color: 'var(--text-main, #f8fafc)',
    fontFamily: 'Tajawal, sans-serif',
  },
  qrContainer: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '12px',
    alignSelf: 'center',
    margin: '16px 0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
  },
  qrImage: {
    width: '180px',
    height: '180px',
    display: 'block',
  },
  secretContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  secretLabel: {
    fontSize: '12px',
    color: 'var(--text-muted, #94a3b8)',
    marginBottom: '8px',
    fontFamily: 'Tajawal, sans-serif',
  },
  secretInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  secretCode: {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#ffffff',
    letterSpacing: '1px',
  },
  copyButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-muted, #94a3b8)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  activationForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginTop: '12px',
  },
  totpInput: {
    width: '100%',
    maxWidth: '240px',
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    border: '2px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    padding: '10px',
    letterSpacing: '6px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  wizardActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--text-main, #f8fafc)',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  confirmButton: {
    backgroundColor: 'var(--accent-color, #d4af37)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    fontFamily: 'Tajawal, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s',
  }
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes mfaSpinnerSpin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .totpInput:focus {
      border-color: var(--accent-color, #d4af37) !important;
    }
  `;
  document.head.appendChild(style);
}

export default AccountSecurity;
