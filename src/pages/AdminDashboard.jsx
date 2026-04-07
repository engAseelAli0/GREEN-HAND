import React, { useState, useRef } from 'react';
import { useAppData } from '../context/AppDataContext';
import { Plus, Trash2, Edit, Edit2, Check, X, ImagePlus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  const { lookups, updateLookup } = useAppData();
  const [activeTab, setActiveTab] = useState('products');
  const [newValue, setNewValue] = useState('');
  const [newValueHex, setNewValueHex] = useState('#000000');
  const [newValueMobile, setNewValueMobile] = useState('');
  const [newValueAddress, setNewValueAddress] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [tradeMarkImage, setTradeMarkImage] = useState(null);
  const [tradeMarkImageUrl, setTradeMarkImageUrl] = useState('');
  const [uploadingTmImage, setUploadingTmImage] = useState(false);
  const tmImageRef = useRef(null);

  const tabs = [
    { id: 'products', name: 'المنتجات' },
    { id: 'currencies', name: 'العملات' },
    { id: 'fabrics', name: 'الأقمشة' },
    { id: 'colors', name: 'الألوان' },
    { id: 'factories', name: 'المصانع (Factories)' },
    { id: 'sizes', name: 'المقاسات' },
    { id: 'cartonPackages', name: 'تعبئة الكرتون' },
    { id: 'cartonSizes', name: 'أحجام الكراتين' },
    { id: 'plasticBagSizes', name: 'أحجام الأكياس' },
    { id: 'tradeMarks', name: 'العلامات التجارية (Trade Marks)' },
    { id: 'measurements', name: 'قائمة المقاسات (Measurements)' },
    { id: 'packagingConditionsList', name: 'شروط التعبئة الإضافية' }
  ];

  const handleAddOrEdit = () => {
    if (!newValue.trim()) {
      toast.error('الرجاء كتابة اسم أو قيمة صالحة');
      return;
    }
    
    const currentList = [...(lookups[activeTab] || [])];
    
    let newItem = newValue.trim();
    if (activeTab === 'colors') {
      newItem = { name: newValue.trim(), hex: newValueHex };
    } else if (activeTab === 'factories') {
      if (!newValueMobile.trim() || !newValueAddress.trim()) {
        toast.error('الرجاء تعبئة عنوان وجوال المصنع بوضوح');
        return;
      }
      newItem = { 
        name: newValue.trim(), 
        mobile: newValueMobile.trim(), 
        address: newValueAddress.trim() 
      };
    } else if (activeTab === 'tradeMarks') {
      newItem = { 
        name: newValue.trim(), 
        imageUrl: tradeMarkImageUrl || (editIndex !== null && typeof currentList[editIndex] === 'object' ? currentList[editIndex].imageUrl : '') || ''
      };
    }

    if (editIndex !== null) {
      // Edit mode
      currentList[editIndex] = newItem;
      updateLookup(activeTab, currentList);
      toast.success('تم حفظ التعديل ✏️');
      setEditIndex(null);
    } else {
      // Add mode
      updateLookup(activeTab, [...currentList, newItem]);
      toast.success('تمت الإضافة بنجاح ✅');
    }
    setNewValue('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueAddress('');
    setTradeMarkImage(null);
    setTradeMarkImageUrl('');
  };

  const startEdit = (index, item) => {
    setEditIndex(index);
    if (activeTab === 'colors') {
      setNewValue(item.name);
      setNewValueHex(item.hex || '#000000');
    } else if (activeTab === 'factories') {
      setNewValue(item.name || item);
      setNewValueMobile(item.mobile || '');
      setNewValueAddress(item.address || '');
    } else if (activeTab === 'tradeMarks' && typeof item === 'object') {
      setNewValue(item.name || '');
      setTradeMarkImageUrl(item.imageUrl || '');
    } else {
      setNewValue(typeof item === 'object' ? item.name : item);
    }
    toast('وضع التعديل قيد التفعيل...', { icon: '🛠️' });
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setNewValue('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueAddress('');
    setTradeMarkImage(null);
    setTradeMarkImageUrl('');
  };

  const handleTradeMarkImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!newValue.trim()) {
      toast.error('الرجاء كتابة اسم العلامة التجارية أولاً');
      return;
    }
    setUploadingTmImage(true);
    try {
      const ext = file.name.split('.').pop();
      const safeId = Date.now().toString(36);
      const fileName = `tm_${safeId}.${ext}`;
      const filePath = `trademarks/${fileName}`;
      const { data, error } = await supabase.storage
        .from('product_images')
        .upload(filePath, file, { upsert: true });
      if (error) {
        toast.error(`فشل رفع الصورة: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage
        .from('product_images')
        .getPublicUrl(filePath);
      setTradeMarkImageUrl(urlData.publicUrl);
      setTradeMarkImage(URL.createObjectURL(file));
      toast.success('تم رفع صورة العلامة التجارية بنجاح!');
    } catch (err) {
      console.error(err);
      toast.error('خطأ في رفع الصورة!');
    } finally {
      setUploadingTmImage(false);
      if (tmImageRef.current) tmImageRef.current.value = '';
    }
  };

  const handleDelete = (indexToDelete) => {
    const currentList = lookups[activeTab] || [];
    const newList = currentList.filter((_, i) => i !== indexToDelete);
    updateLookup(activeTab, newList);
    toast('تم حذف العنصر 🗑️');
    if (editIndex === indexToDelete) cancelEdit();
  };

  return (
    <div className="card fade-in" style={{ minHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary-color)' }}>
        <div style={{ background: 'var(--surface-highlight)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
           <Edit size={24} color="var(--accent-color)" />
        </div>
        لوحة التحكم الاستراتيجية
      </h2>

      <div style={{ display: 'flex', gap: '2rem', flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
        
        {/* Modern Sidebar Tabs */}
        <div style={{ 
            width: '260px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem', 
            backgroundColor: 'var(--surface-color)',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            height: 'fit-content'
          }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>التصنيفات والقوائم</h4>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); cancelEdit(); }}
              style={{
                padding: '0.8rem 1.2rem',
                textAlign: 'right',
                backgroundColor: activeTab === tab.id ? 'var(--surface-highlight)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent-color)' : 'var(--text-main)',
                border: 'none',
                borderRight: activeTab === tab.id ? '4px solid var(--accent-color)' : '4px solid transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'Tajawal',
                fontWeight: activeTab === tab.id ? '700' : '500',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{tab.name}</span>
              {activeTab === tab.id && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-color)' }}></span>}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ 
            flex: 1, 
            minWidth: '300px',
            backgroundColor: 'var(--bg-color)', 
            padding: '2.5rem', 
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '1.4rem' }}>
              إدارة {tabs.find(t => t.id === activeTab)?.name}
            </h3>
            <span style={{ backgroundColor: 'var(--surface-highlight)', color: 'var(--accent-color)', padding: '0.3rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.85rem' }}>
              {(lookups[activeTab] || []).length} عنصر
            </span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              placeholder={editIndex !== null ? (activeTab === 'factories' ? 'اسم المصنع...' : "تعديل القيمة...") : (activeTab === 'factories' ? 'اسم المصنع الجديد...' : "إضافة عنصر جديد...")}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddOrEdit()}
              style={{ flex: 1, minWidth: '200px', backgroundColor: 'var(--surface-color)' }}
            />
            {activeTab === 'factories' && (
              <>
                <input
                  type="text"
                  className="form-control"
                  placeholder="رقم وتواصل المصنع..."
                  value={newValueMobile}
                  onChange={(e) => setNewValueMobile(e.target.value)}
                  style={{ flex: 1, minWidth: '150px', backgroundColor: 'var(--surface-color)' }}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder="عنوان المصنع..."
                  value={newValueAddress}
                  onChange={(e) => setNewValueAddress(e.target.value)}
                  style={{ flex: 1, minWidth: '150px', backgroundColor: 'var(--surface-color)' }}
                />
              </>
            )}
            {activeTab === 'colors' && (
              <input 
                type="color" 
                className="form-control" 
                style={{ width: '64px', height: '100%', padding: '0.2rem', cursor: 'pointer', backgroundColor: 'var(--surface-color)' }}
                value={newValueHex}
                onChange={(e) => setNewValueHex(e.target.value)}
                title="تحديد اللون المظهري"
              />
            )}
            {activeTab === 'tradeMarks' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="file" ref={tmImageRef} accept="image/*" onChange={handleTradeMarkImageUpload} style={{ display: 'none' }} />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => tmImageRef.current?.click()}
                  disabled={uploadingTmImage}
                  style={{ borderColor: 'rgba(212, 175, 55, 0.3)', gap: '0.5rem', whiteSpace: 'nowrap' }}
                >
                  <ImagePlus size={18} />
                  {uploadingTmImage ? 'جاري الرفع...' : 'صورة العلامة'}
                </button>
                {(tradeMarkImageUrl || tradeMarkImage) && (
                  <img src={tradeMarkImage || tradeMarkImageUrl} alt="TM" style={{ width: '70px', height: '70px', objectFit: 'contain', borderRadius: '8px', border: '2px solid rgba(212, 175, 55, 0.3)', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} />
                )}
              </div>
            )}
            
            {editIndex !== null ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-accent" onClick={handleAddOrEdit}>
                  <Check size={20} /> حفظ التعديل
                </button>
                <button className="btn btn-outline" onClick={cancelEdit}>
                  <X size={20} /> إلغاء
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleAddOrEdit}>
                <Plus size={20} /> إضافة جديد
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem' }}>
            {(lookups[activeTab] || []).map((item, index) => {
              const isEditing = editIndex === index;
              return (
              <div 
                key={index}
                className="fade-in"
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  backgroundColor: isEditing ? 'rgba(212, 175, 55, 0.1)' : 'var(--surface-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-sm)',
                  border: isEditing ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                  {activeTab === 'colors' && item.hex && (
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: item.hex, border: '1px solid var(--border-color)', flexShrink: 0 }}></span>
                  )}
                  {activeTab === 'tradeMarks' && typeof item === 'object' && item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} style={{ width: '55px', height: '55px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: isEditing ? '600' : '500', color: isEditing ? 'var(--accent-color)' : 'var(--text-main)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {activeTab === 'colors' ? item.name : (activeTab === 'factories' ? item.name : (typeof item === 'object' ? item.name : item))}
                    </span>
                    {activeTab === 'factories' && item.mobile && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.mobile} • {item.address}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button 
                    onClick={() => startEdit(index, item)}
                    title="تعديل"
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--text-muted)', 
                      cursor: 'pointer',
                      padding: '0.2rem'
                    }}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(index)}
                    title="حذف"
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--text-muted)', 
                      cursor: 'pointer',
                      padding: '0.2rem'
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )})}
            
            {(lookups[activeTab] || []).length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
                <Edit size={40} color="var(--border-color)" style={{ marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>القائمة فارغة تماماً، ابدأ بإضافة العناصر من الأعلى.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
