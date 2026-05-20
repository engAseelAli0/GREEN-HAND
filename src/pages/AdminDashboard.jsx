import React, { useState, useRef, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { Plus, Trash2, Edit, Edit2, Check, X, ImagePlus, ShoppingBag, Banknote, Scissors, Palette, Factory, Ruler, Package, Box, ShoppingCart, Stamp, SlidersHorizontal, ListChecks, Search, Sparkles, GripVertical, Tag, Layers, Puzzle, ChevronDown, Building, User, Shield } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import UserManagement from '../components/UserManagement';
import { compressImage } from '../utils/imageUtils';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const { lookups, updateLookup } = useAppData();
  
  const allowedAdminTabs = user?.permissions?.allowed_admin_tabs || [];

  const tabs = [
    { id: 'products', name: t('admin.tabs.products'), icon: ShoppingBag },
    { id: 'componentParts', name: t('admin.tabs.componentParts'), icon: Puzzle },
    { id: 'currencies', name: t('admin.tabs.currencies'), icon: Banknote },
    { id: 'fabrics', name: t('admin.tabs.fabrics'), icon: Scissors },
    { id: 'materials', name: t('admin.tabs.materials'), icon: Layers },
    { id: 'colors', name: t('admin.tabs.colors'), icon: Palette },
    { id: 'factories', name: t('admin.tabs.factories'), icon: Factory },
    { id: 'companies', name: t('admin.tabs.companies'), icon: Building },
    { id: 'sizes', name: t('admin.tabs.sizes'), icon: Ruler },
    { id: 'cartonPackages', name: t('admin.tabs.cartonPackages'), icon: Package },
    { id: 'cartonSizes', name: t('admin.tabs.cartonSizes'), icon: Box },
    { id: 'plasticBagSizes', name: t('admin.tabs.plasticBagSizes'), icon: ShoppingCart },
    { id: 'tradeMarks', name: t('admin.tabs.tradeMarks'), icon: Stamp },
    { id: 'measurements', name: t('admin.tabs.measurements'), icon: SlidersHorizontal },
    { id: 'packagingConditionsList', name: t('admin.tabs.packagingConditionsList'), icon: ListChecks },
    { id: 'buyerCodes', name: t('admin.tabs.buyerCodes'), icon: Tag },
    { id: 'system_users', name: t('admin.tabs.system_users'), icon: Shield }
  ];

  const filteredTabs = tabs.filter(tab => {
    if (user?.role === 'admin') return true;
    if (allowedAdminTabs.length === 0) {
      if (tab.id === 'system_users') return false;
      return true;
    }
    return allowedAdminTabs.includes(tab.id);
  });

  const [activeTab, setActiveTab] = useState(() => {
    return filteredTabs.length > 0 ? filteredTabs[0].id : 'products';
  });

  useEffect(() => {
    if (filteredTabs.length > 0 && !filteredTabs.some(t => t.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [filteredTabs, activeTab]);

  const [newValue, setNewValue] = useState('');
  const [newValuePrefix, setNewValuePrefix] = useState('');
  const [newValuePartAssignment, setNewValuePartAssignment] = useState('');
  const [newValueHex, setNewValueHex] = useState('#000000');
  const [newValueMobile, setNewValueMobile] = useState('');
  const [newValueFax, setNewValueFax] = useState('');
  const [newValueAddress, setNewValueAddress] = useState('');
  const [newValueFactoryCode, setNewValueFactoryCode] = useState('');
  const [newValueAbbr, setNewValueAbbr] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [tradeMarkImage, setTradeMarkImage] = useState(null);
  const [tradeMarkImageUrl, setTradeMarkImageUrl] = useState('');
  const [uploadingTmImage, setUploadingTmImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showPartsDropdown, setShowPartsDropdown] = useState(false);
  const [selectedPartsArr, setSelectedPartsArr] = useState([]);
  const [showProductsDropdown, setShowProductsDropdown] = useState(false);
  const [selectedProductsArr, setSelectedProductsArr] = useState([]);
  const tmImageRef = useRef(null);
  const formCardRef = useRef(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMeasurementIndex, setAssignMeasurementIndex] = useState(null);
  const [assignSelectedParts, setAssignSelectedParts] = useState([]);

  const allParts = (lookups.componentParts || []).map(p => typeof p === 'object' ? p.name : p).filter(Boolean);

  const handleAddOrEdit = () => {
    const isEditingMode = editIndex !== null;
    const requiredAction = isEditingMode ? 'edit' : 'add';
    if (!hasPermission('admin', requiredAction)) {
      toast.error(t('auth.unauthorized_desc') || 'You do not have permission to perform this action.');
      return;
    }

    if (!newValue.trim()) {
      toast.error(t('admin.messages.valid_name_required'));
      return;
    }
    
    const currentList = [...(lookups[activeTab] || [])];
    
    let newItem = newValue.trim();
    if (activeTab === 'products') {
      const prefix = newValuePrefix.trim();
      if (prefix && currentList.some((item, idx) => idx !== editIndex && typeof item === 'object' && item.codePrefix === prefix)) {
        toast.error(t('admin.messages.duplicate_prefix'));
        return;
      }
      const partsArr = selectedPartsArr.length > 0 ? [...selectedPartsArr] : [newValue.trim()];
      newItem = { name: newValue.trim(), codePrefix: prefix, parts: partsArr };
    } else if (activeTab === 'measurements') {
      newItem = { name: newValue.trim(), part: selectedProductsArr.length > 0 ? selectedProductsArr.join('، ') : newValuePartAssignment.trim() };
    } else if (activeTab === 'colors') {
      if (!newValueAbbr.trim() || newValueAbbr.trim().length > 7) {
         toast.error(t('admin.messages.color_abbr_limit'));
         return;
      }
      const abbr = newValueAbbr.trim().toUpperCase();
      if (currentList.some((item, idx) => idx !== editIndex && typeof item === 'object' && item.abbr === abbr)) {
        toast.error(t('admin.messages.duplicate_color_abbr'));
        return;
      }
      newItem = { name: newValue.trim(), hex: newValueHex, abbr };
    } else if (activeTab === 'factories') {
      if (!newValueMobile.trim() || !newValueAddress.trim()) {
        toast.error(t('admin.messages.factory_info_required'));
        return;
      }
      const code = newValueFactoryCode.trim();
      if (code && currentList.some((item, idx) => idx !== editIndex && typeof item === 'object' && item.code === code)) {
        toast.error(t('admin.messages.duplicate_factory_code'));
        return;
      }
      newItem = { 
        name: newValue.trim(), 
        mobile: newValueMobile.trim(), 
        address: newValueAddress.trim(),
        code
      };
    } else if (activeTab === 'companies') {
      if (!newValueMobile.trim() || !newValueFax.trim()) {
        toast.error(t('admin.messages.company_info_required'));
        return;
      }
      newItem = {
        name: newValue.trim(),
        fax: newValueFax.trim(),
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
      toast.success(t('admin.messages.edit_saved'));
      setEditIndex(null);
    } else {
      // Add mode
      updateLookup(activeTab, [...currentList, newItem]);
      toast.success(t('admin.messages.add_success'));
    }
    setNewValue('');
    setNewValuePrefix('');
    setNewValuePartAssignment('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueFax('');
    setNewValueAddress('');
    setNewValueFactoryCode('');
    setNewValueAbbr('');
    setTradeMarkImage(null);
    setTradeMarkImageUrl('');
    setSelectedPartsArr([]);
    setSelectedProductsArr([]);
    setShowPartsDropdown(false);
    setShowProductsDropdown(false);
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
      setSelectedPartsArr(typeof item === 'object' && Array.isArray(item.parts) ? [...item.parts] : []);
    } else if (activeTab === 'measurements') {
      setNewValue(typeof item === 'object' ? item.name : item);
      setNewValuePartAssignment(typeof item === 'object' ? (item.part || '') : '');
      setSelectedProductsArr(typeof item === 'object' && item.part ? item.part.split('، ').map(p => p.trim()).filter(Boolean) : []);
    } else if (activeTab === 'factories') {
      setNewValue(item.name || item);
      setNewValueMobile(item.mobile || '');
      setNewValueAddress(item.address || '');
      setNewValueFactoryCode(item.code || '');
    } else if (activeTab === 'companies') {
      setNewValue(item.name || item);
      setNewValueFax(item.fax || '');
      setNewValueMobile(item.mobile || '');
      setNewValueAddress(item.address || '');
    } else if (activeTab === 'tradeMarks' && typeof item === 'object') {
      setNewValue(item.name || '');
      setTradeMarkImageUrl(item.imageUrl || '');
    } else {
      setNewValue(typeof item === 'object' ? item.name : item);
    }
    toast('وضع التعديل قيد التفعيل...', { icon: '🛠️' });
    // Auto-scroll to the form
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setNewValue('');
    setNewValuePrefix('');
    setNewValuePartAssignment('');
    setNewValueHex('#000000');
    setNewValueMobile('');
    setNewValueFax('');
    setNewValueAddress('');
    setNewValueFactoryCode('');
    setNewValueAbbr('');
    setTradeMarkImage(null);
    setTradeMarkImageUrl('');
    setSelectedPartsArr([]);
    setSelectedProductsArr([]);
    setShowPartsDropdown(false);
    setShowProductsDropdown(false);
  };

  const handleTradeMarkImageUpload = async (e) => {
    const requiredAction = editIndex !== null ? 'edit' : 'add';
    if (!hasPermission('admin', requiredAction)) {
      toast.error(t('auth.unauthorized_desc') || 'You do not have permission to perform this action.');
      return;
    }
    const originalFile = e.target.files[0];
    if (!originalFile) return;
    if (!newValue.trim()) {
      toast.error(t('admin.messages.trademark_name_required'));
      return;
    }
    setUploadingTmImage(true);
    try {
      const file = await compressImage(originalFile, 800, 0.75);
      const ext = file.name.split('.').pop();
      const safeId = Date.now().toString(36);
      const fileName = `tm_${safeId}.${ext}`;
      const filePath = `trademarks/${fileName}`;
      const { error } = await supabase.storage
        .from('product_images')
        .upload(filePath, file, { upsert: true });
      if (error) {
        toast.error(`${t('admin.messages.upload_failed')}: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage
        .from('product_images')
        .getPublicUrl(filePath);
      setTradeMarkImageUrl(urlData.publicUrl);
      setTradeMarkImage(URL.createObjectURL(file));
      toast.success(t('admin.messages.upload_success'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.messages.upload_error'));
    } finally {
      setUploadingTmImage(false);
      if (tmImageRef.current) tmImageRef.current.value = '';
    }
  };

  const handleDelete = (indexToDelete) => {
    if (!hasPermission('admin', 'delete')) {
      toast.error(t('auth.unauthorized_desc') || 'You do not have permission to perform this action.');
      return;
    }
    const currentList = lookups[activeTab] || [];
    const newList = currentList.filter((_, i) => i !== indexToDelete);
    updateLookup(activeTab, newList);
    toast.success(t('admin.messages.item_deleted'));
    if (editIndex === indexToDelete) cancelEdit();
  };

  // ─── Drag & Drop Reorder Handlers ──────────────────────
  const handleDragStart = (e, index) => {
    if (!hasPermission('admin', 'edit')) {
      e.preventDefault();
      toast.error(t('auth.unauthorized_desc') || 'You do not have permission to perform this action.');
      return;
    }
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
      toast.success(t('admin.messages.reorder_success'));
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

  const activeTabInfo = filteredTabs.find(t => t.id === activeTab);
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
      background: 'linear-gradient(135deg, var(--surface-color), var(--bg-color))',
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
      background: 'linear-gradient(135deg, var(--text-strong), var(--accent-color))',
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
      background: 'linear-gradient(180deg, var(--surface-color), var(--bg-color))',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
      position: 'sticky',
      top: '7.5rem',
      maxHeight: 'calc(100vh - 9rem)',
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
      color: 'var(--text-strong)',
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
      <style>{`
        @media (max-width: 900px) {
          .admin-body { flex-direction: column !important; }
          .admin-sidebar {
            width: 100% !important;
            position: static !important;
            max-height: none !important;
            flex-direction: row !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 0.65rem !important;
            gap: 0.25rem !important;
          }
          .admin-sidebar > div:first-child { display: none !important; }
          .admin-sidebar button { white-space: nowrap; font-size: 0.8rem !important; padding: 0.5rem 0.7rem !important; }
          .admin-sidebar button span:not(:first-child) { display: none; }
        }
        @media (max-width: 600px) {
          .admin-header { padding: 1rem !important; }
          .admin-header-title { font-size: 1.1rem !important; }
        }
      `}</style>
      {/* ═══ Header ═══ */}
      <div style={styles.header} className="admin-header">
        <div style={styles.headerTitle} className="admin-header-title">
          <div style={styles.headerIconWrap}>
            <Sparkles size={22} color="#fff" />
          </div>
          {t('admin.title')}
        </div>
        <span style={styles.badge}>
          {t('admin.active_categories', { count: filteredTabs.length })}
        </span>
      </div>

      {/* ═══ Body ═══ */}
      <div style={styles.body} className="admin-body">
        
        {/* ─── Sidebar ─── */}
        <nav style={styles.sidebar} className="admin-sidebar">
          <div style={styles.sidebarLabel}>{t('admin.categories_and_lists')}</div>
          {filteredTabs.map(tab => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;
            const count = (lookups[tab.id] || []).length;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); cancelEdit(); setSearchQuery(''); setShowPartsDropdown(false); setShowProductsDropdown(false); }}
                style={styles.tabBtn(isActive)}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.color = 'var(--text-strong)';
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
              {t('admin.manage_prefix')} {activeTabInfo?.name}
            </div>
            {activeTab !== 'system_users' && <span style={styles.badge}>{t('admin.items_count', { count: currentItems.length })}</span>}
          </div>

          {activeTab === 'system_users' ? (
            <UserManagement />
          ) : (
            <>
              {/* ─── Add / Edit Form ─── */}
              {((editIndex !== null && hasPermission('admin', 'edit')) || (editIndex === null && hasPermission('admin', 'add'))) && (
                <div ref={formCardRef} style={styles.formCard}>
            <div style={styles.formTitle}>
              {editIndex !== null ? (
                <><Edit2 size={16} /> {t('admin.edit_item')}</>
              ) : (
                <><Plus size={16} /> {t('admin.add_item')}</>
              )}
            </div>

            <div style={styles.formGrid}>
              {/* Main Name Field */}
              <div style={styles.formField}>
                <label style={styles.formLabel}>
                  {activeTab === 'factories' ? t('admin.factory_name') : activeTab === 'companies' ? t('admin.company_name_header') : t('admin.item_name')}
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={editIndex !== null ? t('admin.edit_value') : t('admin.type_here')}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddOrEdit()}
                  data-enter-ignore="true"
                  style={{ backgroundColor: 'var(--bg-color)' }}
                />
              </div>

              {/* Products extra fields */}
              {activeTab === 'products' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.code_prefix')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.code_prefix_placeholder')}
                      value={newValuePrefix}
                      onChange={(e) => setNewValuePrefix(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={{ ...styles.formField, gridColumn: '1 / -1' }}>
                    <label style={styles.formLabel}>{t('admin.component_parts_hint')}</label>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setShowPartsDropdown(prev => !prev)}
                        className="form-control"
                        style={{
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          textAlign: 'right', width: '100%', padding: '0.5rem 0.75rem',
                          border: showPartsDropdown ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)',
                          color: selectedPartsArr.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                          transition: 'border-color 0.2s'
                        }}
                      >
                        <span>{selectedPartsArr.length > 0 ? selectedPartsArr.join(' + ') : t('admin.choose_parts')}</span>
                        <ChevronDown size={15} style={{ transform: showPartsDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                      </button>
                      {showPartsDropdown && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                          marginTop: '4px', padding: '0.5rem',
                          backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                          borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          maxHeight: '200px', overflowY: 'auto'
                        }}>
                          {allParts.length === 0 ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.no_parts_added')}</div>
                          ) : allParts.map((partName, idx) => {
                            const isChecked = selectedPartsArr.includes(partName);
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (isChecked) {
                                    setSelectedPartsArr(selectedPartsArr.filter(p => p !== partName));
                                  } else {
                                    setSelectedPartsArr([...selectedPartsArr, partName]);
                                  }
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.45rem 0.6rem', cursor: 'pointer',
                                  borderRadius: '6px', transition: 'background-color 0.15s',
                                  backgroundColor: isChecked ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                                  marginBottom: '2px'
                                }}
                                onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                                onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = isChecked ? 'rgba(139, 92, 246, 0.12)' : 'transparent'; }}
                              >
                                <div style={{
                                  width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                                  border: isChecked ? '2px solid #a78bfa' : '2px solid var(--border-color)',
                                  backgroundColor: isChecked ? '#a78bfa' : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all 0.15s'
                                }}>
                                  {isChecked && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                                </div>
                                <Puzzle size={14} style={{ color: isChecked ? '#a78bfa' : 'var(--text-muted)', flexShrink: 0 }} />
                                <span style={{ fontWeight: isChecked ? 'bold' : 'normal', color: 'var(--text-main)', fontSize: '0.88rem' }}>{partName}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Show selected parts as removable badges */}
                    {selectedPartsArr.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                        {selectedPartsArr.map((pName, i) => {
                          const isOrphan = !allParts.includes(pName);
                          return (
                            <span key={i} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              padding: '0.2rem 0.55rem', borderRadius: '50px',
                              backgroundColor: isOrphan ? 'rgba(239, 68, 68, 0.08)' : 'rgba(139, 92, 246, 0.1)',
                              border: isOrphan ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(139, 92, 246, 0.25)',
                              fontSize: '0.8rem', fontWeight: '600',
                              color: isOrphan ? '#ef4444' : '#a78bfa'
                            }}>
                              <Puzzle size={12} />
                              {pName}
                              {isOrphan && <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>({t('admin.legacy')})</span>}
                              <button type="button" onClick={() => setSelectedPartsArr(selectedPartsArr.filter(p => p !== pName))} style={{
                                background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center'
                              }}><X size={12} strokeWidth={3} /></button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Measurements: parts assignment dropdown */}
              {activeTab === 'measurements' && (
                <div style={{ ...styles.formField, gridColumn: '1 / -1' }}>
                  <label style={styles.formLabel}>{t('admin.link_parts_optional')}</label>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowProductsDropdown(prev => !prev)}
                      className="form-control"
                      style={{
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        textAlign: 'right', width: '100%', padding: '0.5rem 0.75rem',
                        border: showProductsDropdown ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)',
                        color: selectedProductsArr.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <span>{selectedProductsArr.length > 0 ? t('admin.parts_connected', { count: selectedProductsArr.length }) : t('admin.link_parts_placeholder')}</span>
                      <ChevronDown size={15} style={{ transform: showProductsDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                    </button>
                    {showProductsDropdown && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                        marginTop: '4px', padding: '0.5rem',
                        backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        maxHeight: '200px', overflowY: 'auto'
                      }}>
                        {allParts.length === 0 ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.no_parts_available')}</div>
                        ) : allParts.map((partName, idx) => {
                          const isChecked = selectedProductsArr.includes(partName);
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedProductsArr(selectedProductsArr.filter(p => p !== partName));
                                } else {
                                  setSelectedProductsArr([...selectedProductsArr, partName]);
                                }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: '0.45rem 0.6rem', cursor: 'pointer',
                                borderRadius: '6px', transition: 'background-color 0.15s',
                                backgroundColor: isChecked ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                                marginBottom: '2px'
                              }}
                              onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                              onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.backgroundColor = isChecked ? 'rgba(212, 175, 55, 0.1)' : 'transparent'; }}
                            >
                              <div style={{
                                width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                                border: isChecked ? '2px solid var(--accent-color)' : '2px solid var(--border-color)',
                                backgroundColor: isChecked ? 'var(--accent-color)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s'
                              }}>
                                {isChecked && <span style={{ color: '#000', fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                              </div>
                              <Puzzle size={14} style={{ color: isChecked ? 'var(--accent-color)' : 'var(--text-muted)', flexShrink: 0 }} />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: isChecked ? 'bold' : 'normal', color: 'var(--text-main)', fontSize: '0.88rem' }}>{partName}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {selectedProductsArr.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                      {selectedProductsArr.map((pName, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.2rem 0.5rem', borderRadius: '50px',
                          backgroundColor: 'rgba(212, 175, 55, 0.1)',
                          border: '1px solid rgba(212, 175, 55, 0.25)',
                          fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-color)'
                        }}>
                          {pName}
                          <button type="button" onClick={() => setSelectedProductsArr(selectedProductsArr.filter(p => p !== pName))} style={{
                            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center'
                          }}><X size={11} strokeWidth={3} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Companies extra fields */}
              {activeTab === 'companies' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.company_fax')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.company_fax')}
                      value={newValueFax}
                      onChange={(e) => setNewValueFax(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.company_mobile')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.company_mobile')}
                      value={newValueMobile}
                      onChange={(e) => setNewValueMobile(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.company_address') || 'Address'}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.type_here')}
                      value={newValueAddress}
                      onChange={(e) => setNewValueAddress(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                </>
              )}

              {/* Factory extra fields */}
              {activeTab === 'factories' && (
                <>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.factory_code')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.factory_code')}
                      value={newValueFactoryCode}
                      onChange={(e) => setNewValueFactoryCode(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.factory_mobile')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.type_here')}
                      value={newValueMobile}
                      onChange={(e) => setNewValueMobile(e.target.value)}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.factory_address')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.factory_address_placeholder')}
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
                    <label style={styles.formLabel}>{t('admin.tabs.colors')}</label>
                    <input
                      type="color"
                      className="form-control"
                      title={t('admin.select_color_title')}
                      value={newValueHex}
                      onChange={(e) => setNewValueHex(e.target.value)}
                      style={{ height: '42px', padding: '4px', cursor: 'pointer', backgroundColor: 'var(--bg-color)' }}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>{t('admin.color_abbr')}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t('admin.color_abbr_placeholder')}
                      value={newValueAbbr}
                      onChange={(e) => setNewValueAbbr(e.target.value.toUpperCase())}
                      style={{ backgroundColor: 'var(--bg-color)' }}
                      maxLength={7}
                    />
                  </div>
                </>
              )}

              {/* TradeMarks image upload */}
              {activeTab === 'tradeMarks' && (
                <div style={styles.formField}>
                  <label style={styles.formLabel}>{t('admin.trademark_image')}</label>
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
                      {uploadingTmImage ? t('admin.uploading') : t('admin.upload_image')}
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
                    <X size={18} /> {t('admin.cancel_edit')}
                  </button>
                  <button className="btn btn-accent" onClick={handleAddOrEdit} style={{ gap: '0.4rem' }}>
                    <Check size={18} /> {t('admin.edit_and_save')}
                  </button>
                </>
              ) : (
                <button className="btn btn-accent" onClick={handleAddOrEdit} style={{ gap: '0.4rem', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                  <Plus size={18} /> {t('admin.save_and_add')}
                </button>
              )}
            </div>
          </div>
              )}

          {/* ─── Search Bar ─── */}
          {currentItems.length > 4 && (
            <div style={styles.searchBar}>
              <Search size={16} style={styles.searchIcon} />
              <input
                type="text"
                placeholder={t('admin.quick_search')}
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
            {filteredItems.map((item) => {
              const realIndex = currentItems.indexOf(item);
              const isEditing = editIndex === realIndex;
              const isDragging = dragIndex === realIndex;
              const isDragOver = dragOverIndex === realIndex && dragIndex !== realIndex;
              const canDrag = !searchQuery.trim() && hasPermission('admin', 'edit');
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
                          title={t('admin.reorder_success')}
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
                          <span style={styles.metaBadge}>{t('admin.code_prefix')}: {item.codePrefix}</span>
                        )}
                        {activeTab === 'products' && typeof item === 'object' && item.parts && item.parts.length > 0 && (
                          <span style={{ ...styles.metaBadge, background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                            {item.parts.join(' + ')}
                          </span>
                        )}
                        {activeTab === 'measurements' && typeof item === 'object' && item.part && (
                          <span style={styles.measurementBadge}>{t('admin.fields.track')}: {item.part}</span>
                        )}
                      </div>

                      {activeTab === 'factories' && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          {item.mobile && <span>{item.mobile} • {item.address}</span>}
                          {item.code && <span style={{ color: 'var(--accent-color)' }}>{t('admin.fields.factory_code')}: {item.code}</span>}
                        </div>
                      )}

                      {activeTab === 'companies' && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          {item.fax && <span>{t('admin.fields.fax')}: {item.fax}</span>}
                          {item.mobile && <span>{t('admin.fields.mobile')}: {item.mobile}</span>}
                          {item.address && <span>{t('admin.factory_address') || 'Address'}: {item.address}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {activeTab === 'measurements' && hasPermission('admin', 'edit') && (
                      <button
                        onClick={() => {
                          setAssignMeasurementIndex(realIndex);
                          const currentParts = (typeof item === 'object' && item.part) ? item.part.split('،').map(p => p.trim()).filter(Boolean) : [];
                          setAssignSelectedParts(currentParts);
                          setAssignModalOpen(true);
                        }}
                        title={t('admin.actions.assign_parts')}
                        style={styles.actionBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)'; e.currentTarget.style.color = '#a78bfa'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <Tag size={16} />
                      </button>
                    )}
                    {hasPermission('admin', 'edit') && (
                      <button
                        onClick={() => startEdit(realIndex, item)}
                        title={t('admin.actions.edit')}
                        style={styles.actionBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                    {hasPermission('admin', 'delete') && (
                      <button
                        onClick={() => handleDelete(realIndex)}
                        title={t('admin.actions.delete')}
                        style={styles.actionBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
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
                  {searchQuery ? t('admin.no_match') : t('admin.start_adding')}
                </p>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* ─── Assign Products/Parts Modal ─── */}
      {assignModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--surface-color)', width: '90%', maxWidth: '400px', borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(212, 175, 55, 0.3)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={20} color="var(--accent-color)" />
              {t('admin.customize_sizes')}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('admin.component_parts_hint')} ({assignMeasurementIndex !== null ? (typeof currentItems[assignMeasurementIndex] === 'object' ? currentItems[assignMeasurementIndex].name : currentItems[assignMeasurementIndex]) : ''})
            </p>
            
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto',
              background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
            }}>
              {allParts.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>{t('admin.no_parts_added')}</div>
              ) : (
                allParts.map((partName, idx) => {
                  const isSelected = assignSelectedParts.includes(partName);
                  return (
                    <label key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer',
                      padding: '0.5rem', borderRadius: '8px',
                      background: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                      border: isSelected ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid transparent',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignSelectedParts([...assignSelectedParts, partName]);
                          } else {
                            setAssignSelectedParts(assignSelectedParts.filter(p => p !== partName));
                          }
                        }}
                        style={{ accentColor: 'var(--accent-color)', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', color: isSelected ? 'var(--accent-color)' : 'var(--text-main)', fontWeight: isSelected ? '600' : '400' }}>
                          {partName}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                className="btn btn-outline"
                onClick={() => { setAssignModalOpen(false); setAssignMeasurementIndex(null); }}
              >
                {t('admin.cancel_edit')}
              </button>
               <button
                className="btn btn-accent"
                onClick={() => {
                  if (!hasPermission('admin', 'edit')) {
                    toast.error(t('auth.unauthorized_desc') || 'You do not have permission to perform this action.');
                    return;
                  }
                  const currentList = [...(lookups.measurements || [])];
                  const item = currentList[assignMeasurementIndex];
                  const newItem = {
                    name: typeof item === 'object' ? item.name : item,
                    part: assignSelectedParts.join('، ')
                  };
                  currentList[assignMeasurementIndex] = newItem;
                  updateLookup('measurements', currentList);
                  setAssignModalOpen(false);
                  setAssignMeasurementIndex(null);
                  toast.success(t('admin.messages.edit_saved'));
                }}
              >
                {t('admin.edit_and_save')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
