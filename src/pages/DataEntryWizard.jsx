import React, { useState, useEffect, useRef } from 'react';
import { useAppData, defaultOrderState } from '../context/AppDataContext';
import { Save, RefreshCw, Hash, Calendar, Box, Scissors, Palette, LayoutGrid, ChevronRight, ChevronLeft, MessageSquare, CheckSquare, Ruler, Camera, X, ImagePlus, Edit3, Copy } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

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

const DataEntryWizard = () => {
  const { lookups, currentOrder, updateOrder, setCurrentOrder } = useAppData();
  const [activeTab, setActiveTab] = useState('buyer');
  const [selectedColorsArr, setSelectedColorsArr] = useState([]);
  const [serialStatus, setSerialStatus] = useState(null);
  const [tabKey, setTabKey] = useState(0);
  const [productImages, setProductImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalSerial, setOriginalSerial] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (!currentOrder.serialNumber) {
       const fetchLastSerial = async () => {
         try {
           const { data, error } = await supabase
             .from('orders')
             .select('serial_number')
             .order('created_at', { ascending: false })
             .limit(1);
           
           if (data && data.length > 0) {
             const lastSerialStr = data[0].serial_number;
             const match = lastSerialStr.match(/\d+/);
             if (match) {
               const nextNum = parseInt(match[0]) + 1;
               updateOrder('serialNumber', nextNum.toString());
             } else {
               updateOrder('serialNumber', '1000');
             }
             setSerialStatus('available');
           } else {
             updateOrder('serialNumber', '1000');
             setSerialStatus('available');
           }
         } catch (err) {
           console.error('Error fetching latest serial', err);
         }
       };
       fetchLastSerial();
    }
  }, []); // eslint-disable-line

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setTabKey(prev => prev + 1);
  };

  // ─── Image Upload Handlers ───
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const modelNum = currentOrder.serialNumber?.trim();
    if (!modelNum) {
      toast.error('الرجاء إدخال رقم الموديل أولاً قبل رفع الصور');
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading('جاري رفع الصور...');

    try {
      const newImages = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop();
        const currentCount = productImages.length + newImages.length;
        const fileName = currentCount === 0 ? `${modelNum}.${ext}` : `${modelNum}_${currentCount}.${ext}`;
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
      if (prev.includes(colorName)) {
        const dist = { ...(currentOrder.colorDistribution || {}) };
        delete dist[colorName];
        updateOrder('colorDistribution', dist);
        return prev.filter(c => c !== colorName);
      } else {
        return [...prev, colorName];
      }
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
    if (isNaN(parseInt(currentOrder.totalQuantity))) {
      toast.error('الكمية الإجمالية يجب أن تكون رقماً.');
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

  // UPDATE existing order (same serial)
  const handleUpdate = async () => {
    if (!validateOrder()) return;
    const toastId = toast.loading('جاري تحديث الطلبية...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ order_data: currentOrder })
        .eq('serial_number', originalSerial);
      if (error) {
        console.error(error);
        toast.error('حدث خطأ أثناء التحديث!', { id: toastId });
      } else {
        toast.success(`تم تحديث الطلبية (${originalSerial}) بنجاح! ✏️`, { id: toastId });
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

  const handleFetch = async () => {
    const serial = document.getElementById('fetchSerialInput')?.value;
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
        setSerialStatus('used');
        setIsEditMode(true);
        setOriginalSerial(serial);
        toast.success(`تم استرداد الطلبية: ${serial} — يمكنك التعديل الآن ✏️`, { id: toastId });
      }
    } catch (err) {
      toast.error('خطأ في الاتصال بالانترنت أو قاعدة البيانات!', { id: toastId });
    }
  };

  const handleClear = () => {
    setCurrentOrder({ ...defaultOrderState, serialNumber: currentOrder.serialNumber });
    setProductImages([]);
    setIsEditMode(false);
    setOriginalSerial('');
    toast('تم تصفير وإلغاء جميع الحقول بنجاح', { icon: '🧹' });
  };

  const handleColorChange = (color, size, qty) => {
    const dist = { ...(currentOrder.colorDistribution || {}) };
    if (!dist[color]) dist[color] = {};
    dist[color][size] = qty;
    updateOrder('colorDistribution', dist);
  };

  const handleMaterialChange = (index, field, value) => {
    const newMaterials = [...(currentOrder.materials || [])];
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
    if (!grouped[part]) grouped[part] = {};
    if (!grouped[part][mName]) grouped[part][mName] = {};
    grouped[part][mName][size] = value;
    updateOrder('groupedMeasurements', grouped);
  };
  
  const handlePackagingConditionChange = (cond, isChecked) => {
    const pc = { ...(currentOrder.packagingConditions || {}) };
    pc[cond] = isChecked;
    updateOrder('packagingConditions', pc);
  };

  const divideQuantityEqually = () => {
    const totalQty = parseInt(currentOrder.totalQuantity);
    if (!totalQty || isNaN(totalQty)) {
      toast.error('الرجاء إدخال الكمية الإجمالية أولاً');
      return;
    }
    if (selectedColorsArr.length === 0) {
      toast.error('الرجاء تحديد لون واحد على الأقل لتوزيع الكمية');
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
      toast.error('لا توجد مقاسات محددة للتوزيع');
      return;
    }
    const cellsCount = selectedColorsArr.length * sizes.length;
    const qtyPerCell = Math.floor(totalQty / cellsCount);
    const remainder = totalQty % cellsCount;
    const newDist = { ...(currentOrder.colorDistribution || {}) };
    let remainderAdded = 0;
    selectedColorsArr.forEach(color => {
      if (!newDist[color]) newDist[color] = {};
      sizes.forEach(size => {
         let val = qtyPerCell;
         if (remainderAdded < remainder) { val += 1; remainderAdded++; }
         newDist[color][size] = val;
      });
    });
    updateOrder('colorDistribution', newDist);
    toast.success('تم توزيع الكمية الإجمالية بالتساوي بين الألوان والمقاسات!');
  };

  let targetSizes = lookups.sizes || [];
  if (currentOrder.sizeFrom && currentOrder.sizeTo) {
    const idx1 = targetSizes.indexOf(currentOrder.sizeFrom);
    const idx2 = targetSizes.indexOf(currentOrder.sizeTo);
    if (idx1 !== -1 && idx2 !== -1) {
      targetSizes = targetSizes.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1);
    }
  }

  const currentTabIdx = TABS.findIndex(t => t.id === activeTab);

  // ─── Render Tab Content ───
  const renderTabContent = () => {
    switch (activeTab) {

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
                  <input type="text" className="form-control" value={currentOrder.serialNumber} onChange={(e) => handleSerialChange(e.target.value)} placeholder="أدخل الرقم التسلسلي هنا..." />
                  {serialStatus === 'checking' && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>جاري التحقق...</span>}
                  {serialStatus === 'used' && <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>⚠️ هذا الرقم التسلسلي مستخدم مسبقاً!</span>}
                  {serialStatus === 'available' && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 'bold' }}>✅ الرقم متاح، يمكن استخدامه.</span>}
                  {currentOrder.barcode && (
                    <div style={{ marginTop: '8px', padding: '6px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px dashed var(--accent-color)', borderRadius: '6px', color: 'var(--accent-color)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       الباركود المولد: <strong style={{ letterSpacing: '2px', fontSize: '1.1rem' }}>{currentOrder.barcode}</strong>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">جوال المشتري و رقم العميل</label>
                  <input type="text" className="form-control" placeholder="أدخل رقم الجوال..." value={currentOrder.buyerMobile || ''} onChange={(e) => updateOrder('buyerMobile', e.target.value)} />
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
                  <select className="form-control" value={currentOrder.productName} onChange={(e) => updateOrder('productName', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.products?.map((p, i) => {
                      const val = typeof p === 'object' ? p.name : p;
                      return <option key={i} value={val}>{val}</option>;
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">السعر / العملة</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" className="form-control" placeholder="السعر" style={{ flex: 2 }} value={currentOrder.productPrice || ''} onChange={(e) => updateOrder('productPrice', e.target.value)} />
                    <select className="form-control" style={{ flex: 1 }} value={currentOrder.currency || ''} onChange={(e) => updateOrder('currency', e.target.value)}>
                      <option value="">العملة...</option>
                      {lookups.currencies?.map((c, i) => <option key={i} value={c}>{c}</option>)}
                    </select>
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
                <div className="form-group">
                  <label className="form-label">المقاس من (Size From)</label>
                  <select className="form-control" value={currentOrder.sizeFrom || ''} onChange={(e) => {
                    const newVal = e.target.value;
                    const oldVal = currentOrder.sizeFrom;
                    updateOrder('sizeFrom', newVal);
                    
                    // Logic to clear sizeTo if types are different (Num vs Text)
                    if (newVal && oldVal) {
                      const wasNumeric = !isNaN(parseFloat(oldVal)) && isFinite(oldVal);
                      const isNumeric = !isNaN(parseFloat(newVal)) && isFinite(newVal);
                      if (wasNumeric !== isNumeric) {
                        updateOrder('sizeTo', '');
                      }
                    }
                  }}>
                    <option value="">اختر...</option>
                    {lookups.sizes?.map((s, i) => <option key={i} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">المقاس إلى (Size To)</label>
                  <select className="form-control" value={currentOrder.sizeTo || ''} onChange={(e) => updateOrder('sizeTo', e.target.value)}>
                    <option value="">اختر...</option>
                    {(() => {
                      if (!currentOrder.sizeFrom) return lookups.sizes;
                      const isNumeric = !isNaN(parseFloat(currentOrder.sizeFrom)) && isFinite(currentOrder.sizeFrom);
                      const baseIdx = lookups.sizes?.indexOf(currentOrder.sizeFrom);

                      return lookups.sizes?.filter((s, idx) => {
                        const sIsNumeric = !isNaN(parseFloat(s)) && isFinite(s);
                        if (sIsNumeric !== isNumeric) return false;
                        
                        if (isNumeric) {
                          return parseFloat(s) >= parseFloat(currentOrder.sizeFrom);
                        } else {
                          // For text sizes, we assume the sorting in lookups.sizes is the correct order
                          return idx >= baseIdx;
                        }
                      });
                    })()?.map((s, i) => <option key={i} value={s}>{s}</option>)}
                  </select>
                </div>
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
                  <select className="form-control" value={currentOrder.productFabric || ''} onChange={(e) => updateOrder('productFabric', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.fabrics?.map((f, i) => <option key={i} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">العلامة التجارية (Trade Mark)</label>
                  <select className="form-control" value={currentOrder.tradeMark || ''} onChange={(e) => updateOrder('tradeMark', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.tradeMarks?.map((t, i) => {
                      const tmName = typeof t === 'object' ? t.name : t;
                      return <option key={i} value={tmName}>{tmName}</option>;
                    })}
                  </select>
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
                {[1, 2, 3].map((num, i) => (
                  <div className="form-group" key={i}>
                    <label className="form-label">المادة {num}</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="form-control" value={currentOrder.materials?.[i]?.name || ''} onChange={(e) => handleMaterialChange(i, 'name', e.target.value)}>
                        <option value="">اختر القماش...</option>
                        {lookups.fabrics?.map((f, j) => <option key={j} value={f}>{f}</option>)}
                      </select>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        className="form-control no-spinner" 
                        placeholder="%" 
                        style={{ width: '85px', fontWeight: 'bold', fontSize: '1.2rem', borderColor: 'var(--accent-color)' }} 
                        value={currentOrder.materials?.[i]?.percentage || ''} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, '');
                          handleMaterialChange(i, 'percentage', val);
                        }} 
                      />
                    </div>
                  </div>
                ))}
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
                <select className="form-control" value={currentOrder.factoryId || ''} onChange={(e) => updateOrder('factoryId', e.target.value)}>
                  <option value="">اختر المصنع...</option>
                  {lookups.factories?.map((f, i) => <option key={i} value={f.name || f}>{f.name || f}</option>)}
                </select>
              </div>
              {currentOrder.factoryId && (() => {
                const selectedFactoryObj = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === currentOrder.factoryId || f === currentOrder.factoryId)) : null;
                if (selectedFactoryObj && selectedFactoryObj.mobile) {
                  return (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>جوال المصنع</label>
                        <input type="text" className="form-control" value={selectedFactoryObj.mobile} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                      </div>
                      <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>عنوان المصنع</label>
                        <input type="text" className="form-control" value={selectedFactoryObj.address} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">تعبئة الكرتون</label>
                  <select className="form-control" value={currentOrder.cartonPackage || ''} onChange={(e) => updateOrder('cartonPackage', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.cartonPackages?.map((cp, i) => <option key={i} value={cp}>{cp}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">كمية الكرتون (Pcs)</label>
                  <input type="number" className="form-control" value={currentOrder.cartonQty || ''} onChange={(e) => updateOrder('cartonQty', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">حجم الكرتون</label>
                  <select className="form-control" value={currentOrder.cartonSize || ''} onChange={(e) => updateOrder('cartonSize', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.cartonSizes?.map((cs, i) => <option key={i} value={cs}>{cs}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">أحجام الأكياس</label>
                  <select className="form-control" value={currentOrder.plasticBagSize || ''} onChange={(e) => updateOrder('plasticBagSize', e.target.value)}>
                    <option value="">اختر...</option>
                    {lookups.plasticBagSizes?.map((pb, i) => <option key={i} value={pb}>{pb}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'colors':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header" style={{ justifyContent: 'space-between' }}>
                <h3><Palette size={22} /> توزيع الألوان والمقاسات</h3>
                <button className="btn btn-primary" onClick={divideQuantityEqually} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                  <LayoutGrid size={16} /> تقسيم بالتساوي
                </button>
              </div>
              <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--border-color)' }}>تحديد اللون</th>
                      {targetSizes.map((s, i) => (
                        <th key={i} style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)' }}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lookups.colors?.map((colorObj, i) => {
                      const colorName = colorObj.name || colorObj;
                      const colorHex = colorObj.hex || '#cccccc';
                      const isSelected = selectedColorsArr.includes(colorName);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'transparent' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleColor(colorName)} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }} />
                              <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: colorHex, border: '1px solid var(--border-color)', display: 'inline-block' }}></span>
                              {colorName}
                            </label>
                          </td>
                          {targetSizes.map((size, j) => (
                            <td key={j} style={{ padding: '0.5rem' }}>
                              <input type="number" className="form-control" style={{ width: '70px', margin: 'auto', display: 'block', textAlign: 'center', opacity: isSelected ? 1 : 0.4, cursor: isSelected ? 'text' : 'not-allowed' }} placeholder="0" disabled={!isSelected} value={currentOrder.colorDistribution?.[colorName]?.[size] || ''} onChange={(e) => handleColorChange(colorName, size, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'packaging':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><CheckSquare size={22} /> شروط وتفاصيل التعبئة الخاصة</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="cond1" checked={!!currentOrder.packagingConditions?.cond1} onChange={(e) => handlePackagingConditionChange('cond1', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent-color)' }} />
                  <label htmlFor="cond1" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input type="number" className="form-control" style={{ width: '60px', padding: '0.4rem' }} value={currentOrder.packagingConditions?.cond1_val1 || ''} onChange={(e) => updateOrder('packagingConditions', { ...currentOrder.packagingConditions, cond1_val1: e.target.value })} />
                    <span>قطعة لون واحد مقاسات مختلطة في كيس متوسط، ألوان مختلطة</span>
                    <input type="number" className="form-control" style={{ width: '60px', padding: '0.4rem' }} value={currentOrder.packagingConditions?.cond1_val2 || ''} onChange={(e) => updateOrder('packagingConditions', { ...currentOrder.packagingConditions, cond1_val2: e.target.value })} />
                    <span>قطعة في الكرتون (件单色混码入中包胶袋 混色 __件装箱)</span>
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="cond2" checked={!!currentOrder.packagingConditions?.cond2} onChange={(e) => handlePackagingConditionChange('cond2', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent-color)' }} />
                  <label htmlFor="cond2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input type="number" className="form-control" style={{ width: '60px', padding: '0.4rem' }} value={currentOrder.packagingConditions?.cond2_val1 || ''} onChange={(e) => updateOrder('packagingConditions', { ...currentOrder.packagingConditions, cond2_val1: e.target.value })} />
                    <span>قطعة ألوان ومقاسات مختلطة في كيس، ألوان مختلطة</span>
                    <input type="number" className="form-control" style={{ width: '60px', padding: '0.4rem' }} value={currentOrder.packagingConditions?.cond2_val2 || ''} onChange={(e) => updateOrder('packagingConditions', { ...currentOrder.packagingConditions, cond2_val2: e.target.value })} />
                    <span>قطعة في الكرتون (件混色混码入中包胶袋 混色 __件装箱)</span>
                  </label>
                </div>
                {lookups.packagingConditionsList?.map((cond, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" id={`cond_dyn_${i}`} checked={!!currentOrder.packagingConditions?.[cond]} onChange={(e) => handlePackagingConditionChange(cond, e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent-color)', cursor: 'pointer' }} />
                    <label htmlFor={`cond_dyn_${i}`} style={{ cursor: 'pointer', fontWeight: '500' }}>{cond}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'measurements': {
        const productObj = lookups.products?.find(p => (typeof p === 'object' ? p.name : p) === currentOrder.productName);
        const partsList = (productObj && productObj.parts && productObj.parts.length > 0) 
            ? productObj.parts : [currentOrder.productName || 'القطعة الأساسية'];
        
        return (
          <div className="tab-panel" key={tabKey}>
             {partsList.map((partName, pIdx) => {
               const partMeasurements = (lookups.measurements || []).filter(m => {
                  if (typeof m === 'object') {
                     // If measurement belongs to this part, or no part is defined
                     return m.part === partName || !m.part; 
                  }
                  return true;
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
                                   className="form-control" 
                                   value={currentOrder.groupedMeasurements?.[partName]?.[mName]?.[size] || currentOrder.measurements?.[mName]?.[size] || ''} 
                                   onChange={(e) => handleMeasurementChange(partName, mName, size, e.target.value)} 
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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" id="fetchSerialInput" className="form-control" placeholder="أدخل الرقم..." style={{ width: '150px' }} />
              <button className="btn btn-primary" onClick={handleFetch} style={{ padding: '0.5rem 1rem' }}>جلب (Fetch)</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Tab Navigation Bar ═══ */}
      <nav className="tab-nav">
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
            onClick={() => { setIsEditMode(false); setOriginalSerial(''); setSerialStatus('available'); }}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(212, 175, 55, 0.3)' }}
          >
            <X size={14} /> إلغاء وضع التعديل
          </button>
        </div>
      )}

      {/* ═══ Bottom Actions Bar ═══ */}
      <div className="wizard-bottom-bar">
        <button className="btn btn-outline" style={{ flex: 1, maxWidth: '180px', fontSize: '1rem', padding: '0.9rem' }} onClick={handleClear}>
          <RefreshCw size={18} /> تفريغ وبدء جديد
        </button>

        {isEditMode ? (
          <>
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
