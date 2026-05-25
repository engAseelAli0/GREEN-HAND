import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, Trash2, Search, ArrowRight, Loader2, RefreshCw, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const OldItemsManagement = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  
  // File upload states
  const [excelData, setExcelData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rowsCount, setRowsCount] = useState(0);

  // Database list states
  const [dbItems, setDbItems] = useState([]);
  const [dbTotalCount, setDbTotalCount] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  
  const canEdit = hasPermission('admin', 'edit') || hasPermission('admin', 'add');
  const canDelete = hasPermission('admin', 'delete');

  useEffect(() => {
    fetchDbItems();
  }, [currentPage, searchTerm]);

  // Fetch paginated, searched old items
  const fetchDbItems = async () => {
    setLoadingList(true);
    try {
      let query = supabase
        .from('old_items')
        .select('*', { count: 'exact' });

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`item_code.ilike.${term},barcode.ilike.${term}`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setDbItems(data || []);
      setDbTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching old items:', err);
      toast.error(t('admin.messages.db_error', { defaultValue: 'خطأ في جلب البيانات من السحابة' }));
    } finally {
      setLoadingList(false);
    }
  };

  // Clear search and reset page
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  // Parse Excel file using SheetJS
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Convert to array of arrays
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rawData.length < 2) {
          toast.error(t('admin.old_items.empty_file', { defaultValue: 'ملف الإكسل فارغ ولا يحتوي على صفوف بيانات!' }));
          return;
        }

        // Auto-detect columns based on common names in Arabic and English
        const headers = rawData[0].map(h => String(h || '').trim().toLowerCase());
        let itemCodeIdx = -1;
        let barcodeIdx = -1;

        headers.forEach((header, index) => {
          if (
            header.includes('صنف') || 
            header.includes('code') || 
            header.includes('model') || 
            header.includes('موديل') || 
            header.includes('item') ||
            header.includes('رمز')
          ) {
            itemCodeIdx = index;
          }
          if (
            header.includes('باركود') || 
            header.includes('bar') || 
            header.includes('ملصق') || 
            header.includes('رمز خطي')
          ) {
            barcodeIdx = index;
          }
        });

        // Fallback to first two columns if automatic detection fails
        if (itemCodeIdx === -1) itemCodeIdx = 0;
        if (barcodeIdx === -1) barcodeIdx = 1;

        // Extract and map rows, ignoring empty ones and headers
        const parsedRows = [];
        const seenItemCodes = new Set();
        const seenBarcodes = new Set();

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          const itemCode = row[itemCodeIdx] !== undefined && row[itemCodeIdx] !== null ? String(row[itemCodeIdx]).trim() : '';
          const barcode = row[barcodeIdx] !== undefined && row[barcodeIdx] !== null ? String(row[barcodeIdx]).trim() : '';

          if (itemCode || barcode) {
            // Local deduplication: check duplicate only if value is present
            const isItemCodeDup = itemCode && seenItemCodes.has(itemCode);
            const isBarcodeDup = barcode && seenBarcodes.has(barcode);

            if (!isItemCodeDup && !isBarcodeDup) {
              if (itemCode) seenItemCodes.add(itemCode);
              if (barcode) seenBarcodes.add(barcode);

              parsedRows.push({
                item_code: itemCode || null,
                barcode: barcode || null
              });
            }
          }
        }

        if (parsedRows.length === 0) {
          toast.error(t('admin.old_items.no_valid_rows', { defaultValue: 'لم يتم العثور على أسطر صالحة (يجب أن يحتوي السطر على رقم الصنف أو الباركود على الأقل)' }));
          return;
        }

        setExcelData(parsedRows);
        setRowsCount(parsedRows.length);
        toast.success(t('admin.old_items.parse_success', { 
          defaultValue: 'تم قراءة الملف بنجاح! جاهز لرفع {{count}} صنف.',
          count: parsedRows.length 
        }));
      } catch (err) {
        console.error('Error parsing Excel:', err);
        toast.error(t('admin.old_items.parse_error', { defaultValue: 'حدث خطأ أثناء قراءة ملف الإكسل. يرجى التأكد من سلامة صيغة الملف.' }));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Perform background bulk upload in batches of 2000
  const handleUpload = async () => {
    if (!canEdit) {
      toast.error(t('auth.unauthorized_desc'));
      return;
    }
    if (excelData.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    const batchSize = 2000;
    const total = excelData.length;
    let uploadedCount = 0;

    const toastId = toast.loading(t('admin.old_items.uploading_toast', { defaultValue: 'جاري البدء برفع الأصناف...' }));

    try {
      // Process batches sequentially
      for (let i = 0; i < total; i += batchSize) {
        const batch = excelData.slice(i, i + batchSize);
        
        // Supabase bulk insert
        const { error } = await supabase
          .from('old_items')
          .insert(batch);

        if (error) {
          console.error('Upload batch error:', error);
          throw new Error(error.message);
        }

        uploadedCount += batch.length;
        // Update live progress
        const percent = Math.min(Math.round((uploadedCount / total) * 100), 100);
        setUploadProgress(percent);
        toast.loading(
          t('admin.old_items.upload_progress', { 
            defaultValue: 'جاري رفع البيانات: {{uploaded}} من {{total}} ({{percent}}%)',
            uploaded: uploadedCount.toLocaleString(),
            total: total.toLocaleString(),
            percent: percent
          }),
          { id: toastId }
        );
      }

      toast.success(t('admin.old_items.upload_complete', { 
        defaultValue: 'تهانينا! تم رفع {{total}} صنف بنجاح وبسرعة فائقة.',
        total: total.toLocaleString()
      }), { id: toastId });
      
      setExcelData([]);
      setFileName('');
      setRowsCount(0);
      setCurrentPage(1);
      fetchDbItems();
    } catch (err) {
      console.error(err);
      const exactError = err.message || '';
      toast.error(
        t('admin.old_items.upload_fail', { 
          defaultValue: `فشلت عملية الرفع. التفاصيل: ${exactError || 'خطأ غير معروف. الرجاء التأكد من تشغيل ملف SQL ومسح الجدول.'}`
        }), 
        { id: toastId, duration: 8000 }
      );
    } finally {
      setUploading(false);
    }
  };

  // Delete a single old item
  const handleDeleteItem = async (id, itemCode) => {
    if (!canDelete) {
      toast.error(t('auth.unauthorized_desc'));
      return;
    }
    if (!window.confirm(t('admin.old_items.confirm_delete_single', { defaultValue: 'هل أنت متأكد من حذف الصنف ({{code}})؟', code: itemCode }))) return;

    try {
      const { error } = await supabase
        .from('old_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success(t('admin.old_items.delete_single_success', { defaultValue: 'تم حذف الصنف بنجاح.' }));
      fetchDbItems();
    } catch (err) {
      console.error(err);
      toast.error(t('admin.old_items.delete_fail', { defaultValue: 'خطأ في عملية الحذف' }));
    }
  };

  // Wipe the entire old_items database table for a clean re-upload
  const handleClearAll = async () => {
    if (!canDelete) {
      toast.error(t('auth.unauthorized_desc'));
      return;
    }
    if (!window.confirm(t('admin.old_items.confirm_clear_all', { 
      defaultValue: '⚠️ تحذير شديد الخطورة:\n\nهل أنت متأكد من مسح جميع الأصناف القديمة ({{count}} صنف) من قاعدة البيانات بالكامل؟\nلا يمكن التراجع عن هذا الإجراء وسيتم تفريغ الجدول للرفع من جديد.',
      count: dbTotalCount.toLocaleString()
    }))) return;

    const toastId = toast.loading(t('admin.old_items.clearing', { defaultValue: 'جاري مسح البيانات بالكامل...' }));
    try {
      // Deletes all records since id is bigint generate by default (meaning > 0)
      const { error } = await supabase
        .from('old_items')
        .delete()
        .gt('id', 0);

      if (error) throw error;

      toast.success(t('admin.old_items.clear_success', { defaultValue: 'تم تصفية ومسح جدول الأصناف القديمة بالكامل بنجاح!' }), { id: toastId });
      setCurrentPage(1);
      fetchDbItems();
    } catch (err) {
      console.error(err);
      toast.error(t('admin.old_items.clear_fail', { defaultValue: 'فشلت عملية مسح البيانات!' }), { id: toastId });
    }
  };

  const totalPages = Math.ceil(dbTotalCount / itemsPerPage) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ─── Excel Upload Area ─── */}
      <div style={{
        padding: '2rem',
        background: 'linear-gradient(135deg, var(--surface-color), rgba(212, 175, 55, 0.03))',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed rgba(212, 175, 55, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(212, 175, 55, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-color)',
          marginBottom: '0.25rem'
        }}>
          <FileSpreadsheet size={32} />
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-strong)', marginBottom: '0.4rem' }}>
            {t('admin.old_items.upload_title', { defaultValue: 'رفع الأصناف والباركودات من النظام السابق' })}
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '500px', lineHeight: '1.5' }}>
            {t('admin.old_items.upload_desc', { 
              defaultValue: 'ارفع ملف Excel يحتوي على عمودين: رقم الصنف (رقم الموديل) والباركود. سيقوم النظام بمقارنة أي موديل جديد بهذه القائمة لمنع التكرار نهائياً.' 
            })}
          </p>
        </div>

        {/* File Selector */}
        {!uploading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.7rem 1.75rem',
              background: 'linear-gradient(135deg, var(--accent-color), #b58d27)',
              color: '#fff',
              fontWeight: '600',
              borderRadius: 'var(--radius-md)',
              cursor: canEdit ? 'pointer' : 'not-allowed',
              boxShadow: '0 4px 12px rgba(212, 175, 55, 0.25)',
              transition: 'all 0.2s ease',
              opacity: canEdit ? 1 : 0.6
            }}
            onMouseEnter={e => canEdit && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => canEdit && (e.currentTarget.style.transform = 'none')}
            >
              <Upload size={16} />
              {fileName ? t('admin.old_items.change_file', { defaultValue: 'تغيير الملف' }) : t('admin.old_items.select_file', { defaultValue: 'اختر ملف Excel' })}
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileChange} 
                disabled={!canEdit}
                style={{ display: 'none' }} 
              />
            </label>

            {fileName && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                📄 {fileName} ({rowsCount.toLocaleString()} {t('admin.old_items.rows_count', { defaultValue: 'سطر' })})
              </span>
            )}
          </div>
        )}

        {/* Dynamic Progress Bar */}
        {uploading && (
          <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', fontSize: '0.9rem', fontWeight: 'bold' }}>
              <Loader2 size={16} className="spin" />
              {t('admin.old_items.uploading_active', { defaultValue: 'جاري الرفع التلقائي السريع...' })}
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-color), #fcd34d)', borderRadius: '10px', transition: 'width 0.15s ease' }} />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>{uploadProgress}%</span>
          </div>
        )}

        {/* Start Upload Button */}
        {excelData.length > 0 && !uploading && (
          <button
            onClick={handleUpload}
            style={{
              padding: '0.75rem 2.5rem',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontWeight: 'bold',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <CheckCircle2 size={16} />
            {t('admin.old_items.confirm_upload', { defaultValue: 'ابدأ الرفع السريع للملف بالكامل' })}
          </button>
        )}
      </div>

      {/* ─── Search & Actions Header ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        marginTop: '0.5rem'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '400px' }}>
          <input
            type="text"
            placeholder={t('admin.old_items.search_placeholder', { defaultValue: '🔍 ابحث برقم الصنف أو الباركود القديم...' })}
            value={searchTerm}
            onChange={handleSearchChange}
            style={{
              width: '100%',
              padding: '0.65rem 1rem 0.65rem 2.5rem',
              background: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              fontFamily: 'Tajawal, sans-serif'
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        </div>

        {/* Clear and Total Statistics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{t('admin.old_items.total_recorded', { defaultValue: 'إجمالي الأصناف المسجلة:' })}</span>
            <strong style={{ color: 'var(--accent-color)', fontSize: '1.05rem', fontFamily: 'Outfit, sans-serif' }}>
              {dbTotalCount.toLocaleString()}
            </strong>
          </div>

          {dbTotalCount > 0 && canDelete && (
            <button
              onClick={handleClearAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.25rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#ef4444',
                fontWeight: '600',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.18)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
            >
              <Trash2 size={14} />
              {t('admin.old_items.clear_all_btn', { defaultValue: 'مسح الجدول بالكامل' })}
            </button>
          )}
        </div>
      </div>

      {/* ─── Paginated Table ─── */}
      <div style={{
        background: 'var(--surface-color)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)'
      }}>
        {loadingList ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', gap: '0.75rem', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="spin" color="var(--accent-color)" />
            <span style={{ fontSize: '0.9rem' }}>{t('admin.old_items.loading', { defaultValue: 'جاري جلب قائمة الأصناف القديمة...' })}</span>
          </div>
        ) : dbItems.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            gap: '0.5rem',
            textAlign: 'center'
          }}>
            <FileSpreadsheet size={40} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <h4 style={{ fontWeight: 'bold', color: 'var(--text-strong)', fontSize: '1rem', marginTop: '0.5rem' }}>
              {searchTerm ? t('admin.old_items.no_results', { defaultValue: 'لا توجد نتائج تطابق بحثك!' }) : t('admin.old_items.no_records', { defaultValue: 'قائمة الأصناف القديمة فارغة تماماً!' })}
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
              {searchTerm ? t('admin.old_items.try_other_search', { defaultValue: 'تأكد من كتابة رقم الصنف أو الباركود بشكل صحيح.' }) : t('admin.old_items.upload_to_start', { defaultValue: 'يرجى اختيار ملف Excel ورفعه لتعبئة هذا الجدول.' })}
            </p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', width: '80px' }}>#</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600' }}>{t('admin.old_items.item_code_col', { defaultValue: 'رقم الصنف (رقم الموديل)' })}</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600' }}>{t('admin.old_items.barcode_col', { defaultValue: 'رقم الباركود القديم' })}</th>
                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', width: '120px' }}>{t('admin.old_items.date_col', { defaultValue: 'تاريخ الرفع' })}</th>
                    {canDelete && <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', width: '80px', textAlign: 'center' }}>{t('admin.actions_header', { defaultValue: 'العمليات' })}</th>}
                  </tr>
                </thead>
                <tbody>
                  {dbItems.map((item, idx) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr 
                        key={item.id} 
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.01)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '0.9rem 1.5rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {rowNumber.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.9rem 1.5rem', fontWeight: 'bold', color: 'var(--text-strong)' }}>
                          {item.item_code}
                        </td>
                        <td style={{ padding: '0.9rem 1.5rem', fontFamily: 'Outfit, sans-serif', letterSpacing: '1px', color: 'var(--accent-color)' }}>
                          {item.barcode}
                        </td>
                        <td style={{ padding: '0.9rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </td>
                        {canDelete && (
                          <td style={{ padding: '0.9rem 1.5rem', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteItem(item.id, item.item_code)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(239, 68, 68, 0.65)',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(239, 68, 68, 0.65)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255, 255, 255, 0.01)',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {t('admin.old_items.page_indicator', { 
                    defaultValue: 'الصفحة {{page}} من {{total}} (معروض {{shown}} صنف)',
                    page: currentPage,
                    total: totalPages,
                    shown: dbTotalCount.toLocaleString()
                  })}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.45rem 0.85rem',
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-main)',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === 1 ? 0.4 : 1,
                      transition: 'all 0.2s ease',
                      fontSize: '0.85rem'
                    }}
                  >
                    <ChevronRight size={15} style={{ marginLeft: '4px' }} />
                    {t('admin.old_items.prev_btn', { defaultValue: 'السابق' })}
                  </button>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.45rem 0.85rem',
                      background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-main)',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      opacity: currentPage === totalPages ? 0.4 : 1,
                      transition: 'all 0.2s ease',
                      fontSize: '0.85rem'
                    }}
                  >
                    {t('admin.old_items.next_btn', { defaultValue: 'التالي' })}
                    <ChevronLeft size={15} style={{ marginRight: '4px' }} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default OldItemsManagement;
