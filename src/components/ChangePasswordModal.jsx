import React, { useState } from 'react';
import { Key, Lock, X, Save, ShieldAlert } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

const ChangePasswordModal = ({ user, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentPassword) {
      toast.error('يرجى إدخال كلمة المرور الحالية');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify current password
      const { data: userData, error: userError } = await supabase
        .from('system_users')
        .select('password')
        .eq('username', user.username)
        .single();
        
      if (userError || !userData) {
        throw new Error('تعذر التحقق من بيانات المستخدم');
      }
      
      if (userData.password !== currentPassword) {
        toast.error('كلمة المرور الحالية غير صحيحة');
        setLoading(false);
        return;
      }

      // 2. Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) throw authError;

      // 3. Update plain text password in system_users
      const { error: dbError } = await supabase
        .from('system_users')
        .update({ password: newPassword })
        .eq('username', user.username);
        
      if (dbError) {
        console.warn('Could not update plain text password in system_users:', dbError);
      }

      toast.success('تم تغيير كلمة المرور بنجاح!');
      onClose();
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--surface-color)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1), transparent)'
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--text-strong)' }}>
            <Key size={18} color="var(--accent-color)" />
            تغيير كلمة المرور
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              كلمة المرور الحالية
            </label>
            <div style={{ position: 'relative' }}>
              <ShieldAlert size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="form-control"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                style={{ paddingLeft: '2.5rem', background: 'var(--bg-color)', border: '1px solid rgba(212, 175, 55, 0.3)' }}
                required
              />
            </div>
          </div>

          <div style={{ width: '100%', height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              كلمة المرور الجديدة
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '2.5rem', background: 'var(--bg-color)' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              تأكيد كلمة المرور الجديدة
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '2.5rem', background: 'var(--bg-color)' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="submit" className="btn btn-accent" disabled={loading} style={{ flex: 1, justifyContent: 'center', gap: '0.4rem' }}>
              <Save size={18} />
              {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
