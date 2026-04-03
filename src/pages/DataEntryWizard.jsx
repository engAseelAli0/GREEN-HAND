import React, { useState, useEffect } from 'react';
import { useAppData, defaultOrderState } from '../context/AppDataContext';
import { Save, RefreshCw, Hash, Calendar, Box, Scissors, Palette, LayoutGrid } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

const DataEntryWizard = () => {
  const { lookups, currentOrder, updateOrder, setCurrentOrder } = useAppData();
  const [activeDiv, setActiveDiv] = useState(1);
  const [selectedColorsArr, setSelectedColorsArr] = useState([]);
  const [serialStatus, setSerialStatus] = useState(null);

  useEffect(() => {
    // Only fetch if serialNumber is empty
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
             
             // Extract just the numbers in case there was old bad data
             const match = lastSerialStr.match(/\d+/);
             if (match) {
               const nextNum = parseInt(match[0]) + 1;
               updateOrder('serialNumber', nextNum.toString());
             } else {
               updateOrder('serialNumber', '1000');
             }
             setSerialStatus('available');
           } else {
             // Defaults if no orders exist at all
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

  const toggleColor = (colorName) => {
    setSelectedColorsArr(prev => {
      if (prev.includes(colorName)) {
        // Remove color data
        const dist = { ...(currentOrder.colorDistribution || {}) };
        delete dist[colorName];
        updateOrder('colorDistribution', dist);
        return prev.filter(c => c !== colorName);
      } else {
        return [...prev, colorName];
      }
    });
  };

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

  const handleSave = async () => {
    if (!currentOrder.serialNumber?.trim()) {
      toast.error('الرجاء كتابة الرقم التسلسلي للطلبية أولاً.');
      return;
    }
    if (serialStatus === 'used') {
      toast.error('هذا الرقم التسلسلي مستخدم مسبقاً! قم باسترداده للتعديل أو استخدم رقماً جديداً.');
      return;
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
        return;
      }
    }

    if (isNaN(parseInt(currentOrder.totalQuantity))) {
      toast.error('الكمية الإجمالية يجب أن تكون رقماً.');
      return;
    }

    const toastId = toast.loading('جاري حفظ الطلبية في السحابة...');
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([{
          serial_number: currentOrder.serialNumber,
          order_data: currentOrder
        }]);

      if (error) {
        console.error(error);
        toast.error('حدث خطأ أثناء الحفظ! تأكد من إنشاء جدول orders وتصريحاته.', { id: toastId });
      } else {
        toast.success(`تم حفظ الطلبية (${currentOrder.serialNumber}) بنجاح!`, { id: toastId });
        
        // Auto-clear tracking and initialize next logic
        const nextNum = parseInt(currentOrder.serialNumber) + 1;
        setCurrentOrder({
          ...defaultOrderState,
          serialNumber: !isNaN(nextNum) ? nextNum.toString() : '1000'
        });
        setSelectedColorsArr([]);
        setSerialStatus('available');
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
        setSerialStatus('used');
        toast.success(`تم استرداد بيانات الطلبية: ${serial}`, { id: toastId });
      }
    } catch (err) {
      toast.error('خطأ في الاتصال بالانترنت أو قاعدة البيانات!', { id: toastId });
    }
  };

  const handleClear = () => {
    // Keep serialNumber but wipe the rest
    setCurrentOrder({ ...defaultOrderState, serialNumber: currentOrder.serialNumber });
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
    if (!newMaterials[index]) newMaterials[index] = { name: '', percentage: '' };
    newMaterials[index][field] = value;
    updateOrder('materials', newMaterials);
  };

  const handleMeasurementChange = (mName, size, value) => {
    const dist = { ...(currentOrder.measurements || {}) };
    if (!dist[mName]) dist[mName] = {};
    dist[mName][size] = value;
    updateOrder('measurements', dist);
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
    
    let targetSizes = lookups.sizes || [];
    if (currentOrder.sizeFrom && currentOrder.sizeTo) {
      const idx1 = targetSizes.indexOf(currentOrder.sizeFrom);
      const idx2 = targetSizes.indexOf(currentOrder.sizeTo);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        targetSizes = targetSizes.slice(start, end + 1);
      }
    }
    
    if (targetSizes.length === 0) {
      toast.error('لا توجد مقاسات محددة للتوزيع');
      return;
    }
    
    const cellsCount = selectedColorsArr.length * targetSizes.length;
    const qtyPerCell = Math.floor(totalQty / cellsCount);
    const MathRemainder = totalQty % cellsCount;
    
    const newDist = { ...(currentOrder.colorDistribution || {}) };
    let remainderAdded = 0;
    
    selectedColorsArr.forEach(color => {
      if (!newDist[color]) newDist[color] = {};
      targetSizes.forEach(size => {
         let val = qtyPerCell;
         if (remainderAdded < MathRemainder) {
            val += 1;
            remainderAdded++;
         }
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
      const start = Math.min(idx1, idx2);
      const end = Math.max(idx1, idx2);
      targetSizes = targetSizes.slice(start, end + 1);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Actions Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }} className="fade-in">
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Section 1: Buyer & Core Details */}
        <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Hash size={20} color="var(--accent-color)"/> بيانات المشتري والمنتج
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">الرقم التسلسلي (إدخال يدوي)</label>
              <input 
                type="text" 
                className="form-control" 
                value={currentOrder.serialNumber} 
                onChange={(e) => handleSerialChange(e.target.value)} 
                placeholder="أدخل الرقم التسلسلي هنا..."
              />
              {serialStatus === 'checking' && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>جاري التحقق...</span>}
              {serialStatus === 'used' && <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>⚠️ هذا الرقم التسلسلي مستخدم مسبقاً!</span>}
              {serialStatus === 'available' && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 'bold' }}>✅ الرقم متاح، يمكن استخدامه.</span>}
            </div>
            <div className="form-group">
              <label className="form-label">جوال المشتري و رقم العميل</label>
              <input type="text" className="form-control" placeholder="أدخل رقم الجوال..." value={currentOrder.buyerMobile || ''} onChange={(e) => updateOrder('buyerMobile', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">رقم الموديل(Product Number)</label>
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
                {lookups.products?.map((p, i) => <option key={i} value={p}>{p}</option>)}
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
          </div>
        </div>

        {/* Section 2: Dates & Factory */}
        <div className="card fade-in" style={{ animationDelay: '0.2s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Calendar size={20} color="var(--accent-color)"/> المواعيد والمقاسات
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">تاريخ طلب المشتري</label>
              <input type="date" className="form-control" value={currentOrder.requestDate || ''} onChange={(e)=>updateOrder('requestDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">تاريخ التسليم في المصنع</label>
              <input type="date" className="form-control" value={currentOrder.deliveryDate || ''} onChange={(e)=>updateOrder('deliveryDate', e.target.value)} />
            </div>
             <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">الكمية الإجمالية (Product Quantity)</label>
              <input type="number" className="form-control" value={currentOrder.totalQuantity} onChange={(e)=>updateOrder('totalQuantity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">المقاس من (Size From)</label>
              <select className="form-control" value={currentOrder.sizeFrom || ''} onChange={(e) => updateOrder('sizeFrom', e.target.value)}>
                  <option value="">اختر...</option>
                  {lookups.sizes?.map((s, i) => <option key={i} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">المقاس إلى (Size To)</label>
              <select className="form-control" value={currentOrder.sizeTo || ''} onChange={(e) => updateOrder('sizeTo', e.target.value)}>
                  <option value="">اختر...</option>
                  {lookups.sizes?.map((s, i) => <option key={i} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

         {/* Section 3: Fabrics */}
         <div className="card fade-in" style={{ animationDelay: '0.3s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Scissors size={20} color="var(--accent-color)"/> تفاصيل الأقمشة والمواد
          </h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
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
                  {lookups.tradeMarks?.map((t, i) => <option key={i} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {/* Material percentages */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
             {[1, 2, 3].map((num, i) => (
               <div className="form-group" key={i}>
                  <label className="form-label">المادة {num}</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select className="form-control" value={currentOrder.materials?.[i]?.name || ''} onChange={(e) => handleMaterialChange(i, 'name', e.target.value)}>
                      <option value="">اختر القماش...</option>
                      {lookups.fabrics?.map((f, j) => <option key={j} value={f}>{f}</option>)}
                    </select>
                    <input type="number" className="form-control" placeholder="%" style={{ width: '60px' }} value={currentOrder.materials?.[i]?.percentage || ''} onChange={(e) => handleMaterialChange(i, 'percentage', e.target.value)} />
                  </div>
               </div>
             ))}
          </div>
        </div>

         {/* Section 4: Packaging and Factory Info */}
         <div className="card fade-in" style={{ animationDelay: '0.4s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <Box size={20} color="var(--accent-color)"/> المصنع والتعبئة والتغليف
          </h3>
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

      <div className="form-group fade-in" style={{ animationDelay: '0.45s', backgroundColor: 'var(--surface-color)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary-color)' }}>
          <Hash size={20} color="var(--accent-color)"/> ملاحظات الطلب (Order Remarks)
        </h3>
        <textarea className="form-control" rows="3" placeholder="أدخل أي ملاحظات إضافية حول الطلبية أو الألوان هنا..." value={currentOrder.remarks || ''} onChange={(e) => updateOrder('remarks', e.target.value)}></textarea>
      </div>

      {/* Section 5: Colors Matrix */}
      <div className="card fade-in" style={{ animationDelay: '0.5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
           <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <Palette size={20} color="var(--accent-color)"/> توزيع الألوان والمقاسات
           </h3>
           <button className="btn btn-primary" onClick={divideQuantityEqually}>
             <LayoutGrid size={18} />
             تقسيم الكمية بالتساوي
           </button>
        </div>

        {/* Dynamic Matrix (Rows: Colors, Cols: Sizes) */}
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--border-color)' }}>تحديد اللون</th>
                {lookups.sizes?.map((s, i) => (
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
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleColor(colorName)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                      />
                      <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: colorHex, border: '1px solid var(--border-color)', display: 'inline-block' }}></span>
                      {colorName}
                    </label>
                  </td>
                  {targetSizes.map((size, j) => (
                    <td key={j} style={{ padding: '0.5rem' }}>
                      <input 
                        type="number" 
                        className="form-control" 
                        style={{ width: '70px', margin: 'auto', display: 'block', textAlign: 'center', opacity: isSelected ? 1 : 0.4, cursor: isSelected ? 'text' : 'not-allowed' }} 
                        placeholder="0"
                        disabled={!isSelected}
                        value={currentOrder.colorDistribution?.[colorName]?.[size] || ''}
                        onChange={(e) => handleColorChange(colorName, size, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 6: Specific Packaging Instructions */}
      <div className="card fade-in" style={{ animationDelay: '0.6s' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
           <Box size={20} color="var(--accent-color)"/> شروط وتفاصيل التعبئة الخاصة
        </h3>
        
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
              <label htmlFor={`cond_dyn_${i}`} style={{ cursor: 'pointer', fontWeight: '500' }}>
                {cond}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Section 7: Size Details Matrix */}
      <div className="card fade-in" style={{ animationDelay: '0.7s' }}>
         <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
           <Scissors size={20} color="var(--accent-color)"/> مقاسات المنتج التفصيلية (Size Details)
         </h3>
         
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
              {lookups.measurements?.map((mName, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: '500', backgroundColor: 'var(--bg-color)' }}>
                    {mName}
                  </td>
                  {targetSizes.map((size, j) => (
                    <td key={j} style={{ padding: '0.5rem' }}>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={currentOrder.measurements?.[mName]?.[size] || ''}
                        onChange={(e) => handleMeasurementChange(mName, size, e.target.value)}
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

      {/* Bottom Actions Row */}
      <div className="fade-in" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '1rem', 
          flexWrap: 'wrap',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '2rem',
          marginTop: '1rem'
        }}>
        <button className="btn btn-outline" style={{ flex: 1, maxWidth: '200px', fontSize: '1.1rem', padding: '1rem' }} onClick={handleClear}>
          <RefreshCw size={20} /> تفريغ وبدء جديد
        </button>
        <button className="btn btn-accent" style={{ flex: 2, maxWidth: '400px', fontSize: '1.2rem', padding: '1rem' }} onClick={handleSave}>
          <Save size={24} /> اعتماد وحفظ الطلب
        </button>
      </div>

    </div>
  );
};

export default DataEntryWizard;
