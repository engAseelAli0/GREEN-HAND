import React, { useState, useRef } from 'react';
import { useAppData } from '../context/AppDataContext';
import { Plus, Trash2, Edit, Edit2, Check, X, ImagePlus, ShoppingBag, Banknote, Scissors, Palette, Factory, Ruler, Package, Box, ShoppingCart, Stamp, SlidersHorizontal, ListChecks, Search, Sparkles, GripVertical } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  const { lookups, updateLookup } = useAppData();
  const [activeTab, setActiveTab] = useState('products');
  const [newValue, setNewValue] = useState('');
  const [newValuePrefix, setNewValuePrefix] = useState('');
  const [newValueParts, setNewValueParts] = useState('');
  const [newValuePartAssignment, setNewValuePartAssignment] = useState('');
  const [newValueHex, setNewValueHex] = useState('#000000');
  const [newValueMobile, setNewValueMobile] = useState('');
  const [newValueAddress, setNewValueAddress] = useState('');
  const [newValueAbbr, setNewValueAbbr] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [tradeMarkImage, setTradeMarkImage] = useState(null);
  const [tradeMarkImageUrl, setTradeMarkImageUrl] = useState('');
  const [uploadingTmImage, setUploadingTmImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const tmImageRef = useRef(null);

  const tabs = [
    { id: 'products', name: 'المنتجات', icon: ShoppingBag },
    { id: 'currencies', name: 'العملات', icon: Banknote },
    { id: 'fabrics', name: 'الأقمشة', icon: Scissors },
    { id: 'colors', name: 'الألوان', icon: Palette },
    { id: 'factories', name: 'المصانع (Factories)', icon: Factory },
    { id: 'sizes', name: 'المقاسات', icon: Ruler },
    { id: 'cartonPackages', name: 'تعبئة الكرتون', icon: Package },
    { id: 'cartonSizes', name: 'أحجام الكراتين', icon: Box },
    { id: 'plasticBagSizes', name: 'أحجام الأكياس', icon: ShoppingCart },
    { id: 'tradeMarks', name: 'العلامات التجارية', icon: Stamp },
    { id: 'measurements', name: 'قائمة المقاسات', icon: SlidersHorizontal },
    { id: 'packagingConditionsList', name: 'شروط التعبئة الإضافية', icon: ListChecks }
  ];

  const handleAddOrEdit = () => {
    if (!newValue.trim()) {
      toast.error('الرجاء كتابة اسم أو قيمة صالحة');
      return;
    }
    
    const currentList = [...(lookups[activeTab] || [])];
    
    let newItem = newValue.trim();
    if (activeTab === 'products') {
      const partsArr = newValueParts.trim() ? newValueParts.split(',').map(p => p.trim()).filter(Boolean) : [newValue.trim()];
      newItem = { name: newValue.trim(), codePrefix: newValuePrefix.trim(), parts: partsArr };
    } else if (activeTab === 'measurements') {
      newItem = { name: newValue.trim(), part: newValuePartAssignment.trim() };
    } else if (activeTab === 'colors') {
      if (!newValueAbbr.trim() || newValueAbbr.trim().length > 4) {
         toast.error('الرجاء إدخال اختصار لون لا يزيد عن 4 أحرف (مثلاً WHT)');
         return;
      }
      newItem = { name: newValue.trim(), hex: newValueHex, abbr: newValueAbbr.trim().toUpperCase() };
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
    setNewValuePrefix('');
    setNewValueParts('');
    setNewValuePartAssignment('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueAddress('');
    setNewValueAbbr('');
    setTradeMarkImage(null);
    setTradeMarkImageUrl('');
  };

  const startEdit = (index, item) => {
    setEditIndex(index);
    if (activeTab === 'colors') {
      setNewValue(item.name);
      setNewValueHex(item.hex || '#000000');
      setNewValueAbbr(item.abbr || '');
    } else if (activeTab === 'products') {
      setNewValue(typeof item === 'object' ? item.name : item);
      setNewValuePrefix(typeof item === 'object' ? (item.codePrefix || '') : '');
      setNewValueParts(typeof item === 'object' && Array.isArray(item.parts) ? item.parts.join('، ') : '');
    } else if (activeTab === 'measurements') {
      setNewValue(typeof item === 'object' ? item.name : item);
      setNewValuePartAssignment(typeof item === 'object' ? (item.part || '') : '');
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
    setNewValuePrefix('');
    setNewValueParts('');
    setNewValuePartAssignment('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueAddress('');
    setNewValueAbbr('');
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

  // ─── Drag & Drop Reorder Handlers ──────────────────────
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    if (e.currentTarget) {
      setTimeout(() => {
        e.currentTarget.style.opacity = '0.4';
      }, 0);
    }
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    // If we have a valid drop target different from origin, perform the reorder
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const currentList = [...(lookups[activeTab] || [])];
      const [draggedItem] = currentList.splice(dragIndex, 1);
      currentList.splice(dragOverIndex, 0, draggedItem);
      updateLookup(activeTab, currentList);
      // Update editIndex to follow the edited item
      if (editIndex !== null) {
        if (editIndex === dragIndex) {
          setEditIndex(dragOverIndex);
        } else if (dragIndex < editIndex && dragOverIndex >= editIndex) {
          setEditIndex(editIndex - 1);
        } else if (dragIndex > editIndex && dragOverIndex <= editIndex) {
          setEditIndex(editIndex + 1);
        }
      }
      toast.success('تم إعادة ترتيب العنصر بنجاح ✨');
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the card entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDragOverIndex(null);
    }
  };

  const currentItems = lookups[activeTab] || [];
  const filteredItems = searchQuery.trim()
    ? currentItems.filter(item => {
        const name = typeof item === 'object' ? item.name : item;
        return name?.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : currentItems;

  const activeTabInfo = tabs.find(t => t.id === activeTab);
  const ActiveIcon = activeTabInfo?.icon || Edit;

  // ─── Inline Styles ───────────────────────────────────────
  const styles = {
    root: {
      minHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: 0,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      padding: '1.5rem 2rem',
      background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.95), rgba(13, 17, 23, 0.98))',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid rgba(212, 175, 55, 0.15)',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
    },
    headerTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.85rem',
      fontSize: '1.35rem',
      fontWeight: '700',
      background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    headerIconWrap: {
      width: '44px',
      height: '44px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--accent-color), #b58d27)',
      borderRadius: '12px',
      boxShadow: '0 4px 14px rgba(212, 175, 55, 0.3)',
    },
    body: {
      display: 'flex',
      gap: '1.5rem',
      flex: 1,
      alignItems: 'flex-start',
    },
    sidebar: {
      width: '250px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      padding: '1rem',
      background: 'linear-gradient(180deg, var(--surface-color), rgba(22, 27, 34, 0.95))',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
      position: 'sticky',
      top: '1rem',
      maxHeight: 'calc(100vh - 8rem)',
      overflowY: 'auto',
    },
    sidebarLabel: {
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      padding: '0.5rem 0.75rem 0.35rem',
      marginBottom: '0.25rem',
    },
    tabBtn: (isActive) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem',
      padding: '0.65rem 0.85rem',
      textAlign: 'right',
      background: isActive
        ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.06))'
        : 'transparent',
      color: isActive ? '#fff' : 'var(--text-muted)',
      border: 'none',
      borderRadius: '10px',
      cursor: 'pointer',
      fontFamily: 'Tajawal',
      fontSize: '0.88rem',
      fontWeight: isActive ? '600' : '400',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
    }),
    tabIconWrap: (isActive) => ({
      width: '30px',
      height: '30px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      background: isActive ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
      color: isActive ? '#fff' : 'var(--text-muted)',
      flexShrink: 0,
      transition: 'all 0.25s ease',
      boxShadow: isActive ? '0 2px 8px rgba(212, 175, 55, 0.35)' : 'none',
    }),
    tabCount: (isActive) => ({
      marginRight: 'auto',
      fontSize: '0.72rem',
      fontWeight: '600',
      padding: '0.15rem 0.55rem',
      borderRadius: '20px',
      background: isActive ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.06)',
      color: isActive ? 'var(--accent-color)' : 'var(--text-muted)',
      fontFamily: 'Outfit, sans-serif',
    }),
    content: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
    },
    contentHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1.25rem 1.75rem',
      background: 'var(--surface-color)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
    },
    contentHeaderTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      fontSize: '1.15rem',
      fontWeight: '600',
      color: 'var(--primary-color)',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      background: 'rgba(212, 175, 55, 0.12)',
      color: 'var(--accent-color)',
      padding: '0.35rem 0.85rem',
      borderRadius: 'var(--radius-full)',
      fontSize: '0.82rem',
      fontWeight: '600',
      border: '1px solid rgba(212, 175, 55, 0.2)',
      fontFamily: 'Outfit, sans-serif',
    },
    formCard: {
      padding: '1.5rem 1.75rem',
      background: 'var(--surface-color)',
      borderRadius: 'var(--radius-lg)',
      border: editIndex !== null ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid var(--border-color)',
      boxShadow: editIndex !== null ? '0 0 20px rgba(212, 175, 55, 0.08)' : '0 2px 12px rgba(0, 0, 0, 0.15)',
      transition: 'all 0.3s ease',
    },
    formTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      fontSize: '0.9rem',
      fontWeight: '600',
      color: editIndex !== null ? 'var(--accent-color)' : 'var(--text-muted)',
      marginBottom: '1rem',
    },
    formGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '0.85rem',
      marginBottom: '1rem',
    },
    formField: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
    },
    formLabel: {
      fontSize: '0.78rem',
      fontWeight: '500',
      color: 'var(--text-muted)',
      paddingRight: '0.2rem',
    },
    formActions: {
      display: 'flex',
      gap: '0.65rem',
      justifyContent: 'flex-end',
      paddingTop: '0.5rem',
      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    },
    searchBar: {
      position: 'relative',
    },
    searchInput: {
      width: '100%',
      padding: '0.7rem 1rem 0.7rem 2.6rem',
      background: 'var(--surface-color)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'Tajawal, sans-serif',
      fontSize: '0.9rem',
      color: 'var(--text-main)',
      transition: 'all 0.25s ease',
    },
    searchIcon: {
      position: 'absolute',
      left: '0.85rem',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-muted)',
      pointerEvents: 'none',
    },
    itemsGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    },
    orderIndex: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '26px',
      height: '26px',
      borderRadius: '8px',
      background: 'rgba(212, 175, 55, 0.1)',
      color: 'var(--accent-color)',
      fontSize: '0.75rem',
      fontWeight: '700',
      fontFamily: 'Outfit, sans-serif',
      flexShrink: 0,
      border: '1px solid rgba(212, 175, 55, 0.15)',
    },
    dragHandle: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'grab',
      padding: '0.35rem 0.25rem',
      borderRadius: '8px',
      color: 'var(--text-muted)',
      flexShrink: 0,
      transition: 'all 0.2s ease',
      opacity: 0.5,
    },
    dropIndicator: {
      height: '3px',
      borderRadius: '4px',
      background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)',
      margin: '-0.25rem 2rem',
      boxShadow: '0 0 12px rgba(212, 175, 55, 0.5), 0 0 4px rgba(212, 175, 55, 0.3)',
      animation: 'pulse 1s ease-in-out infinite alternate',
    },
    itemCard: (isEditing, isDragging, isDragOver) => ({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.9rem 1.15rem',
      background: isDragging
        ? 'rgba(212, 175, 55, 0.04)'
        : isEditing
          ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.03))'
          : 'var(--surface-color)',
      borderRadius: '12px',
      border: isDragOver
        ? '1px solid rgba(212, 175, 55, 0.5)'
        : isEditing
          ? '1px solid rgba(212, 175, 55, 0.35)'
          : '1px solid var(--border-color)',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
      opacity: isDragging ? 0.4 : 1,
      transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
      boxShadow: isDragOver ? '0 0 20px rgba(212, 175, 55, 0.15)' : 'none',
    }),
    itemName: (isEditing) => ({
      fontWeight: isEditing ? '600' : '500',
      color: isEditing ? 'var(--accent-color)' : 'var(--text-main)',
      fontSize: '0.92rem',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }),
    metaBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '0.76rem',
      padding: '0.15rem 0.5rem',
      borderRadius: '6px',
      background: 'rgba(212, 175, 55, 0.1)',
      color: 'var(--accent-color)',
      fontWeight: '500',
      marginTop: '0.2rem',
    },
    measurementBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '0.76rem',
      padding: '0.15rem 0.5rem',
      borderRadius: '6px',
      background: 'rgba(139, 92, 246, 0.1)',
      color: '#a78bfa',
      fontWeight: '500',
      marginTop: '0.2rem',
    },
    actionBtn: {
      background: 'none',
      border: 'none',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      padding: '0.35rem',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
    },
    emptyState: {
      gridColumn: '1 / -1',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3.5rem 2rem',
      background: 'var(--surface-color)',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed rgba(212, 175, 55, 0.25)',
      gap: '0.75rem',
    },
  };

  return (
    <div style={styles.root} className="fade-in">
      {/* ═══ Header ═══ */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.headerIconWrap}>
            <Sparkles size={22} color="#fff" />
          </div>
          لوحة التحكم الاستراتيجية
        </div>
        <span style={styles.badge}>
          {tabs.length} تصنيف نشط
        </span>
      </div>

      {/* ═══ Body ═══ */}
      <div style={styles.body}>
        
        {/* ─── Sidebar ─── */}
        <nav style={styles.sidebar}>
          <div style={styles.sidebarLabel}>التصنيفات والقوائم</div>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;
            const count = (lookups[tab.id] || []).length;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); cancelEdit(); setSearchQuery(''); }}
                style={styles.tabBtn(isActive)}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.color = 'var(--primary-color)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                <div style={styles.tabIconWrap(isActive)}>
                  <TabIcon size={15} />
                </div>
                <span>{tab.name}</span>
                {count > 0 && <span style={styles.tabCount(isActive)}>{count}</span>}
              </button>
            );
          })}
        </nav>

        {/* ─── Content ─── */}
        <div style={styles.content}>
          
          {/* Content Header */}
          <div style={styles.contentHeader}>
            <div style={styles.contentHeaderTitle}>
              <ActiveIcon size={20} color="var(--accent-color)" />
              إدارة {activeTabInfo?.name}
            </div>
            <span style={styles.badge}>{currentItems.length} عنصر</span>
          </div>

          {/* ─── Add / Edit Form ─── */}
          <div style={styles.formCard}>
            <div style={styles.formTitle}>
              {editIndex !== null ? (
                <><Edit2 size={16} /> تعديل عنصر موجود</>
              ) : (
                <><Plus size={16} /> إضافة عنصر جديد</>
              )}
            </div>

            <div style={styles.formGrid}>
              {/* Main Name Field */}
              <div style={styles.formField}>
                <label style={styles.formLabel}>
                  {activeTab === 'factories' ? 'اسم المصنع' : 'اسم العنصر'}
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={editIndex !== null ? 'تعديل القيمة...' : 'اكتب هنا...'}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddOrEdit()}
                  style={{ backgroundColor: 'var(--bg-color)' }}
                />
              </div>

              {/* Products extra fields */}
              {activeTab === 'products' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>رقم الكود (Code Prefix)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="مثلاً: 1000"
                      value={newValuePrefix}
                      onChange={(e) => setNewValuePrefix(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>القطع المكونة</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="جاكيت، بنطلون..."
                      value={newValueParts}
                      onChange={(e) => setNewValueParts(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                </>
              )}

              {/* Measurements extra field */}
              {activeTab === 'measurements' && (
                <div style={styles.formField}>
                  <label style={styles.formLabel}>يتبع لأي جزء؟</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="جاكيت؟ بنطلون؟..."
                    value={newValuePartAssignment}
                    onChange={(e) => setNewValuePartAssignment(e.target.value)}
                    style={{ backgroundColor: 'var(--bg-color)' }}
                  />
                </div>
              )}

              {/* Factories extra fields */}
              {activeTab === 'factories' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>رقم التواصل</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="رقم الجوال..."
                      value={newValueMobile}
                      onChange={(e) => setNewValueMobile(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>العنوان</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="عنوان المصنع..."
                      value={newValueAddress}
                      onChange={(e) => setNewValueAddress(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                </>
              )}

              {/* Colors extra fields */}
              {activeTab === 'colors' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>اللون</label>
                    <input
                      type="color"
                      className="form-control"
                      title="تحديد اللون المظهري"
                      value={newValueHex}
                      onChange={(e) => setNewValueHex(e.target.value)}
                      style={{ height: '42px', padding: '4px', cursor: 'pointer', backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>رمز الكود (مثلاً WHT)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="WHT"
                      value={newValueAbbr}
                      onChange={(e) => setNewValueAbbr(e.target.value.toUpperCase())}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                      maxLength={4}
                    />
                  </div>
                </>
              )}

              {/* TradeMarks image upload */}
              {activeTab === 'tradeMarks' && (
                <div style={styles.formField}>
                  <label style={styles.formLabel}>صورة العلامة التجارية</label>
                  <input type="file" ref={tmImageRef} accept="image/*" onChange={handleTradeMarkImageUpload} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => tmImageRef.current?.click()}
                      disabled={uploadingTmImage}
                      style={{ borderColor: 'rgba(212, 175, 55, 0.3)', gap: '0.5rem', whiteSpace: 'nowrap', flex: 1 }}
                    >
                      <ImagePlus size={18} />
                      {uploadingTmImage ? 'جاري الرفع...' : 'رفع صورة'}
                    </button>
                    {(tradeMarkImageUrl || tradeMarkImage) && (
                      <img
                        src={tradeMarkImage || tradeMarkImageUrl}
                        alt="TM"
                        style={{
                          width: '42px',
                          height: '42px',
                          objectFit: 'contain',
                          borderRadius: '8px',
                          border: '2px solid rgba(212, 175, 55, 0.3)',
                          background: '#fff',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={styles.formActions}>
              {editIndex !== null ? (
                <>
                  <button className="btn btn-outline" onClick={cancelEdit} style={{ gap: '0.4rem' }}>
                    <X size={18} /> إلغاء
                  </button>
                  <button className="btn btn-accent" onClick={handleAddOrEdit} style={{ gap: '0.4rem' }}>
                    <Check size={18} /> حفظ التعديل
                  </button>
                </>
              ) : (
                <button className="btn btn-accent" onClick={handleAddOrEdit} style={{ gap: '0.4rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                  <Plus size={18} /> إضافة جديد
                </button>
              )}
            </div>
          </div>

          {/* ─── Search Bar ─── */}
          {currentItems.length > 4 && (
            <div style={styles.searchBar}>
              <Search size={16} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="بحث في العناصر..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={styles.searchInput}
                onFocus={e => {
                  e.target.style.borderColor = 'var(--accent-color)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.15)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--border-color)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* ─── Items List ─── */}
          <div style={styles.itemsGrid}>
            {filteredItems.map((item, index) => {
              const realIndex = currentItems.indexOf(item);
              const isEditing = editIndex === realIndex;
              const isDragging = dragIndex === realIndex;
              const isDragOver = dragOverIndex === realIndex && dragIndex !== realIndex;
              const canDrag = !searchQuery.trim();
              return (
                <React.Fragment key={realIndex}>
                  {/* Drop indicator ABOVE this item */}
                  {isDragOver && dragIndex > realIndex && (
                    <div style={styles.dropIndicator} />
                  )}
                  <div
                    className="fade-in"
                    draggable={canDrag}
                    onDragStart={canDrag ? (e) => handleDragStart(e, realIndex) : undefined}
                    onDragEnd={canDrag ? handleDragEnd : undefined}
                    onDragOver={canDrag ? (e) => handleDragOver(e, realIndex) : undefined}
                    onDragLeave={canDrag ? handleDragLeave : undefined}
                    style={styles.itemCard(isEditing, isDragging, isDragOver)}
                    onMouseEnter={e => {
                      if (!isEditing && !isDragging) {
                        e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.25)';
                        if (!dragIndex && dragIndex !== 0) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isEditing && !isDragOver) {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
                      {/* Drag Handle */}
                      {canDrag && (
                        <div
                          style={styles.dragHandle}
                          title="اسحب لإعادة الترتيب"
                          onMouseEnter={e => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = 'var(--accent-color)';
                            e.currentTarget.style.background = 'rgba(212, 175, 55, 0.08)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.opacity = '0.5';
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <GripVertical size={16} />
                        </div>
                      )}
                      {/* Position number */}
                      <div style={styles.orderIndex}>{realIndex + 1}</div>
                    {/* Color swatch */}
                    {activeTab === 'colors' && typeof item === 'object' && item.hex && (
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        backgroundColor: item.hex,
                        border: '2px solid rgba(255,255,255,0.1)',
                        flexShrink: 0,
                        boxShadow: `0 2px 8px ${item.hex}44`,
                      }} />
                    )}

                    {/* TradeMark image */}
                    {activeTab === 'tradeMarks' && typeof item === 'object' && item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{
                          width: '44px',
                          height: '44px',
                          objectFit: 'contain',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          background: '#fff',
                          flexShrink: 0,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        }}
                      />
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '0.15rem' }}>
                      <span style={styles.itemName(isEditing)}>
                        {typeof item === 'object' ? item.name : item}
                      </span>

                      {/* Meta info badges */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {activeTab === 'colors' && typeof item === 'object' && item.abbr && (
                          <span style={styles.metaBadge}>{item.abbr}</span>
                        )}
                        {activeTab === 'products' && typeof item === 'object' && item.codePrefix && (
                          <span style={styles.metaBadge}>كود: {item.codePrefix}</span>
                        )}
                        {activeTab === 'products' && typeof item === 'object' && item.parts && item.parts.length > 0 && (
                          <span style={{ ...styles.metaBadge, background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                            {item.parts.join(' + ')}
                          </span>
                        )}
                        {activeTab === 'measurements' && typeof item === 'object' && item.part && (
                          <span style={styles.measurementBadge}>تتبع: {item.part}</span>
                        )}
                      </div>

                      {activeTab === 'factories' && item.mobile && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {item.mobile} • {item.address}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(realIndex, item)}
                      title="تعديل"
                      style={styles.actionBtn}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(realIndex)}
                      title="حذف"
                      style={styles.actionBtn}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  </div>
                  {/* Drop indicator BELOW this item */}
                  {isDragOver && dragIndex < realIndex && (
                    <div style={styles.dropIndicator} />
                  )}
                </React.Fragment>
              );
            })}

            {filteredItems.length === 0 && (
              <div style={styles.emptyState}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'rgba(212, 175, 55, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <ActiveIcon size={28} color="rgba(212, 175, 55, 0.4)" />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.25rem' }}>
                  {searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'القائمة فارغة تماماً، ابدأ بإضافة العناصر من الأعلى.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
