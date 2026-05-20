import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Download, Upload, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const BackupRestore = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    const toastId = toast.loading(t('backup.exporting', { defaultValue: 'جاري إنشاء النسخة الاحتياطية...' }));
    try {
      // Fetch all tables concurrently
      const [
        { data: orders, error: errOrders },
        { data: receivings, error: errReceivings },
        { data: lookups, error: errLookups },
        { data: users, error: errUsers }
      ] = await Promise.all([
        supabase.from('orders').select('*'),
        supabase.from('receivings').select('*'),
        supabase.from('lookup_settings').select('*'),
        supabase.from('system_users').select('*')
      ]);

      if (errOrders || errReceivings || errLookups || errUsers) {
        throw new Error(
          (errOrders?.message || errReceivings?.message || errLookups?.message || errUsers?.message) || 'Error reading data'
        );
      }

      const backupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: {
          orders: orders || [],
          receivings: receivings || [],
          lookup_settings: lookups || [],
          system_users: users || []
        }
      };

      // Create blob and download
      const dataStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.setAttribute('download', `greenhand_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      toast.success(t('backup.export_success', { defaultValue: 'تم تحميل النسخة الاحتياطية بنجاح!' }), { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`${t('backup.export_failed', { defaultValue: 'فشل تصدير البيانات' })}: ${err.message}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      t('backup.confirm_import', { defaultValue: 'تنبيه: سيتم استعادة البيانات ودمجها مع البيانات الحالية في السيرفر. هل أنت متأكد من الاستمرار؟' })
    );
    if (!confirmRestore) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    const toastId = toast.loading(t('backup.importing', { defaultValue: 'جاري استيراد البيانات وتحديث قاعدة البيانات...' }));

    try {
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        try {
          const backupObj = JSON.parse(event.target.result);
          if (!backupObj.data || typeof backupObj.data !== 'object') {
            throw new Error('الملف المرفوع ليس ملف نسخة احتياطية صالح لـ Green Hand.');
          }

          const { orders, receivings, lookup_settings, system_users } = backupObj.data;

          // 1. Restore lookup_settings (upsert)
          if (Array.isArray(lookup_settings) && lookup_settings.length > 0) {
            const { error: err } = await supabase.from('lookup_settings').upsert(lookup_settings);
            if (err) throw new Error(`Lookup settings restore error: ${err.message}`);
          }

          // 2. Restore system_users (upsert)
          if (Array.isArray(system_users) && system_users.length > 0) {
            const { error: err } = await supabase.from('system_users').upsert(system_users);
            if (err) throw new Error(`System users restore error: ${err.message}`);
          }

          // 3. Restore orders (upsert)
          if (Array.isArray(orders) && orders.length > 0) {
            const { error: err } = await supabase.from('orders').upsert(orders);
            if (err) throw new Error(`Orders restore error: ${err.message}`);
          }

          // 4. Restore receivings (upsert)
          if (Array.isArray(receivings) && receivings.length > 0) {
            const { error: err } = await supabase.from('receivings').upsert(receivings);
            if (err) throw new Error(`Receivings restore error: ${err.message}`);
          }

          toast.success(t('backup.import_success', { defaultValue: 'تم استعادة البيانات وتحديث قاعدة البيانات بنجاح!' }), { id: toastId });
          // Reload page to refresh application context
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (parseError) {
          console.error(parseError);
          toast.error(parseError.message, { id: toastId });
          setImporting(false);
        }
      };

      fileReader.readAsText(file);
    } catch (err) {
      console.error(err);
      toast.error(err.message, { id: toastId });
      setImporting(false);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      background: 'var(--surface-color)',
      padding: '2.5rem',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-md)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Glow Effect */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '300px', height: '300px',
        background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div>
        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-strong)', fontSize: '1.4rem' }}>
          {t('backup.title', { defaultValue: 'النسخ الاحتياطي واستعادة البيانات' })}
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: '1.6' }}>
          {t('backup.description', { defaultValue: 'يمكنك إنشاء وحفظ نسخة احتياطية كاملة من جميع جداول النظام والطلبات والإعدادات محلياً على جهازك، واستعادتها في أي وقت لحماية البيانات.' })}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        marginTop: '1rem'
      }}>
        {/* Export Card */}
        <div style={{
          padding: '2rem',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.25rem'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(212, 175, 55, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-color)', border: '1px solid rgba(212, 175, 55, 0.2)'
          }}>
            <Download size={28} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--text-strong)', fontSize: '1.1rem' }}>
              {t('backup.export_title', { defaultValue: 'تحميل نسخة احتياطية' })}
            </h4>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
              {t('backup.export_desc', { defaultValue: 'سيتم تحميل ملف بصيغة JSON يحتوي على الطلبات، الإعدادات، المستخدمين، والاستلامات.' })}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={loading || importing}
            className="btn btn-accent"
            style={{ width: '100%', justifyContent: 'center', height: '48px', gap: '0.5rem' }}
          >
            {loading ? <RefreshCw className="spin" size={18} /> : <Download size={18} />}
            {t('backup.export_btn', { defaultValue: 'تحميل النسخة الاحتياطية' })}
          </button>
        </div>

        {/* Import Card */}
        <div style={{
          padding: '2rem',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.25rem'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(139, 92, 246, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.2)'
          }}>
            <Upload size={28} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--text-strong)', fontSize: '1.1rem' }}>
              {t('backup.import_title', { defaultValue: 'استعادة نسخة احتياطية' })}
            </h4>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
              {t('backup.import_desc', { defaultValue: 'قم برفع ملف نسخة احتياطية JSON صالح لاستعادة الجداول والبيانات إلى ما كانت عليه.' })}
            </p>
          </div>
          <label
            className="btn btn-outline"
            style={{
              width: '100%', justifyContent: 'center', height: '48px', gap: '0.5rem',
              cursor: (loading || importing) ? 'not-allowed' : 'pointer',
              opacity: (loading || importing) ? 0.6 : 1
            }}
          >
            {importing ? <RefreshCw className="spin" size={18} /> : <Upload size={18} />}
            {t('backup.import_btn', { defaultValue: 'رفع واستعادة النسخة' })}
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={loading || importing}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Warning note */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem 1.25rem',
        borderRadius: '12px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start'
      }}>
        <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        <div>
          <h5 style={{ margin: '0 0 0.25rem 0', color: '#ef4444', fontWeight: 'bold', fontSize: '0.88rem' }}>
            {t('backup.warning_title', { defaultValue: 'تنبيه أمني هام جداً' })}
          </h5>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.5' }}>
            {t('backup.warning_desc', { defaultValue: 'استعادة ملف نسخة احتياطية سيقوم بتحديث ودمج السجلات في قاعدة البيانات. يرجى التأكد من صحة وموثوقية الملف المرفوع قبل البدء بالاستعادة لتجنب تلف البيانات.' })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BackupRestore;
