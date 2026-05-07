import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppData, defaultOrderState } from '../context/AppDataContext';
import { Save, RefreshCw, Hash, Calendar, Box, Scissors, Palette, LayoutGrid, ChevronRight, ChevronLeft, MessageSquare, CheckSquare, Square, Ruler, Camera, X, ImagePlus, Edit3, Copy, Trash2, Layers, PanelTop } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/imageUtils';

const TABS = [
  { id: 'buyer', label: 'المشتري والمنتج', icon: Hash, num: 1 },
  { id: 'dates', label: 'المواعيد والكمية', icon: Calendar, num: 2 },
  { id: 'fabrics', label: 'الأقمشة والمواد', icon: Scissors, num: 3 },
  { id: 'factory', label: 'المصنع والتغليف', icon: Box, num: 4 },
  { id: 'colors', label: 'الألوان والمقاسات', icon: Palette, num: 5 },
  { id: 'packaging', label: 'شروط التعبئة', icon: CheckSquare, num: 6 },
  { id: 'measurements', label: 'المقاسات التفصيلية', icon: Ruler, num: 7 },
];

// Helper to format date as DD/MM/YYYY for display
const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const CustomDateInput = ({ label, value, onChange, min }) => {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input 
          type="text" 
          className="form-control" 
          value={formatDateForDisplay(value)} 
          placeholder="DD/MM/YYYY"
          readOnly
          style={{ cursor: 'pointer', backgroundColor: 'var(--bg-color)' }}
          onClick={(e) => {
             const picker = e.currentTarget.nextSibling;
             if (picker && picker.showPicker) picker.showPicker();
          }}
        />
        <input 
          type="date" 
          className="form-control"
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            opacity: 0, 
            cursor: 'pointer',
            padding: 0
          }} 
          value={value || ''} 
          min={min || ''}
          onChange={(e) => onChange(e.target.value)} 
          onClick={(e) => {
            if (e.target.showPicker) e.target.showPicker();
          }}
        />
        <div style={{ 
          position: 'absolute', 
          left: '12px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          pointerEvents: 'none',
          opacity: 0.7,
          color: 'var(--accent-color)',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Calendar size={18} />
        </div>
      </div>
    </div>
  );
};

const ClearableSelect = ({ value, onChange, children, className = "form-control", style, disabled }) => (
  <div style={{ position: 'relative', width: '100%', ...style }}>
    <select className={className} value={value || ''} onChange={onChange} disabled={disabled}>
      {children}
    </select>
    {value && !disabled && (
      <button 
        type="button"
        onMouseDown={(e) => {
          e.preventDefault(); 
          e.stopPropagation();
          onChange({ target: { value: '' } });
        }}
        style={{
          position: 'absolute', left: '35px', top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444', cursor: 'pointer', padding: '3px', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}
        title="إلغاء الاختيار"
      >
        <X size={12} strokeWidth={3} />
      </button>
    )}
  </div>
);

const DataEntryWizard = () => {
  const { lookups, currentOrder, updateOrder, setCurrentOrder } = useAppData();
  const [activeTab, setActiveTab] = useState('buyer');
  const [selectedColorsArr, setSelectedColorsArr] = useState([]);
  const [serialStatus, setSerialStatus] = useState(null);
  const [tabKey, setTabKey] = useState(0);
  const [productImages, setProductImages] = useState(() => {
     if (currentOrder?.productImages?.length > 0) {
         return currentOrder.productImages.map(img => ({ ...img, preview: img.preview || img.url }));
     }
     return [];
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalSerial, setOriginalSerial] = useState('');
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPackagingPicker, setShowPackagingPicker] = useState(false);
  const serialSearchRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const tabNavRef = useRef(null);
  const colorPickerRef = useRef(null);
  const packagingPickerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('gh_viewMode') || 'tabs'; } catch { return 'tabs'; }
  });

  // ─── Close pickers on outside click ───
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
      if (packagingPickerRef.current && !packagingPickerRef.current.contains(e.target)) {
        setShowPackagingPicker(false);
      }
    };
    if (showColorPicker || showPackagingPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, showPackagingPicker]);

  // ─── Tab Scroll Logic (RTL-safe, bulletproof) ───
  const checkTabScroll = useCallback(() => {
    const nav = tabNavRef.current;
    if (!nav) return;
    const children = nav.querySelectorAll('.tab-btn');
    if (children.length === 0) return;

    const navRect = nav.getBoundingClientRect();
    const firstBtn = children[0].getBoundingClientRect();
    const lastBtn = children[children.length - 1].getBoundingClientRect();
    const pad = 4; // tolerance pixels

    // RTL: first tab (tab 1) is on the RIGHT, last tab (tab 7) is on the LEFT
    // Is the last tab clipped on the left?
    const leftHidden = lastBtn.left < navRect.left + pad;
    // Is the first tab clipped on the right?
    const rightHidden = firstBtn.right > navRect.right - pad;

    setCanScrollLeft(leftHidden);
    setCanScrollRight(rightHidden);
  }, []);

  useEffect(() => {
    const nav = tabNavRef.current;
    if (!nav) return;
    // Multiple delayed checks to catch any layout shifts
    const t1 = setTimeout(checkTabScroll, 50);
    const t2 = setTimeout(checkTabScroll, 300);
    const t3 = setTimeout(checkTabScroll, 800);
    nav.addEventListener('scroll', checkTabScroll, { passive: true });
    const ro = new ResizeObserver(checkTabScroll);
    ro.observe(nav);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      nav.removeEventListener('scroll', checkTabScroll);
      ro.disconnect();
    };
  }, [checkTabScroll, viewMode]);

  const scrollTabNav = (direction) => {
    const nav = tabNavRef.current;
    if (!nav) return;
    const children = Array.from(nav.querySelectorAll('.tab-btn'));
    if (children.length === 0) return;
    const navRect = nav.getBoundingClientRect();

    if (direction === 'left') {
      // Find the first tab that's hidden/clipped on the left side
      for (let i = children.length - 1; i >= 0; i--) {
        const r = children[i].getBoundingClientRect();
        if (r.left < navRect.left + 4) {
          children[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          break;
        }
      }
    } else {
      // Find the first tab that's hidden/clipped on the right side
      for (let i = 0; i < children.length; i++) {
        const r = children[i].getBoundingClientRect();
        if (r.right > navRect.right - 4) {
          children[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          break;
        }
      }
    }
    // Re-check arrows after scroll finishes
    setTimeout(checkTabScroll, 400);
  };

  const toggleViewMode = () => {
    const next = viewMode === 'tabs' ? 'scroll' : 'tabs';
    setViewMode(next);
    try { localStorage.setItem('gh_viewMode', next); } catch {}
  };

  const fetchNextAvailableSerial = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('serial_number')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (data && data.length > 0) {
        const match = data[0].serial_number.match(/\d+/);
        if (match) return (parseInt(match[0]) + 1).toString();
      }
      return '1000';
    } catch (err) {
      console.error('Error fetching latest serial', err);
      return '1000';
    }
  };

  useEffect(() => {
    if (!currentOrder.serialNumber) {
       fetchNextAvailableSerial().then(nextNum => {
         updateOrder('serialNumber', nextNum);
         setSerialStatus('available');
       });
    }
  }, []); // eslint-disable-line

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setTabKey(prev => prev + 1);
  };

  // ─── Image Upload Handlers ───
  const handleImageUpload = async (e) => {
    const originalFiles = Array.from(e.target.files);
    if (!originalFiles.length) return;

    const modelNum = currentOrder.serialNumber?.trim();
    if (!modelNum) {
      toast.error('الرجاء إدخال رقم الموديل أولاً قبل رفع الصور');
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading('جاري ضغط ورفع الصور...');

    try {
      const newImages = [];
      for (let i = 0; i < originalFiles.length; i++) {
        const file = await compressImage(originalFiles[i], 1200, 0.75);
        const ext = file.name.split('.').pop();
        const currentCount = productImages.length + newImages.length;
        const fileName = currentCount === 0 ? `${modelNum}.${ext}` : `${modelNum}#${currentCount}.${ext}`;
        const filePath = `product-images/${fileName}`;

        const { data, error } = await supabase.storage
          .from('product_images')
          .upload(filePath, file, { upsert: true });

        if (error) {
          console.error('Upload error:', error);
          toast.error(`فشل رفع الصورة: ${error.message}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('product_images')
          .getPublicUrl(filePath);

        newImages.push({
          name: fileName,
          path: filePath,
          url: urlData.publicUrl,
          preview: URL.createObjectURL(file)
        });
      }

      setProductImages(prev => [...prev, ...newImages]);
      updateOrder('productImages', [...(currentOrder.productImages || []), ...newImages.map(img => ({ name: img.name, path: img.path, url: img.url }))]);
      toast.success(`تم رفع ${newImages.length} صورة بنجاح!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء رفع الصور!', { id: toastId });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async (index) => {
    const img = productImages[index];
    try {
      await supabase.storage.from('product_images').remove([img.path]);
    } catch (err) {
      console.error('Delete error:', err);
    }
    const updated = productImages.filter((_, i) => i !== index);
    setProductImages(updated);
    updateOrder('productImages', updated.map(im => ({ name: im.name, path: im.path, url: im.url })));
    toast('تم حذف الصورة', { icon: '🗑️' });
  };

  const goNext = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx < TABS.length - 1) switchTab(TABS[idx + 1].id);
  };

  const goPrev = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx > 0) switchTab(TABS[idx - 1].id);
  };

  const toggleColor = (colorName) => {
    setSelectedColorsArr(prev => {
      let nextArr;
      if (prev.includes(colorName)) {
        nextArr = prev.filter(c => c !== colorName);
      } else {
        nextArr = [...prev, colorName];
      }
      
      // If removing a color and no totalQty, just clean up that color from distribution
      if (nextArr.length === 0) {
        const dist = { ...(currentOrder.colorDistribution || {}) };
        delete dist[colorName];
        updateOrder('colorDistribution', dist);
      }
      // The useEffect below will handle redistribution automatically
      return nextArr;
    });
  };

  useEffect(() => {
    if (currentOrder.productName) {
      const prodObj = lookups.products?.find(p => (typeof p === 'object' ? p.name : p) === currentOrder.productName);
      if (prodObj && typeof prodObj === 'object' && prodObj.codePrefix) {
        updateOrder('barcode', `${prodObj.codePrefix}${currentOrder.serialNumber || ''}`);
      } else {
        updateOrder('barcode', '');
      }
    } else {
      updateOrder('barcode', '');
    }
  }, [currentOrder.productName, currentOrder.serialNumber, lookups.products]);

  useEffect(() => {
    const totalQty = parseInt(currentOrder.totalQuantity) || 0;
    const packageVal = currentOrder.cartonPackage || '';
    const packageQty = parseInt(packageVal.replace(/[^0-9]/g, '')) || 0;
    
    if (totalQty > 0 && packageQty > 0) {
      if (packageQty > totalQty) {
        // If typing total quantity and it's temporarily less than package, just show warning in text field
        if (currentOrder.cartonQty !== 'الكمية غير كافية') {
          updateOrder('cartonQty', 'الكمية غير كافية');
        }
        return;
      }

      const cartons = parseFloat((totalQty / packageQty).toFixed(2));
      const resultText = `${cartons} كرتون × ${packageQty} قطعة`;
      
      if (currentOrder.cartonQty !== resultText) {
        updateOrder('cartonQty', resultText);
      }
    } else if ((!totalQty || !packageQty) && currentOrder.cartonQty) {
      updateOrder('cartonQty', '');
    }
  }, [currentOrder.totalQuantity, currentOrder.cartonPackage, currentOrder.cartonQty, updateOrder]);

  const handleSerialChange = async (val) => {
    updateOrder('serialNumber', val);
    if (!val.trim()) {
      setSerialStatus(null);
      return;
    }
    setSerialStatus('checking');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('serial_number')
        .eq('serial_number', val)
        .single();
      if (data) {
        setSerialStatus('used');
      } else {
        setSerialStatus('available');
      }
    } catch (err) {
       setSerialStatus('available');
    }
  };

  const validateOrder = () => {
    if (!currentOrder.serialNumber?.trim()) {
      toast.error('الرجاء كتابة الرقم التسلسلي للطلبية أولاً.');
      return false;
    }
    const requiredFields = [
      { key: 'buyerMobile', label: 'رقم جوال المشتري' },
      { key: 'buyerCompany', label: 'اسم شركة المشتري' },
      { key: 'productName', label: 'اسم المنتج' },
      { key: 'totalQuantity', label: 'الكمية الإجمالية' },
      { key: 'deliveryDate', label: 'تاريخ التسليم' },
    ];
    for (const field of requiredFields) {
      if (!currentOrder[field.key] || currentOrder[field.key].toString().trim() === '') {
        toast.error(`الرجاء تعبئة حقل: ${field.label}`);
        return false;
      }
    }
    const totalQty = parseInt(currentOrder.totalQuantity) || 0;
    const packageVal = currentOrder.cartonPackage || '';
    const packageQty = parseInt(packageVal.replace(/[^0-9]/g, '')) || 0;
    if (packageQty > 0 && totalQty > 0 && packageQty > totalQty) {
      toast.error(`خطأ في التعبئة: تعبئة الكرتون (${packageQty}) لا يمكن أن تكون أكبر من الكمية الإجمالية (${totalQty}).`);
      return false;
    }

    return true;
  };

  const resetAfterSave = () => {
    const nextNum = parseInt(currentOrder.serialNumber) + 1;
    setCurrentOrder({
      ...defaultOrderState,
      serialNumber: !isNaN(nextNum) ? nextNum.toString() : '1000'
    });
    setSelectedColorsArr([]);
    setProductImages([]);
    setSerialStatus('available');
    setIsEditMode(false);
    setOriginalSerial('');
    switchTab('buyer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save as NEW order
  const handleSaveNew = async () => {
    if (!validateOrder()) return;
    if (serialStatus === 'used') {
      toast.error('هذا الرقم التسلسلي مستخدم مسبقاً! قم باسترداده للتعديل أو استخدم رقماً جديداً.');
      return;
    }
    const toastId = toast.loading('جاري حفظ الطلبية الجديدة...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([{ serial_number: currentOrder.serialNumber, order_data: currentOrder }]);
      if (error) {
        console.error(error);
        toast.error('حدث خطأ أثناء الحفظ! تأكد من إنشاء جدول orders وتصريحاته.', { id: toastId });
      } else {
        toast.success(`تم حفظ الطلبية الجديدة (${currentOrder.serialNumber}) بنجاح!`, { id: toastId });
        resetAfterSave();
      }
    } catch (err) {
      console.error(err);
      toast.error('خطأ في الاتصال بقاعدة البيانات!', { id: toastId });
    }
  };

  // UPDATE existing order (same or changed serial)
  const handleUpdate = async () => {
    if (!validateOrder()) return;
    
    if (currentOrder.serialNumber !== originalSerial && serialStatus === 'used') {
      toast.error('رقم الموديل المستهدف مستخدم في طلبية أخرى! اختر رقماً مختلفاً أو تراجع.');
      return;
    }

    const toastId = toast.loading('جاري تحديث الطلبية...');
    try {
      let updatedImages = [...(currentOrder.productImages || [])];
      let hasImageErrors = false;

      if (currentOrder.serialNumber !== originalSerial && updatedImages.length > 0) {
         toast.loading('جاري نقل الصور للرقم الجديد...', { id: toastId });
         const newImagesObj = [];
         
         for (let i = 0; i < updatedImages.length; i++) {
            const img = updatedImages[i];
            const ext = img.name.split('.').pop();
            const newName = i === 0 ? `${currentOrder.serialNumber}.${ext}` : `${currentOrder.serialNumber}_${i}.${ext}`;
            const newPath = `product-images/${newName}`;
            
            if (img.path !== newPath) {
               const { data, error } = await supabase.storage.from('product_images').move(img.path, newPath);
               if (error) {
                 console.error('Error renaming image:', error);
                 hasImageErrors = true;
                 newImagesObj.push(img);
               } else {
                 const { data: urlData } = supabase.storage.from('product_images').getPublicUrl(newPath);
                 newImagesObj.push({
                   name: newName,
                   path: newPath,
                   url: urlData.publicUrl,
                   preview: urlData.publicUrl
                 });
               }
            } else {
               newImagesObj.push(img);
            }
         }
         updatedImages = newImagesObj;
         currentOrder.productImages = updatedImages; // Prepare to save new URLs
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ 
            serial_number: currentOrder.serialNumber,
            order_data: currentOrder 
        })
        .eq('serial_number', originalSerial);

      if (error) {
        console.error(error);
        toast.error('حدث خطأ أثناء التحديث!', { id: toastId });
      } else {
        if (hasImageErrors) {
           toast.success(`تم التحديث للرقم (${currentOrder.serialNumber}) مع مشكلة في نقل بعض الصور ⚠️`, { id: toastId });
        } else {
           toast.success(`تم التحديث بنجاح! رقم الطلبية الآن هو (${currentOrder.serialNumber}) ✏️`, { id: toastId });
        }
        resetAfterSave();
      }
    } catch (err) {
      console.error(err);
      toast.error('خطأ في الاتصال بقاعدة البيانات!', { id: toastId });
    }
  };

  // Save as COPY (new serial from edit mode)
  const handleSaveAsCopy = async () => {
    if (!validateOrder()) return;
    if (currentOrder.serialNumber === originalSerial) {
      toast.error('الرجاء تغيير رقم الموديل لحفظ نسخة جديدة!');
      return;
    }
    if (serialStatus === 'used') {
      toast.error('رقم الموديل الجديد مستخدم مسبقاً! استخدم رقماً مختلفاً.');
      return;
    }
    const toastId = toast.loading('جاري حفظ النسخة الجديدة...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([{ serial_number: currentOrder.serialNumber, order_data: currentOrder }]);
      if (error) {
        console.error(error);
        toast.error('حدث خطأ أثناء الحفظ!', { id: toastId });
      } else {
        toast.success(`تم حفظ نسخة جديدة برقم (${currentOrder.serialNumber}) بنجاح! 📋`, { id: toastId });
        resetAfterSave();
      }
    } catch (err) {
      console.error(err);
      toast.error('خطأ في الاتصال بقاعدة البيانات!', { id: toastId });
    }
  };

  const handleDeleteOrder = async () => {
    if (!originalSerial) return;
    
    const confirmDelete = window.confirm(`هل أنت متأكد من حذف الطلبية رقم (${originalSerial}) بالكامل؟\n\n- سيتم مسح بياناتها نهائياً من قاعدة البيانات.\n- سيتم تحرير رقم الموديل ليمكن استخدامه مجدداً.\n- سيتم حذف جميع الصور المرتبطة بها.`);
    
    if (!confirmDelete) return;

    const toastId = toast.loading('جاري حذف الطلبية...');

    try {
      if (currentOrder.productImages && currentOrder.productImages.length > 0) {
         const imagePaths = currentOrder.productImages.map(img => img.path);
         const { error: storageError } = await supabase.storage.from('product_images').remove(imagePaths);
         if (storageError) {
             console.error('Error deleting images:', storageError);
         }
      }

      const { error: dbError } = await supabase
        .from('orders')
        .delete()
        .eq('serial_number', originalSerial);

      if (dbError) {
        console.error(dbError);
        toast.error('حدث خطأ أثناء حذف الطلبية!', { id: toastId });
      } else {
        toast.success(`تم حذف الطلبية رقم (${originalSerial}) بنجاح وتحرير الرقم! 🗑️`, { id: toastId });
        resetAfterSave();
      }
    } catch (err) {
      console.error(err);
      toast.error('خطأ في الاتصال بقاعدة البيانات!', { id: toastId });
    }
  };

  const handleF9Press = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFetch();
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (showSerialsList || fetchingSerials) return;
      setFetchingSerials(true);
      setShowSerialsList(true);
      setSerialSearchQuery('');
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('serial_number')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (data && !error) {
           setAvailableSerials(data.map(d => d.serial_number));
        }
      } catch (err) {
        console.error(err);
      } finally {
         setFetchingSerials(false);
         // Auto-focus search input after data loads
         setTimeout(() => serialSearchRef.current?.focus(), 100);
      }
    } else if (e.key === 'Escape') {
      setShowSerialsList(false);
      setSerialSearchQuery('');
    }
  };

  const handleFetch = async (overrideSerial) => {
    const serial = typeof overrideSerial === 'string' ? overrideSerial : document.getElementById('fetchSerialInput')?.value;
    if (!serial) {
       toast.error('الرجاء إدخال رقم الطلبية التسلسلي المراد استردادها');
       return;
    }
    const toastId = toast.loading('جاري البحث في قاعدة البيانات...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', serial)
        .single();
      if (error || !data) {
        toast.error('الطلبية غير موجودة في السحابة!', { id: toastId });
      } else {
        setCurrentOrder(data.order_data);
        const savedImages = data.order_data.productImages || [];
        setProductImages(savedImages.map(img => ({ ...img, preview: img.url })));
        
        // Restore selected colors for the table
        if (data.order_data.colorDistribution) {
           setSelectedColorsArr(Object.keys(data.order_data.colorDistribution));
        } else {
           setSelectedColorsArr([]);
        }
        
        setSerialStatus('used');
        setIsEditMode(true);
        setOriginalSerial(serial);
        toast.success(`تم استرداد الطلبية: ${serial} — يمكنك التعديل الآن ✏️`, { id: toastId });
      }
    } catch (err) {
      toast.error('خطأ في الاتصال بالانترنت أو قاعدة البيانات!', { id: toastId });
    }
  };

  const handleClear = async () => {
    const nextNum = await fetchNextAvailableSerial();
    setCurrentOrder({ ...defaultOrderState, serialNumber: nextNum });
    setProductImages([]);
    setSelectedColorsArr([]);
    setIsEditMode(false);
    setOriginalSerial('');
    setSerialStatus('available');
    switchTab('buyer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('تم تصفير وإلغاء جميع الحقول بنجاح', { icon: '🧹' });
  };

  const handleColorChange = (color, size, qty) => {
    const dist = { ...(currentOrder.colorDistribution || {}) };
    if (dist[color]) {
      dist[color] = { ...dist[color] };
    } else {
      dist[color] = {};
    }
    dist[color][size] = qty;
    updateOrder('colorDistribution', dist);
  };

  const handleMaterialChange = (index, field, value) => {
    const newMaterials = (currentOrder.materials || []).map(m => ({ ...m }));
    // Ensure the array has enough slots
    while (newMaterials.length <= index) {
      newMaterials.push({ name: '', percentage: '' });
    }
    
    if (field === 'percentage') {
       // Force Western digits (English digits)
       const standardValue = value.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
       const valNum = parseFloat(standardValue) || 0;
       
       let otherTotal = 0;
       newMaterials.forEach((m, i) => {
         if (i !== index) otherTotal += (parseFloat(m.percentage) || 0);
       });

       if (otherTotal + valNum > 100) {
         const allowed = 100 - otherTotal;
         newMaterials[index].percentage = allowed > 0 ? allowed.toString() : '0';
         toast(`لقد وصلت للحد الأقصى (100%). المسموح لهذا الحقل هو ${allowed}% فقط.`, { icon: '⚠️' });
       } else {
         newMaterials[index].percentage = standardValue;
       }
    } else {
       newMaterials[index][field] = value;
    }
    updateOrder('materials', newMaterials);
  };

  const handleMeasurementChange = (part, mName, size, value) => {
    const grouped = { ...(currentOrder.groupedMeasurements || {}) };
    if (grouped[part]) {
       grouped[part] = { ...grouped[part] };
    } else {
       grouped[part] = {};
    }
    if (grouped[part][mName]) {
       grouped[part][mName] = { ...grouped[part][mName] };
    } else {
       grouped[part][mName] = {};
    }
    grouped[part][mName][size] = value;
    updateOrder('groupedMeasurements', grouped);
  };
  
  const handlePackagingConditionChange = (cond, isChecked) => {
    const pc = { ...(currentOrder.packagingConditions || {}) };
    pc[cond] = isChecked;
    updateOrder('packagingConditions', pc);
  };

  const distributeQuantity = (colorsArr, isSilent = false, overrideTotalQty) => {
    const totalQty = overrideTotalQty !== undefined ? overrideTotalQty : parseInt(currentOrder.totalQuantity);
    if (!totalQty || isNaN(totalQty)) {
      if (!isSilent) toast.error('الرجاء إدخال الكمية الإجمالية أولاً');
      return;
    }
    if (colorsArr.length === 0) {
      if (!isSilent) toast.error('الرجاء تحديد لون واحد على الأقل لتوزيع الكمية');
      return;
    }
    let sizes = lookups.sizes || [];
    if (currentOrder.sizeFrom && currentOrder.sizeTo) {
      const idx1 = sizes.indexOf(currentOrder.sizeFrom);
      const idx2 = sizes.indexOf(currentOrder.sizeTo);
      if (idx1 !== -1 && idx2 !== -1) {
        sizes = sizes.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1);
      }
    }
    if (sizes.length === 0) {
      if (!isSilent) toast.error('لا توجد مقاسات محددة للتوزيع');
      return;
    }
    const cellsCount = colorsArr.length * sizes.length;
    const qtyPerCell = Math.floor(totalQty / cellsCount);
    const remainder = totalQty % cellsCount;
    const newDist = {};
    let remainderAdded = 0;
    
    colorsArr.forEach(color => {
      newDist[color] = {};
      sizes.forEach(size => {
         let val = qtyPerCell;
         if (remainderAdded < remainder) { val += 1; remainderAdded++; }
         newDist[color][size] = val;
      });
    });
    
    updateOrder('colorDistribution', newDist);
    if (!isSilent) toast.success('تم توزيع الكمية الإجمالية بالتساوي بين الألوان والمقاسات!');
  };

  // Auto-redistribute when totalQuantity, selected colors, or size range changes
  useEffect(() => {
    const totalQty = parseInt(currentOrder.totalQuantity);
    if (totalQty && !isNaN(totalQty) && selectedColorsArr.length > 0) {
      distributeQuantity(selectedColorsArr, true, totalQty);
    }
  }, [currentOrder.totalQuantity, selectedColorsArr, currentOrder.sizeFrom, currentOrder.sizeTo, currentOrder.manualSizes]); // eslint-disable-line react-hooks/exhaustive-deps

  const divideQuantityEqually = () => distributeQuantity(selectedColorsArr, false);

  let targetSizes = [];
  const hasManual = currentOrder.manualSizes && currentOrder.manualSizes.length > 0;

  if (hasManual) {
    // If manual sizes are provided, they take priority and the range is ignored
    targetSizes = currentOrder.manualSizes.filter(s => s && s.trim() !== '');
  } else if (currentOrder.sizeFrom && currentOrder.sizeTo) {
    // Otherwise use the range if both bounds are selected
    const allSizes = lookups.sizes || [];
    const idx1 = allSizes.indexOf(currentOrder.sizeFrom);
    const idx2 = allSizes.indexOf(currentOrder.sizeTo);
    if (idx1 !== -1 && idx2 !== -1) {
      targetSizes = allSizes.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1);
    }
  }

  const currentTabIdx = TABS.findIndex(t => t.id === activeTab);

  // ─── Render Tab Content ───
  const renderTabContent = (tabId) => {
    const targetTab = tabId || activeTab;
    switch (targetTab) {

      case 'buyer':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><Hash size={22} /> بيانات المشتري والمنتج</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">الرقم التسلسلي (إدخال يدوي)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={currentOrder.serialNumber} 
                    onChange={(e) => handleSerialChange(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch(currentOrder.serialNumber)}
                    placeholder="أدخل الرقم واضغط Enter لجلبه..." 
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                    <span>
                      {serialStatus === 'checking' && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>جاري التحقق...</span>}
                      {serialStatus === 'used' && <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>⚠️ مستخدمة مسبقاً!</span>}
                      {serialStatus === 'available' && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 'bold' }}>✅ الرقم متاح، يمكن استخدامه.</span>}
                    </span>
                    {serialStatus === 'used' && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>اضغط Enter لجلب بيانات المنتج</span>}
                  </div>
                  {currentOrder.barcode && (
                    <div style={{ marginTop: '8px', padding: '6px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px dashed var(--accent-color)', borderRadius: '6px', color: 'var(--accent-color)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       الباركود المولد: <strong style={{ letterSpacing: '2px', fontSize: '1.1rem' }}>{currentOrder.barcode}</strong>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">رقم أو رمز المشتري</label>
                  <ClearableSelect className="form-control" value={currentOrder.buyerMobile || ''} onChange={(e) => updateOrder('buyerMobile', e.target.value)}>
                    <option value="">اختر رقم أو رمز المشتري...</option>
                    {lookups.buyerCodes?.map((code, i) => {
                      const val = typeof code === 'object' ? code.name : code;
                      return <option key={i} value={val}>{val}</option>;
                    })}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الموديل (Product Number)</label>
                  <input type="text" className="form-control" value={currentOrder.serialNumber || ''} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, cursor: 'not-allowed', color: 'var(--text-muted)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم شركة المشتري</label>
                  <input type="text" className="form-control" value={currentOrder.buyerCompany || ''} onChange={(e) => updateOrder('buyerCompany', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم المنتج</label>
                  <ClearableSelect className="form-control" value={currentOrder.productName} onChange={(e) => updateOrder('productName', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.products?.map((p, i) => {
                      const val = typeof p === 'object' ? p.name : p;
                      return <option key={i} value={val}>{val}</option>;
                    })}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">السعر / العملة</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" className="form-control" placeholder="السعر" style={{ flex: 2 }} value={currentOrder.productPrice || ''} onChange={(e) => updateOrder('productPrice', e.target.value)} />
                    <ClearableSelect className="form-control" style={{ flex: 1 }} value={currentOrder.currency || ''} onChange={(e) => updateOrder('currency', e.target.value)}>
                      <option value="">العملة...</option>
                      {lookups.currencies?.map((c, i) => <option key={i} value={c}>{c}</option>)}
                    </ClearableSelect>
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">نوع البيع (Sale Type)</label>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <ClearableSelect className="form-control" style={{ flex: '0 0 200px' }} value={currentOrder.saleType || ''} onChange={(e) => {
                       const val = e.target.value;
                       updateOrder('saleType', val);
                       if (val === 'تجزئة') {
                          updateOrder('retailPercentage', '100');
                          updateOrder('wholesalePercentage', '0');
                       } else if (val === 'جملة') {
                          updateOrder('wholesalePercentage', '100');
                          updateOrder('retailPercentage', '0');
                       } else {
                          updateOrder('retailPercentage', '');
                          updateOrder('wholesalePercentage', '');
                       }
                    }}>
                      <option value="">اختر النوع...</option>
                      <option value="تجزئة">تجزئة</option>
                      <option value="جملة">جملة</option>
                      <option value="جملة وتجزئة">جملة وتجزئة</option>
                    </ClearableSelect>

                    {currentOrder.saleType === 'تجزئة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>نسبة التجزئة:</span>
                          <input type="text" className="form-control" value="100%" readOnly style={{ width: '80px', backgroundColor: 'var(--bg-color)', color: 'var(--accent-color)', fontWeight: 'bold', textAlign: 'center' }} />
                       </div>
                    )}
                    
                    {currentOrder.saleType === 'جملة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>نسبة الجملة:</span>
                          <input type="text" className="form-control" value="100%" readOnly style={{ width: '80px', backgroundColor: 'var(--bg-color)', color: 'var(--accent-color)', fontWeight: 'bold', textAlign: 'center' }} />
                       </div>
                    )}

                    {currentOrder.saleType === 'جملة وتجزئة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                             <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>الجملة %:</span>
                             <input type="number" min="0" max="100" className="form-control" placeholder="مثال: 60" 
                               style={{ width: '100px' }}
                               value={currentOrder.wholesalePercentage || ''} 
                               onChange={(e) => {
                                  let val = e.target.value;
                                  let num = parseInt(val) || 0;
                                  let other = parseInt(currentOrder.retailPercentage) || 0;
                                  if (num + other > 100) {
                                     toast.error('عذراً، مجموع النسبتين لا يمكن أن يتجاوز 100%');
                                     return;
                                  }
                                  updateOrder('wholesalePercentage', val);
                               }} 
                             />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                             <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>التجزئة %:</span>
                             <input type="number" min="0" max="100" className="form-control" placeholder="مثال: 40" 
                               style={{ width: '100px' }}
                               value={currentOrder.retailPercentage || ''}
                               onChange={(e) => {
                                  let val = e.target.value;
                                  let num = parseInt(val) || 0;
                                  let other = parseInt(currentOrder.wholesalePercentage) || 0;
                                  if (num + other > 100) {
                                     toast.error('عذراً، مجموع النسبتين لا يمكن أن يتجاوز 100%');
                                     return;
                                  }
                                  updateOrder('retailPercentage', val);
                               }} 
                             />
                          </div>
                       </div>
                    )}
                  </div>
                </div>

                {/* ═══ Product Images Upload ═══ */}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Camera size={18} color="var(--accent-color)" />
                    صور المنتج (Product Images)
                  </label>
                  
                  {/* Upload Buttons */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} id="galleryUpload" />
                    <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: 'none' }} id="cameraUpload" />
                    
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      style={{ flex: 1, borderColor: 'rgba(212, 175, 55, 0.3)', gap: '0.5rem' }}
                    >
                      <ImagePlus size={18} />
                      اختر من المعرض
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploadingImage}
                      style={{ flex: 1, borderColor: 'rgba(212, 175, 55, 0.3)', gap: '0.5rem' }}
                    >
                      <Camera size={18} />
                      التقط من الكاميرا
                    </button>
                  </div>

                  {uploadingImage && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--accent-color)', fontSize: '0.9rem' }}>
                      <div style={{ width: '28px', height: '28px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.5rem' }}></div>
                      جاري رفع الصور...
                    </div>
                  )}

                  {/* Image Preview Grid */}
                  {productImages.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '0.75rem',
                      padding: '1rem',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)'
                    }}>
                      {productImages.map((img, idx) => (
                        <div key={idx} style={{
                          position: 'relative',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          border: '1px solid rgba(212, 175, 55, 0.2)',
                          background: 'var(--surface-color)',
                          transition: 'all 0.3s ease',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                        }}>
                          <img
                            src={img.preview || img.url}
                            alt={img.name}
                            style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                          />
                          <div style={{
                            padding: '0.4rem 0.5rem',
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: 'var(--surface-highlight)'
                          }}>
                            {img.name}
                          </div>
                          <button
                            onClick={() => handleRemoveImage(idx)}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: 'rgba(239, 68, 68, 0.9)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {productImages.length === 0 && !uploadingImage && (
                    <div style={{
                      padding: '2rem',
                      textAlign: 'center',
                      border: '2px dashed var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)',
                      fontSize: '0.9rem',
                      background: 'rgba(0,0,0,0.1)'
                    }}>
                      <Camera size={32} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                      <br />
                      لم يتم إضافة صور بعد — اضغط أحد الأزرار أعلاه لرفع صور المنتج
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">ملاحظات الطلب (Order Remarks)</label>
                  <textarea className="form-control" rows="3" placeholder="أدخل أي ملاحظات إضافية حول الطلبية أو الألوان هنا..." value={currentOrder.remarks || ''} onChange={(e) => updateOrder('remarks', e.target.value)}></textarea>
                </div>
              </div>
            </div>
          </div>
        );

      case 'dates':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><Calendar size={22} /> المواعيد والكمية والمقاسات</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <CustomDateInput 
                  label="تاريخ طلب المشتري" 
                  value={currentOrder.requestDate} 
                  onChange={(val) => {
                    updateOrder('requestDate', val);
                    // If delivery date is now before request date, clear it or adjust it
                    if (currentOrder.deliveryDate && val && currentOrder.deliveryDate < val) {
                      updateOrder('deliveryDate', '');
                      toast('تم مسح تاريخ التسليم لأنه أصبح قبل تاريخ الطلب الجديد', { icon: 'ℹ️' });
                    }
                  }} 
                />
                <CustomDateInput 
                  label="تاريخ التسليم في المصنع" 
                  value={currentOrder.deliveryDate} 
                  onChange={(val) => updateOrder('deliveryDate', val)} 
                  min={currentOrder.requestDate}
                />
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">الكمية الإجمالية (Product Quantity)</label>
                  <input type="number" className="form-control" value={currentOrder.totalQuantity} onChange={(e) => updateOrder('totalQuantity', e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {hasManual ? 'المقاسات المضافة يدوياً (تجاهل النطاق)' : 'نطاق المقاسات (Size Range)'}
                    </label>
                    {targetSizes.length > 0 && (
                      <span style={{ 
                        backgroundColor: 'rgba(212, 175, 55, 0.15)', 
                        color: 'var(--accent-color)', 
                        padding: '2px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.8rem', 
                        fontWeight: 'bold',
                        border: '1px solid rgba(212, 175, 55, 0.3)'
                      }}>
                        تم اختيار {targetSizes.length} مقاساً
                      </span>
                    )}
                  </div>

                  {!hasManual ? (
                    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', opacity: 0.8 }}>من (From)</label>
                        <ClearableSelect className="form-control" value={currentOrder.sizeFrom || ''} onChange={(e) => {
                          const newVal = e.target.value;
                          if (newVal === 'MANUAL_TRIGGER') {
                             updateOrder('manualSizes', [...(currentOrder.manualSizes || []), '']);
                             return;
                          }
                          const oldVal = currentOrder.sizeFrom;
                          updateOrder('sizeFrom', newVal);
                          if (newVal && oldVal) {
                            const wasNumeric = !isNaN(parseFloat(oldVal)) && isFinite(oldVal);
                            const isNumeric = !isNaN(parseFloat(newVal)) && isFinite(newVal);
                            if (wasNumeric !== isNumeric) {
                              updateOrder('sizeTo', '');
                            }
                          }
                        }}>
                          <option value="">اختر...</option>
                          <option value="MANUAL_TRIGGER" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>+ ادخال يدوي جديد...</option>
                          {lookups.sizes?.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </ClearableSelect>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', opacity: 0.8 }}>إلى (To)</label>
                        <ClearableSelect className="form-control" value={currentOrder.sizeTo || ''} onChange={(e) => {
                          const newVal = e.target.value;
                          if (newVal === 'MANUAL_TRIGGER') {
                             updateOrder('manualSizes', [...(currentOrder.manualSizes || []), '']);
                             return;
                          }
                          updateOrder('sizeTo', newVal);
                        }}>
                          <option value="">اختر...</option>
                          <option value="MANUAL_TRIGGER" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>+ ادخال يدوي جديد...</option>
                          {(() => {
                            if (!currentOrder.sizeFrom) return lookups.sizes;
                            const isNumeric = !isNaN(parseFloat(currentOrder.sizeFrom)) && isFinite(currentOrder.sizeFrom);
                            const baseIdx = lookups.sizes?.indexOf(currentOrder.sizeFrom);
                            return lookups.sizes?.filter((s, idx) => {
                              const sIsNumeric = !isNaN(parseFloat(s)) && isFinite(s);
                              if (sIsNumeric !== isNumeric) return false;
                              if (isNumeric) return parseFloat(s) >= parseFloat(currentOrder.sizeFrom);
                              return idx >= baseIdx;
                            });
                          })()?.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </ClearableSelect>
                      </div>
                    </div>
                  ) : (
                    <div className="fade-in" style={{ 
                      padding: '1rem', 
                      background: 'rgba(212, 175, 55, 0.05)', 
                      borderRadius: '8px', 
                      border: '1px dashed var(--accent-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-color)' }}>
                        <CheckSquare size={18} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>وضع الإدخال اليدوي مفعل حالياً</span>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-outline"
                        style={{ padding: '4px 12px', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                        onClick={() => {
                          updateOrder('manualSizes', []);
                          toast('تم العودة لاختيار النطاق والمقاسات الجاهزة', { icon: '🔄' });
                        }}
                      >
                        إلغاء اليدوي والعودة للنطاق
                      </button>
                    </div>
                  )}
                </div>

                {/* ═══ Manual Sizes Section ═══ */}
                {hasManual && (
                  <div className="form-group fade-in" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Edit3 size={16} color="var(--accent-color)" />
                      إدخال المقاسات المخصصة
                    </label>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      {(currentOrder.manualSizes || []).map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ width: '100px', textAlign: 'center', border: '1px solid var(--accent-color)' }}
                            value={s}
                            autoFocus={idx === (currentOrder.manualSizes?.length - 1)}
                            placeholder="المقاس..."
                            onChange={(e) => {
                              const newManual = [...(currentOrder.manualSizes || [])];
                              newManual[idx] = e.target.value;
                              updateOrder('manualSizes', newManual);
                            }}
                          />
                          <button 
                            type="button" 
                            onClick={() => {
                              const newManual = (currentOrder.manualSizes || []).filter((_, i) => i !== idx);
                              updateOrder('manualSizes', newManual);
                            }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      
                      <button 
                        type="button"
                        className="btn btn-outline"
                        style={{ 
                          padding: '0.4rem 1rem', 
                          fontSize: '0.85rem', 
                          borderColor: 'rgba(212, 175, 55, 0.4)',
                          borderStyle: 'dashed',
                          color: 'var(--accent-color)'
                        }}
                        onClick={() => {
                          updateOrder('manualSizes', [...(currentOrder.manualSizes || []), '']);
                        }}
                      >
                        + إضافة مقاس آخر
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'fabrics':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><Scissors size={22} /> تفاصيل الأقمشة والمواد</h3>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">نوع القماش (Product Fabrics)</label>
                  <ClearableSelect className="form-control" value={currentOrder.productFabric || ''} onChange={(e) => updateOrder('productFabric', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.fabrics?.map((f, i) => <option key={i} value={f}>{f}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">العلامة التجارية (Trade Mark)</label>
                  <ClearableSelect className="form-control" value={currentOrder.tradeMark || ''} onChange={(e) => updateOrder('tradeMark', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.tradeMarks?.map((t, i) => {
                      const tmName = typeof t === 'object' ? t.name : t;
                      return <option key={i} value={tmName}>{tmName}</option>;
                    })}
                  </ClearableSelect>
                </div>
                {/* Show trademark image */}
                {currentOrder.tradeMark && (() => {
                  const tmObj = lookups.tradeMarks?.find(t => (typeof t === 'object' ? t.name : t) === currentOrder.tradeMark);
                  const tmImage = tmObj && typeof tmObj === 'object' ? tmObj.imageUrl : null;
                  if (tmImage) {
                    return (
                      <div style={{ 
                        width: '120px', height: '120px', borderRadius: 'var(--radius-md)', 
                        overflow: 'hidden', border: '2px solid rgba(212, 175, 55, 0.3)', 
                        background: '#fff', flexShrink: 0, marginTop: '1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}>
                        <img src={tmImage} alt={currentOrder.tradeMark} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {[1, 2, 3].map((num, i) => {
                  const currentTotal = (currentOrder.materials || []).reduce((sum, m) => sum + (parseFloat(m.percentage) || 0), 0);
                  const isFilled = currentOrder.materials?.[i]?.name || currentOrder.materials?.[i]?.percentage;
                  const isLocked = currentTotal >= 100 && !isFilled;

                  return (
                    <div className="form-group" key={i}>
                      <label className="form-label">المادة {num}</label>
                      <div 
                        style={{ display: 'flex', gap: '0.5rem' }}
                        onClickCapture={(e) => {
                          if (isLocked) {
                            e.preventDefault();
                            e.stopPropagation();
                            toast.error('لا يوجد نسبة متبقية! مجموع المواد السابقة وصل إلى 100%');
                          }
                        }}
                      >
                        <ClearableSelect 
                          className="form-control" 
                          value={currentOrder.materials?.[i]?.name || ''} 
                          onChange={(e) => {
                             if (!isLocked) handleMaterialChange(i, 'name', e.target.value);
                          }}
                          disabled={isLocked}
                          style={{ opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'auto' }}
                        >
                          <option value="">اختر المادة...</option>
                          {lookups.materials?.map((m, j) => <option key={j} value={m}>{m}</option>)}
                        </ClearableSelect>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          className="form-control no-spinner" 
                          placeholder="%" 
                          style={{ 
                            width: '85px', 
                            fontWeight: 'bold', 
                            fontSize: '1.2rem', 
                            borderColor: 'var(--accent-color)',
                            opacity: isLocked ? 0.5 : 1,
                            cursor: isLocked ? 'not-allowed' : 'auto',
                            backgroundColor: isLocked ? 'var(--bg-color)' : ''
                          }} 
                          value={currentOrder.materials?.[i]?.percentage || ''} 
                          readOnly={isLocked}
                          onChange={(e) => {
                            if (isLocked) return;
                            const val = e.target.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, '');
                            handleMaterialChange(i, 'percentage', val);
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'factory':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><Box size={22} /> المصنع والتعبئة والتغليف</h3>
              </div>
              <div className="form-group">
                <label className="form-label">المصنع</label>
                <ClearableSelect className="form-control" value={currentOrder.factoryId || ''} onChange={(e) => updateOrder('factoryId', e.target.value)}>
                  <option value="">اختر المصنع...</option>
                  {lookups.factories?.map((f, i) => <option key={i} value={f.name || f}>{f.name || f}</option>)}
                </ClearableSelect>
              </div>
              {currentOrder.factoryId && (() => {
                const selectedFactoryObj = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === currentOrder.factoryId || f === currentOrder.factoryId)) : null;
                if (selectedFactoryObj && (selectedFactoryObj.mobile || selectedFactoryObj.code)) {
                  return (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      {selectedFactoryObj.code && (
                        <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>كود المصنع</label>
                          <input type="text" className="form-control" value={selectedFactoryObj.code} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed', color: 'var(--accent-color)', fontWeight: 'bold' }} />
                        </div>
                      )}
                      {selectedFactoryObj.mobile && (
                        <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>جوال المصنع</label>
                          <input type="text" className="form-control" value={selectedFactoryObj.mobile} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                        </div>
                      )}
                      {selectedFactoryObj.address && (
                        <div className="form-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>عنوان المصنع</label>
                          <input type="text" className="form-control" value={selectedFactoryObj.address} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">تعبئة الكرتون</label>
                  <ClearableSelect className="form-control" value={currentOrder.cartonPackage || ''} onChange={(e) => {
                    const val = e.target.value;
                    const pkgQty = parseInt(val.replace(/[^0-9]/g, '')) || 0;
                    const totQty = parseInt(currentOrder.totalQuantity) || 0;
                    if (val && pkgQty > totQty) {
                      toast.error(`عفواً، لا يمكن أن تكون تعبئة الكرتون (${pkgQty}) أكبر من الكمية الإجمالية (${totQty}).`);
                      return;
                    }
                    updateOrder('cartonPackage', val);
                  }}>
                    <option value="">اختر...</option>
                    {lookups.cartonPackages?.map((cp, i) => <option key={i} value={cp}>{cp}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">كمية الكرتون (Pcs)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={currentOrder.cartonQty || ''} 
                    readOnly 
                    style={{ backgroundColor: 'var(--surface-highlight)', color: 'var(--accent-color)', fontWeight: 'bold' }} 
                    placeholder="تُحسب تلقائياً..." 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">حجم الكرتون</label>
                  <ClearableSelect className="form-control" value={currentOrder.cartonSize || ''} onChange={(e) => updateOrder('cartonSize', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.cartonSizes?.map((cs, i) => <option key={i} value={cs}>{cs}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">أحجام الأكياس</label>
                  <ClearableSelect className="form-control" value={currentOrder.plasticBagSize || ''} onChange={(e) => updateOrder('plasticBagSize', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.plasticBagSizes?.map((pb, i) => <option key={i} value={pb}>{pb}</option>)}
                  </ClearableSelect>
                </div>
              </div>
            </div>
          </div>
        );

      case 'colors': {
        const sizesReady = (currentOrder.sizeFrom && currentOrder.sizeTo) || (currentOrder.manualSizes && currentOrder.manualSizes.some(s => s.trim() !== ''));
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header" style={{ justifyContent: 'space-between' }}>
                <h3><Palette size={22} /> توزيع الألوان والمقاسات</h3>
                {selectedColorsArr.length > 0 && sizesReady && (
                  <button className="btn btn-primary" onClick={divideQuantityEqually} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                    <LayoutGrid size={16} /> تقسيم بالتساوي
                  </button>
                )}
              </div>

              {/* ─── Custom Multi-Select Color Picker ─── */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '0.5rem' }}>
                    <Palette size={16} style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }} />
                    اختيار الألوان:
                  </label>
                  <div ref={colorPickerRef} style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '400px' }}>
                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => setShowColorPicker(prev => !prev)}
                      className="form-control"
                      style={{
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        textAlign: 'right', width: '100%', padding: '0.5rem 0.75rem',
                        border: showColorPicker ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)',
                        color: selectedColorsArr.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <span>{selectedColorsArr.length > 0 ? `${selectedColorsArr.length} لون محدد` : '— اختر الألوان —'}</span>
                      <ChevronLeft size={16} style={{ transform: showColorPicker ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                    </button>
                    {/* Dropdown panel */}
                    {showColorPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                        marginTop: '4px', padding: '0.5rem',
                        backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        maxHeight: '260px', overflowY: 'auto'
                      }}>
                        {lookups.colors?.map((colorObj, i) => {
                          const colorName = colorObj.name || colorObj;
                          const colorHex = colorObj.hex || '#cccccc';
                          const isChecked = selectedColorsArr.includes(colorName);
                          return (
                            <div
                              key={i}
                              onClick={() => toggleColor(colorName)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: '0.5rem 0.6rem', cursor: 'pointer',
                                borderRadius: '6px', transition: 'background-color 0.15s',
                                backgroundColor: isChecked ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
                                marginBottom: '2px'
                              }}
                              onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                              onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <div style={{
                                width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                                border: isChecked ? '2px solid var(--accent-color)' : '2px solid var(--border-color)',
                                backgroundColor: isChecked ? 'var(--accent-color)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s'
                              }}>
                                {isChecked && <span style={{ color: '#000', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{
                                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                backgroundColor: colorHex, border: '2px solid rgba(128,128,128,0.3)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                              }}></span>
                              <span style={{ fontWeight: isChecked ? 'bold' : 'normal', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                {colorName}
                              </span>
                            </div>
                          );
                        })}
                        {(!lookups.colors || lookups.colors.length === 0) && (
                          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>لا توجد ألوان محفوظة</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Selected color badges */}
                {selectedColorsArr.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    {selectedColorsArr.map((colorName, i) => {
                      const colorObj = lookups.colors?.find(c => (c.name || c) === colorName);
                      const colorHex = colorObj?.hex || '#cccccc';
                      return (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.3rem 0.7rem', borderRadius: '50px',
                          backgroundColor: 'rgba(212, 175, 55, 0.1)',
                          border: '1px solid var(--accent-color)',
                          fontSize: '0.85rem', fontWeight: 'bold',
                          color: 'var(--text-main)',
                          animation: 'fadeIn 0.2s ease'
                        }}>
                          <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: colorHex, border: '1px solid rgba(0,0,0,0.2)', flexShrink: 0 }}></span>
                          {colorName}
                          <button type="button" onClick={() => toggleColor(colorName)} style={{
                            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                            padding: '0', display: 'flex', alignItems: 'center', marginRight: '-0.2rem'
                          }} title="إزالة">
                            <X size={13} strokeWidth={3} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── Distribution Table ─── */}
              {selectedColorsArr.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                  <Palette size={40} style={{ opacity: 0.25, display: 'block', margin: '0 auto 0.75rem' }} />
                  اختر لوناً واحداً على الأقل من القائمة أعلاه لعرض جدول التوزيع.
                </div>
              ) : !sizesReady ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                  <Ruler size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 0.75rem' }} />
                  يرجى تحديد نطاق المقاسات (المقاس من — المقاس إلى) من تبويب <strong>"المواعيد والكمية"</strong> لعرض جدول التوزيع.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(400, selectedColorsArr.length * 100 + 200) + 'px' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)', minWidth: '100px' }}>
                          المقاس
                        </th>
                        {selectedColorsArr.map((colorName, i) => {
                          const colorObj = lookups.colors?.find(c => (c.name || c) === colorName);
                          const colorHex = colorObj?.hex || '#cccccc';
                          return (
                            <th key={i} style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                                <span style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: colorHex, border: '1px solid rgba(0,0,0,0.2)', flexShrink: 0 }}></span>
                                <span>{colorName}</span>
                              </div>
                            </th>
                          );
                        })}
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                          إجمالي المقاس
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetSizes.map((size, sIdx) => (
                        <tr key={`size-${sIdx}`} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: sIdx % 2 === 0 ? 'transparent' : 'rgba(212, 175, 55, 0.03)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '600', color: 'var(--text-main)', backgroundColor: 'rgba(212, 175, 55, 0.05)' }}>
                            {size}
                          </td>
                          {selectedColorsArr.map((colorName, cIdx) => (
                            <td key={cIdx} style={{ padding: '0.5rem' }}>
                              <input
                                type="number"
                                className="form-control"
                                style={{ width: '75px', margin: 'auto', display: 'block', textAlign: 'center' }}
                                placeholder="0"
                                value={currentOrder.colorDistribution?.[colorName]?.[size] || ''}
                                onChange={(e) => handleColorChange(colorName, size, e.target.value)}
                              />
                            </td>
                          ))}
                          <td style={{ padding: '0.5rem', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '1.05rem', backgroundColor: 'rgba(212, 175, 55, 0.05)' }}>
                            {selectedColorsArr.reduce((sum, cn) => sum + (parseInt(currentOrder.colorDistribution?.[cn]?.[size]) || 0), 0)}
                          </td>
                        </tr>
                      ))}
                      {/* ─── Totals Row (per color) ─── */}
                      <tr style={{ borderTop: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>إجمالي اللون</td>
                        {selectedColorsArr.map((colorName, cIdx) => (
                          <td key={cIdx} style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '1.05rem' }}>
                            {targetSizes.reduce((sum, size) => sum + (parseInt(currentOrder.colorDistribution?.[colorName]?.[size]) || 0), 0)}
                          </td>
                        ))}
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '900', color: 'var(--primary-color)', fontSize: '1.15rem', backgroundColor: 'rgba(212, 175, 55, 0.1)' }}>
                          {selectedColorsArr.reduce((total, cn) => total + targetSizes.reduce((sum, s) => sum + (parseInt(currentOrder.colorDistribution?.[cn]?.[s]) || 0), 0), 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'packaging': {
        const selectedConditions = lookups.packagingConditionsList?.filter(cond => !!currentOrder.packagingConditions?.[cond]) || [];
        
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><CheckSquare size={22} /> شروط وتفاصيل التعبئة الخاصة</h3>
              </div>
              
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '0.5rem' }}>
                    <CheckSquare size={16} style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }} />
                    اختيار الشروط:
                  </label>
                  <div ref={packagingPickerRef} style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '400px' }}>
                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => setShowPackagingPicker(prev => !prev)}
                      className="form-control"
                      style={{
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        textAlign: 'right', width: '100%', padding: '0.5rem 0.75rem',
                        border: showPackagingPicker ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)',
                        color: selectedConditions.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <span>{selectedConditions.length > 0 ? `${selectedConditions.length} شرط محدد` : '— اختر الشروط —'}</span>
                      <ChevronLeft size={16} style={{ transform: showPackagingPicker ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                    </button>
                    {/* Dropdown panel */}
                    {showPackagingPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                        marginTop: '4px', padding: '0.5rem',
                        backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        maxHeight: '260px', overflowY: 'auto'
                      }}>
                        {lookups.packagingConditionsList?.map((cond, i) => {
                          const isChecked = !!currentOrder.packagingConditions?.[cond];
                          return (
                            <div
                              key={i}
                              onClick={() => handlePackagingConditionChange(cond, !isChecked)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: '0.5rem 0.6rem', cursor: 'pointer',
                                borderRadius: '6px', transition: 'background-color 0.15s',
                                backgroundColor: isChecked ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
                                marginBottom: '2px'
                              }}
                              onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                              onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <div style={{
                                width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                                border: isChecked ? '2px solid var(--accent-color)' : '2px solid var(--border-color)',
                                backgroundColor: isChecked ? 'var(--accent-color)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s'
                              }}>
                                {isChecked && <span style={{ color: '#000', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontWeight: isChecked ? 'bold' : 'normal', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                {cond}
                              </span>
                            </div>
                          );
                        })}
                        {(!lookups.packagingConditionsList || lookups.packagingConditionsList.length === 0) && (
                          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>لا توجد شروط تعبئة محفوظة</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected condition badges */}
                {selectedConditions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    {selectedConditions.map((cond, i) => (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.3rem 0.7rem', borderRadius: '50px',
                        backgroundColor: 'rgba(212, 175, 55, 0.1)',
                        border: '1px solid var(--accent-color)',
                        fontSize: '0.85rem', fontWeight: 'bold',
                        color: 'var(--text-main)',
                        animation: 'fadeIn 0.2s ease'
                      }}>
                        {cond}
                        <button type="button" onClick={() => handlePackagingConditionChange(cond, false)} style={{
                          background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                          padding: '0', display: 'flex', alignItems: 'center', marginRight: '-0.2rem'
                        }} title="إزالة">
                          <X size={13} strokeWidth={3} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {selectedConditions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                  <CheckSquare size={40} style={{ opacity: 0.25, display: 'block', margin: '0 auto 0.75rem' }} />
                  اختر شرطاً واحداً على الأقل من القائمة أعلاه.
                </div>
              )}
              
            </div>
          </div>
        );
      }

      case 'measurements': {
        if (!currentOrder.productName) {
           return (
             <div className="tab-panel fade-in" key={tabKey}>
               <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                 <Ruler size={48} color="var(--accent-color)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                 <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>لم يتم تحديد منتج</h3>
                 <p style={{ margin: 0 }}>الرجاء اختيار "اسم المنتج" من قسم البيانات الأساسية أولاً لعرض المقاسات التفصيلية الخاصة به.</p>
               </div>
             </div>
           );
        }

        const productObj = lookups.products?.find(p => (typeof p === 'object' ? p.name : p) === currentOrder.productName);
        const partsList = (productObj && productObj.parts && productObj.parts.length > 0) 
            ? productObj.parts : [currentOrder.productName];
        
        return (
          <div className="tab-panel" key={tabKey}>
             {partsList.map((partName, pIdx) => {
               const partMeasurements = (lookups.measurements || []).filter(m => {
                  if (typeof m === 'object' && m.part) {
                     // Strictly match assigned parts
                     return m.part.split('،').map(p => p.trim()).includes(partName.trim()); 
                  }
                  // Hide all legacy unassigned or string measurements
                  return false;
               }).map(m => typeof m === 'object' ? m.name : m);

               return (
                <div className="card" key={pIdx} style={{ marginBottom: '2rem' }}>
                  <div className="tab-section-header">
                    <h3><Ruler size={22} /> مقاسات المنتج التفصيلية ({partName})</h3>
                  </div>
                  <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--surface-highlight)', width: '200px' }}>نوع القياس (Size Name)</th>
                          {targetSizes.map((s, i) => (
                            <th key={i} style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--surface-highlight)' }}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {partMeasurements.length === 0 && (
                          <tr><td colSpan={targetSizes.length + 1} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>لا توجد مقاسات مسجلة تدعم ({partName}). قم بإضافتها عبر إعدادات المقاسات.</td></tr>
                        )}
                        {partMeasurements.map((mName, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: '500', backgroundColor: 'var(--bg-color)' }}>{mName}</td>
                            {targetSizes.map((size, j) => (
                              <td key={j} style={{ padding: '0.5rem' }}>
                                <input 
                                   type="text" 
                                   inputMode="decimal"
                                   className={`form-control measurement-input-${pIdx}`} 
                                   value={currentOrder.groupedMeasurements?.[partName]?.[mName]?.[size] || currentOrder.measurements?.[mName]?.[size] || ''} 
                                   onChange={(e) => {
                                      let val = e.target.value.replace(/[^0-9.]/g, '');
                                      const parts = val.split('.');
                                      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                      handleMeasurementChange(partName, mName, size, val);
                                   }}
                                   onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                         e.preventDefault();
                                         const inputs = Array.from(document.querySelectorAll(`.measurement-input-${pIdx}`));
                                         const currentIndex = inputs.indexOf(e.target);
                                         if (currentIndex > -1 && currentIndex < inputs.length - 1) {
                                            inputs[currentIndex + 1].focus();
                                         }
                                      }
                                   }}
                                   style={{ width: '100%', margin: 'auto', display: 'block', textAlign: 'center' }} 
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
               );
             })}
          </div>
        );
      }

      default:
        return null;
    }
  };


  return (
    <div className="wizard-tabs-container">

      {/* Top Actions Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }} className="fade-in">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>التاريخ (Date)</label>
            <input type="text" className="form-control" value={new Date().toLocaleDateString('en-GB')} readOnly style={{ width: '120px', backgroundColor: 'var(--surface-highlight)', opacity: 0.8 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>رقم الموديل للاسترداد (Item No)</label>
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input 
                type="text" 
                id="fetchSerialInput" 
                className="form-control" 
                placeholder="أدخل الرقم... (F9)" 
                style={{ width: '150px' }} 
                onKeyDown={handleF9Press}
                autoComplete="off"
              />
              <button className="btn btn-primary" onClick={handleFetch} style={{ padding: '0.5rem 1rem' }}>جلب (Fetch)</button>
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm('⚠️ هل أنت متأكد من تفريغ جميع البيانات وبدء طلبية جديدة؟\n\nسيتم مسح كل الحقول المدخلة وإعادة تعيين النموذج بالكامل.')) {
                    handleClear();
                  }
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  borderRadius: 'var(--radius-sm, 8px)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <RefreshCw size={15} /> تفريغ وبدء جديد
              </button>
              
              {showSerialsList && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  width: '200px', maxHeight: '250px', overflowY: 'auto',
                  backgroundColor: 'var(--surface-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 1000
                }}>
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>اختر موديلاً محفوظاً:</span>
                      <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                         <X size={16} />
                      </button>
                  </div>
                  {/* Search Field */}
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                    <input
                      ref={serialSearchRef}
                      type="text"
                      placeholder="🔍 ابحث برقم الموديل..."
                      value={serialSearchQuery}
                      onChange={(e) => setSerialSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowSerialsList(false);
                          setSerialSearchQuery('');
                        }
                        // Enter to select first filtered result
                        if (e.key === 'Enter') {
                          const filtered = availableSerials.filter(s => s.toString().includes(serialSearchQuery));
                          if (filtered.length > 0) {
                            const input = document.getElementById('fetchSerialInput');
                            if (input) input.value = filtered[0];
                            setShowSerialsList(false);
                            setSerialSearchQuery('');
                            handleFetch(filtered[0]);
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.9rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm, 6px)',
                        backgroundColor: 'var(--surface-color)',
                        color: 'var(--text-color)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        direction: 'rtl',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      autoComplete="off"
                    />
                  </div>
                  {fetchingSerials ? (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>جاري التحميل...</div>
                  ) : (
                     (() => {
                       const filteredSerials = serialSearchQuery.trim()
                         ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
                         : availableSerials;
                       return filteredSerials.length === 0 ? (
                         <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                           {availableSerials.length === 0 ? 'لا توجد موديلات محفوظة' : 'لا توجد نتائج مطابقة للبحث'}
                         </div>
                       ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {filteredSerials.map(serial => {
                                // Highlight matching part
                                const query = serialSearchQuery.trim();
                                const serialStr = serial.toString();
                                const matchIdx = query ? serialStr.indexOf(query) : -1;
                                return (
                                <li 
                                    key={serial} 
                                    onClick={() => {
                                        const input = document.getElementById('fetchSerialInput');
                                        if (input) input.value = serial;
                                        setShowSerialsList(false);
                                        setSerialSearchQuery('');
                                        handleFetch(serial);
                                    }}
                                    style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', fontSize: '0.9rem', color: 'var(--text-color)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-highlight)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    {matchIdx !== -1 ? (
                                      <strong>
                                        {serialStr.substring(0, matchIdx)}
                                        <span style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>{serialStr.substring(matchIdx, matchIdx + query.length)}</span>
                                        {serialStr.substring(matchIdx + query.length)}
                                      </strong>
                                    ) : (
                                      <strong>{serialStr}</strong>
                                    )}
                                </li>
                                );
                            })}
                        </ul>
                       );
                     })()
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ View Mode Toggle ═══ */}
        <button
          onClick={toggleViewMode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.6rem 1.2rem',
            background: viewMode === 'scroll'
              ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.08))'
              : 'rgba(255, 255, 255, 0.04)',
            border: viewMode === 'scroll'
              ? '1px solid rgba(212, 175, 55, 0.4)'
              : '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            color: viewMode === 'scroll' ? 'var(--accent-color)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'Tajawal, sans-serif',
            fontSize: '0.85rem',
            fontWeight: '600',
            transition: 'all 0.3s ease',
            boxShadow: viewMode === 'scroll' ? '0 2px 12px rgba(212, 175, 55, 0.15)' : 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.5)';
            e.currentTarget.style.color = 'var(--accent-color)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = viewMode === 'scroll' ? 'rgba(212, 175, 55, 0.4)' : 'var(--border-color)';
            e.currentTarget.style.color = viewMode === 'scroll' ? 'var(--accent-color)' : 'var(--text-muted)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          title={viewMode === 'tabs' ? 'التبديل إلى العرض الكامل (صفحة واحدة)' : 'التبديل إلى عرض التبويبات'}
        >
          {viewMode === 'tabs' ? (
            <><Layers size={17} /> صفحة كاملة</>
          ) : (
            <><PanelTop size={17} /> تبويبات</>
          )}
        </button>
      </div>

      {viewMode === 'tabs' ? (
        <>
          {/* ═══ Tab Navigation Bar ═══ */}
          <div style={{ position: 'relative' }}>
            {/* Arrow on LEFT side — shows when there are hidden tabs to the left (e.g. tab 7 in RTL) */}
            {canScrollLeft && (
              <button
                onClick={() => scrollTabNav('left')}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '44px',
                  zIndex: 25,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(to right, rgba(22, 27, 34, 0.98) 60%, transparent)',
                  color: 'var(--accent-color)',
                  borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.width = '52px'}
                onMouseLeave={e => e.currentTarget.style.width = '44px'}
                title="عرض المزيد"
              >
                <ChevronLeft size={20} />
              </button>
            )}

            <nav className="tab-nav" ref={tabNavRef} style={{ position: 'relative', zIndex: 1 }}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => switchTab(tab.id)}
                  >
                    <span className="tab-num">{tab.num}</span>
                    <span className="tab-icon"><Icon size={16} /></span>
                    <span className="tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Arrow on RIGHT side — shows when there are hidden tabs to the right (e.g. tab 1 scrolled out) */}
            {canScrollRight && (
              <button
                onClick={() => scrollTabNav('right')}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '44px',
                  zIndex: 25,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(to left, rgba(22, 27, 34, 0.98) 60%, transparent)',
                  color: 'var(--accent-color)',
                  borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.width = '52px'}
                onMouseLeave={e => e.currentTarget.style.width = '44px'}
                title="عرض المزيد"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {/* Progress Dots */}
          <div className="tab-progress">
            {TABS.map((tab, i) => (
              <div
                key={tab.id}
                className={`tab-progress-dot ${activeTab === tab.id ? 'active' : i < currentTabIdx ? 'completed' : ''}`}
              />
            ))}
          </div>

          {/* ═══ Tab Content ═══ */}
          <div className="tab-content-wrapper">
            {renderTabContent()}

            {/* Navigation Arrows */}
            <div className="tab-nav-arrows">
              <button className="tab-nav-arrow" onClick={goPrev} disabled={currentTabIdx === 0}>
                <ChevronRight size={18} />
                {currentTabIdx > 0 ? TABS[currentTabIdx - 1].label : 'السابق'}
              </button>
              <button className="tab-nav-arrow" onClick={goNext} disabled={currentTabIdx === TABS.length - 1}>
                {currentTabIdx < TABS.length - 1 ? TABS[currentTabIdx + 1].label : 'التالي'}
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ═══ SCROLL VIEW MODE ═══ */
        <div className="tab-content-wrapper fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Sticky section jump bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            padding: '0.75rem 1rem',
            background: 'rgba(22, 27, 34, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(212, 175, 55, 0.15)',
            borderRadius: 'var(--radius-lg)',
            position: 'sticky',
            top: 0,
            zIndex: 20,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          }}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    const el = document.getElementById(`scroll-section-${tab.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    border: '1px solid rgba(212, 175, 55, 0.15)',
                    background: 'rgba(212, 175, 55, 0.06)',
                    color: 'var(--text-muted)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'Tajawal, sans-serif',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(212, 175, 55, 0.15)';
                    e.currentTarget.style.color = 'var(--accent-color)';
                    e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(212, 175, 55, 0.06)';
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.15)';
                  }}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* All sections rendered */}
          {TABS.map((tab) => (
            <div key={tab.id} id={`scroll-section-${tab.id}`} style={{ scrollMarginTop: '5rem' }}>
              {renderTabContent(tab.id)}
            </div>
          ))}
        </div>
      )}

      {/* ═══ Edit Mode Banner ═══ */}
      {isEditMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '0.75rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.05))',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '0.5rem',
          animation: 'tabSlideIn 0.3s ease'
        }}>
          <Edit3 size={18} color="var(--accent-color)" />
          <span style={{ color: 'var(--accent-color)', fontWeight: '600', fontSize: '0.95rem' }}>
            وضع التعديل — تعدّل على الطلبية رقم: <strong style={{ fontSize: '1.1rem' }}>#{originalSerial}</strong>
          </span>
          <button
            className="btn btn-outline"
            onClick={handleClear}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(212, 175, 55, 0.3)' }}
          >
            <X size={14} /> إلغاء وضع التعديل وتفريغ الحقول
          </button>
        </div>
      )}

      {/* ═══ Bottom Actions Bar ═══ */}
      <div className="wizard-bottom-bar">
        <button
          className="btn"
          style={{
            flex: 1, maxWidth: '200px', fontSize: '0.95rem', padding: '0.9rem',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none', color: '#fff', fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.2s'
          }}
          onClick={() => {
            if (window.confirm('⚠️ هل أنت متأكد من تفريغ جميع البيانات وبدء طلبية جديدة؟\n\nسيتم مسح كل الحقول المدخلة وإعادة تعيين النموذج بالكامل.')) {
              handleClear();
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <RefreshCw size={18} /> تفريغ وبدء جديد
        </button>

        {isEditMode ? (
          <>
            <button
              className="btn btn-outline"
              style={{ flex: 1, maxWidth: '180px', fontSize: '0.95rem', padding: '0.9rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
              onClick={handleDeleteOrder}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Trash2 size={18} /> حذف الطلبية
            </button>
            <button
              className="btn btn-accent"
              style={{ flex: 2, maxWidth: '300px', fontSize: '1.1rem', padding: '0.9rem' }}
              onClick={handleUpdate}
            >
              <Edit3 size={20} /> تحديث الطلبية #{originalSerial}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, maxWidth: '250px', fontSize: '1rem', padding: '0.9rem' }}
              onClick={handleSaveAsCopy}
            >
              <Copy size={18} /> حفظ كنسخة جديدة
            </button>
          </>
        ) : (
          <button className="btn btn-accent" style={{ flex: 2, maxWidth: '400px', fontSize: '1.2rem', padding: '1rem' }} onClick={handleSaveNew}>
            <Save size={24} /> اعتماد وحفظ الطلب
          </button>
        )}
      </div>

    </div>
  );
};

export default DataEntryWizard;
