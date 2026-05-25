import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppData, defaultOrderState } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useFilteredLookups } from '../hooks/useFilteredLookups';
import { Save, RefreshCw, Hash, Calendar, Box, Scissors, Palette, LayoutGrid, ChevronRight, ChevronLeft, MessageSquare, CheckSquare, Square, Ruler, Camera, X, ImagePlus, Edit3, Copy, Trash2, Layers, PanelTop, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/imageUtils';
import { CustomDateInput } from '../components/CustomDateInput';
import ImageEditorModal from '../components/ImageEditorModal';
import { appendActivity, createActivityItem, summarizeOrderChanges } from '../utils/activityLog';

const ClearableSelect = ({ value, onChange, children, className = "form-control", style, disabled, clearTitle }) => {
  const { t } = useTranslation();
  return (
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
          title={clearTitle || t('entry.actions.clear_selection')}
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
};

const DataEntryWizard = () => {
  const { t } = useTranslation();
  const { lookups, currentOrder, updateOrder, setCurrentOrder } = useAppData();
  const { user, hasPermission } = useAuth();
  const filteredLookups = useFilteredLookups();

  const TABS = [
    { id: 'basic', label: t('entry.tabs.basic_info'), icon: Hash, num: 1 },
    { id: 'fabrics_factory', label: t('entry.tabs.fabrics_factory'), icon: Scissors, num: 2 },
    { id: 'colors_sizes', label: t('entry.tabs.colors_sizes'), icon: Palette, num: 3 },
    { id: 'packaging', label: t('entry.tabs.packaging'), icon: CheckSquare, num: 4 },
  ];
  const [activeTab, setActiveTab] = useState('basic');
  const [selectedColorsArr, setSelectedColorsArr] = useState(() => {
    if (currentOrder?.colorDistribution) {
      return Object.keys(currentOrder.colorDistribution);
    }
    return [];
  });
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
  const [tempPackagingConditions, setTempPackagingConditions] = useState({});
  const [packagingSearchQuery, setPackagingSearchQuery] = useState('');
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

  const [isSaving, setIsSaving] = useState(false);
  const [autoFocusLastSize, setAutoFocusLastSize] = useState(false);

  // ─── Image Editor States ───
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [imageToEdit, setImageToEdit] = useState(null);
  const [pendingImages, setPendingImages] = useState([]);
  const [editingExistingImageIndex, setEditingExistingImageIndex] = useState(null);

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
    try { localStorage.setItem('gh_viewMode', next); } catch { /* ignore unavailable storage */ }
  };

  const fetchNextAvailableSerial = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('serial_number')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (data && data.length > 0) {
        const match = data[0].serial_number.match(/\d+/);
        if (match) return (parseInt(match[0]) + 1).toString();
      }
      return '1';
    } catch (err) {
      console.error('Error fetching latest serial', err);
      return '1';
    }
  };

  const fetchNextOrderNumber = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('order_data')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data && data.length > 0) {
        let maxOrder = 0;
        for (const row of data) {
           if (row.order_data && row.order_data.orderNumber) {
             const num = parseInt(row.order_data.orderNumber);
             if (!isNaN(num) && num > maxOrder) maxOrder = num;
           }
        }
        if (maxOrder >= 0) {
          return (maxOrder + 1).toString();
        }
      }
      return '0';
    } catch (err) {
      toast.error(t('entry.messages.connection_error'), { id: toastId });
      console.error(err);
    }
  };

  useEffect(() => {
    if (!currentOrder.serialNumber) {
       fetchNextAvailableSerial().then(nextNum => {
         updateOrder('serialNumber', nextNum);
         setSerialStatus('available');
       });
    }
    if (!currentOrder.orderNumber) {
       fetchNextOrderNumber().then(nextNum => {
         updateOrder('orderNumber', nextNum);
       });
    }
  }, []); // eslint-disable-line

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setTabKey(prev => prev + 1);
  };

  // ─── Image Upload & Editor Handlers ───
  const handleImageUpload = async (e) => {
    const originalFiles = Array.from(e.target.files);
    if (!originalFiles.length) return;

    const modelNum = currentOrder.serialNumber?.trim();
    if (!modelNum) {
      toast.error(t('entry.messages.model_required'));
      return;
    }

    // Put images in queue and start with the first one
    setPendingImages(originalFiles);
    setImageToEdit(originalFiles[0]);
    setIsEditorOpen(true);
    
    // Clear inputs so they can be triggered again
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const onSaveEditedImage = async (editedFile) => {
    setIsEditorOpen(false);
    setImageToEdit(null);
    
    setUploadingImage(true);
    const toastId = toast.loading(t('entry.messages.uploading_images'));

    try {
      const modelNum = currentOrder.serialNumber?.trim();
      const file = await compressImage(editedFile, 1200, 0.75);
      const ext = file.name.split('.').pop() || 'jpg';
      
      if (editingExistingImageIndex !== null) {
        const idx = editingExistingImageIndex;
        const oldImg = productImages[idx];
        const fileName = oldImg.name;
        const filePath = oldImg.path || `product-images/${fileName}`;
        
        const { error } = await supabase.storage.from('product_images').upload(filePath, file, { upsert: true });

        if (error) {
          toast.error(t('entry.messages.upload_error', { error: error.message }), { id: toastId });
        } else {
          const { data: urlData } = supabase.storage.from('product_images').getPublicUrl(filePath);

          const newImage = {
            name: fileName,
            path: filePath,
            // Append timestamp to URL to bypass browser cache
            url: urlData.publicUrl + '?t=' + Date.now(),
            preview: URL.createObjectURL(file)
          };

          const newProductImages = [...productImages];
          newProductImages[idx] = newImage;
          setProductImages(newProductImages);
          
          const updatedImages = [...(currentOrder.productImages || [])];
          updatedImages[idx] = { name: newImage.name, path: newImage.path, url: newImage.url };
          updateOrder('productImages', updatedImages);
          
          toast.success(t('entry.messages.upload_success'), { id: toastId });
        }
        setEditingExistingImageIndex(null);
        setUploadingImage(false);
        return;
      }

      const currentCount = productImages.length;
      const fileName = currentCount === 0 ? `${modelNum}.${ext}` : `${modelNum}#${currentCount}.${ext}`;
      const filePath = `product-images/${fileName}`;

      const { error } = await supabase.storage
        .from('product_images')
        .upload(filePath, file, { upsert: true });

      if (error) {
        console.error('Upload error:', error);
        toast.error(t('entry.messages.upload_error', { error: error.message }), { id: toastId });
      } else {
        const { data: urlData } = supabase.storage
          .from('product_images')
          .getPublicUrl(filePath);

        const newImage = {
          name: fileName,
          path: filePath,
          url: urlData.publicUrl,
          preview: URL.createObjectURL(file)
        };

        setProductImages(prev => [...prev, newImage]);
        const updatedImages = [...(currentOrder.productImages || []), { name: newImage.name, path: newImage.path, url: newImage.url }];
        updateOrder('productImages', updatedImages);
        toast.success(t('entry.messages.upload_success'), { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error(t('entry.messages.upload_error', { error: err.message }), { id: toastId });
    } finally {
      setUploadingImage(false);
      
      const remaining = pendingImages.slice(1);
      if (remaining.length > 0) {
        setPendingImages(remaining);
        setImageToEdit(remaining[0]);
        setTimeout(() => setIsEditorOpen(true), 500); 
      } else {
        setPendingImages([]);
      }
    }
  };

  const onCancelEdit = () => {
    setIsEditorOpen(false);
    setImageToEdit(null);
    setEditingExistingImageIndex(null);
    
    const remaining = pendingImages.slice(1);
    if (remaining.length > 0) {
      setPendingImages(remaining);
      setImageToEdit(remaining[0]);
      setTimeout(() => setIsEditorOpen(true), 500);
    } else {
      setPendingImages([]);
    }
  };

  const handleEditExistingImage = async (index, imgObj) => {
    try {
      const toastId = toast.loading(t('entry.messages.loading_image'));
      const response = await fetch(imgObj.preview || imgObj.url);
      const blob = await response.blob();
      const ext = imgObj.name.split('.').pop() || 'jpg';
      const file = new File([blob], imgObj.name, { type: blob.type || `image/${ext}` });
      toast.dismiss(toastId);
      
      setPendingImages([]);
      setEditingExistingImageIndex(index);
      setImageToEdit(file);
      setIsEditorOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(t('entry.messages.load_error'));
    }
  };

  const handleRemoveImage = async (index) => {
    if (!window.confirm(t('entry.messages.confirm_delete_image'))) return;
    
    const imgToRemove = productImages[index];
    
    const newImages = [...productImages];
    newImages.splice(index, 1);
    setProductImages(newImages);
    
    const updatedOrderImages = [...(currentOrder.productImages || [])];
    updatedOrderImages.splice(index, 1);
    updateOrder('productImages', updatedOrderImages);

    if (imgToRemove.path) {
      try {
        await supabase.storage.from('product_images').remove([imgToRemove.path]);
        toast.success(t('entry.messages.delete_success_image'));
      } catch (err) {
        console.error('Error removing image:', err);
      }
    }
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
      
      if (nextArr.length === 0) {
        const dist = { ...(currentOrder.colorDistribution || {}) };
        delete dist[colorName];
        updateOrder('colorDistribution', dist);
      }
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
  // updateOrder is provided by context and intentionally excluded to avoid recalculating on every provider render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder.productName, currentOrder.serialNumber, lookups.products]);

  useEffect(() => {
    const totalQty = parseInt(currentOrder.totalQuantity) || 0;
    const packageVal = currentOrder.cartonPackage || '';
    const packageQty = parseInt(packageVal.replace(/[^0-9]/g, '')) || 0;
    
    if (totalQty > 0 && packageQty > 0) {
      if (packageQty > totalQty) {
        if (currentOrder.cartonQty !== t('entry.messages.insufficient_quantity')) {
          updateOrder('cartonQty', t('entry.messages.insufficient_quantity'));
        }
        return;
      }

      const cartons = parseFloat((totalQty / packageQty).toFixed(2));
      const resultText = `${cartons} ${t('entry.units.carton')} × ${packageQty} ${t('entry.units.piece')}`;
      
      if (currentOrder.cartonQty !== resultText) {
        updateOrder('cartonQty', resultText);
      }
    } else if ((!totalQty || !packageQty) && currentOrder.cartonQty) {
      updateOrder('cartonQty', '');
    }
  }, [currentOrder.totalQuantity, currentOrder.cartonPackage, currentOrder.cartonQty, updateOrder, t]);

  const handleSerialChange = async (val) => {
    updateOrder('serialNumber', val);
    if (!val.trim()) {
      setSerialStatus(null);
      return;
    }
    setSerialStatus('checking');
    try {
      const { data } = await supabase
        .from('orders')
        .select('serial_number')
        .eq('serial_number', val)
        .single();
      if (data) {
        setSerialStatus('used');
        return;
      }

      // Check if it exists in old_items as item_code or barcode
      const { data: oldItem } = await supabase
        .from('old_items')
        .select('id')
        .or(`item_code.eq.${val},barcode.eq.${val}`)
        .limit(1);

      if (oldItem && oldItem.length > 0) {
        setSerialStatus('used_in_old');
      } else {
        setSerialStatus('available');
      }
    } catch (err) {
       console.error("Error verifying serial change duplicate:", err);
       setSerialStatus('available');
    }
  };

  const validateForm = () => {
    if (!currentOrder.serialNumber) { toast.error(t('entry.messages.serial_required')); return false; }
    
    const required = [
      { key: 'productName', label: t('entry.buyer.product_name') },
      { key: 'factoryId', label: t('entry.factory.factory_select') }
    ];
    for (const field of required) {
      if (!currentOrder[field.key]) {
        toast.error(t('entry.messages.field_required', { label: field.label }));
        return false;
      }
    }

    if (currentOrder.cartonPackage) {
      const pkgQty = parseInt(currentOrder.cartonPackage.replace(/[^0-9]/g, '')) || 0;
      const totalQty = parseInt(currentOrder.totalQuantity) || 0;
      if (pkgQty > totalQty) {
        toast.error(t('entry.messages.packaging_error', { package: pkgQty, total: totalQty }));
        return false;
      }
    }

    return true;
  };

  const handleSaveNew = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    const toastId = toast.loading(t('entry.messages.saving'));
    try {
      const { data: existing } = await supabase.from('orders').select('id').eq('serial_number', currentOrder.serialNumber).single();
      if (existing) {
         toast.error(t('entry.messages.serial_used_error'), { id: toastId });
         return;
      }

      // Verify in old system items to prevent duplicates
      const { data: oldItem } = await supabase
        .from('old_items')
        .select('id')
        .or(`item_code.eq.${currentOrder.serialNumber},barcode.eq.${currentOrder.serialNumber}`)
        .limit(1);

      if (oldItem && oldItem.length > 0) {
         toast.error(t('entry.messages.serial_used_in_old_error', { defaultValue: 'رقم الموديل هذا موجود في الأصناف القديمة (رقم الصنف أو الباركود) ولا يمكن تكراره!' }), { id: toastId });
         return;
      }

      const orderWithActivity = appendActivity(currentOrder, createActivityItem({
        action: 'create',
        user,
        note: t('activity.notes.created', { serial: currentOrder.serialNumber }),
        changes: summarizeOrderChanges({}, currentOrder)
      }));
      const payload = {
        serial_number: currentOrder.serialNumber,
        order_data: orderWithActivity
      };
      const { error } = await supabase.from('orders').insert([payload]);
      if (error) throw error;
      toast.success(t('entry.messages.save_success', { serial: currentOrder.serialNumber }), { id: toastId });
      await handleClear();
    } catch (err) {
      console.error(err);
      toast.error(t('entry.messages.save_error'), { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!validateForm()) return;
    setIsSaving(true);
    const toastId = toast.loading(t('entry.messages.updating'));
    try {
      if (currentOrder.serialNumber !== originalSerial) {
         // Verify in orders
         const { data: existing } = await supabase.from('orders').select('id').eq('serial_number', currentOrder.serialNumber).single();
         if (existing) {
            toast.error(t('entry.messages.serial_used_error'), { id: toastId });
            setIsSaving(false);
            return;
         }

         // Verify in old system items
         const { data: oldItem } = await supabase
           .from('old_items')
           .select('id')
           .or(`item_code.eq.${currentOrder.serialNumber},barcode.eq.${currentOrder.serialNumber}`)
           .limit(1);

         if (oldItem && oldItem.length > 0) {
            toast.error(t('entry.messages.serial_used_in_old_error', { defaultValue: 'رقم الموديل هذا موجود في الأصناف القديمة (رقم الصنف أو الباركود) ولا يمكن تكراره!' }), { id: toastId });
            setIsSaving(false);
            return;
         }
      }

      const { data: previous } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', originalSerial)
        .single();
      const orderWithActivity = appendActivity(currentOrder, createActivityItem({
        action: 'update',
        user,
        note: t('activity.notes.updated', { serial: currentOrder.serialNumber }),
        changes: summarizeOrderChanges(previous?.order_data, currentOrder),
        meta: { source: 'data-entry', previousSerial: originalSerial },
      }));
      const payload = {
        serial_number: currentOrder.serialNumber,
        order_data: orderWithActivity
      };
      const { error } = await supabase.from('orders').update(payload).eq('serial_number', originalSerial);
      if (error) throw error;
      toast.success(t('entry.messages.update_success', { serial: currentOrder.serialNumber }), { id: toastId });
      await handleClear();
    } catch (err) {
      console.error(err);
      toast.error(t('entry.messages.save_error'), { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsCopy = async () => {
     if (!validateForm()) return;
     
     const newSerial = currentOrder.serialNumber;

     setIsSaving(true);
     const toastId = toast.loading(t('entry.messages.saving'));
     try {
       const { data: existing } = await supabase.from('orders').select('id').eq('serial_number', newSerial).single();
       if (existing) {
          toast.error(t('entry.messages.serial_used_error'), { id: toastId });
          setIsSaving(false);
          return;
       }

       // Verify in old system items
       const { data: oldItem } = await supabase
         .from('old_items')
         .select('id')
         .or(`item_code.eq.${newSerial},barcode.eq.${newSerial}`)
         .limit(1);

       if (oldItem && oldItem.length > 0) {
          toast.error(t('entry.messages.serial_used_in_old_error', { defaultValue: 'رقم الموديل هذا موجود في الأصناف القديمة (رقم الصنف أو الباركود) ولا يمكن تكراره!' }), { id: toastId });
          setIsSaving(false);
          return;
       }

       const newOrderData = appendActivity(
         { ...currentOrder, serialNumber: newSerial, orderNumber: null },
         createActivityItem({
           action: 'copy',
           user,
           note: t('activity.notes.copied', { from: currentOrder.serialNumber, to: newSerial }),
           meta: { source: 'data-entry', copiedFrom: currentOrder.serialNumber },
         })
       );
       const payload = {
         serial_number: newSerial,
         order_data: newOrderData
       };
       const { error } = await supabase.from('orders').insert([payload]);
       if (error) throw error;
       toast.success(t('entry.messages.copy_success', { serial: newSerial }), { id: toastId });
       setCurrentOrder(newOrderData);
       setOriginalSerial(newSerial);
       setIsEditMode(true);
       setAutoFocusLastSize(false);
       window.scrollTo({ top: 0, behavior: 'smooth' });
     } catch (err) {
       console.error(err);
       toast.error(t('entry.messages.save_error'), { id: toastId });
     } finally {
       setIsSaving(false);
     }
  };

  const handleDeleteOrder = async () => {
    if (!window.confirm(t('entry.messages.confirm_delete', { serial: originalSerial }))) return;
    
    setIsSaving(true);
    const toastId = toast.loading(t('entry.messages.deleting'));
    try {
      const { data: previous } = await supabase
        .from('orders')
        .select('order_data')
        .eq('serial_number', originalSerial)
        .single();
      const { error } = await supabase.from('orders').delete().eq('serial_number', originalSerial);
      if (error) throw error;
      const archiveItem = appendActivity(previous?.order_data || currentOrder, createActivityItem({
        action: 'delete',
        user,
        note: t('activity.notes.deleted', { serial: originalSerial }),
        meta: { source: 'data-entry', serial: originalSerial },
      }));
      const deletedArchive = JSON.parse(localStorage.getItem('gh_deleted_activity_archive') || '[]');
      localStorage.setItem('gh_deleted_activity_archive', JSON.stringify([
        { serial_number: originalSerial, order_data: archiveItem, deletedAt: new Date().toISOString() },
        ...deletedArchive,
      ].slice(0, 100)));
      toast.success(t('entry.messages.delete_success', { serial: originalSerial }), { id: toastId });
      await handleClear();
    } catch (err) {
      console.error(err);
      toast.error(t('entry.messages.save_error'), { id: toastId });
    } finally {
      setIsSaving(false);
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
         setTimeout(() => serialSearchRef.current?.focus(), 100);
      }
    } else if (e.key === 'Escape') {
      setShowSerialsList(false);
      setSerialSearchQuery('');
    }
  };

  const handleFetch = async (s) => {
    const searchVal = typeof s === 'string' ? s : document.getElementById('fetchSerialInput')?.value;
    if (!searchVal) {
      toast.error(t('entry.messages.search_hint'));
      return;
    }

    const toastId = toast.loading(t('entry.messages.searching'));
    try {
      const { data, error } = await supabase.from('orders').select('*').ilike('serial_number', searchVal).single();
      if (error || !data) {
        toast.error(t('entry.messages.not_found'), { id: toastId });
        return;
      }
      
      const { data: recData } = await supabase.from('receivings').select('receive_data').ilike('serial_number', searchVal).single();
      const isReceived = recData && recData.receive_data && recData.receive_data.status && typeof recData.receive_data.status === 'string' && (
        recData.receive_data.status.includes('Received') ||
        recData.receive_data.status === 'مستلمة' ||
        recData.receive_data.status === '已收货' ||
        recData.receive_data.status === t('receiving.info.received')
      );
      if (isReceived) {
        toast.error(t('entry.messages.received_already'), { id: toastId, duration: 4000 });
        return;
      }

      const fetchedOrder = data.order_data || data;

      if (user && user.role !== 'admin') {
         const allowedFactories = user.permissions?.allowed_factories || [];
         const allowedCompanies = user.permissions?.allowed_companies || [];
         if (allowedFactories.length > 0 && !allowedFactories.includes(fetchedOrder.factoryId)) {
            toast.error(t('auth.unauthorized_factory'), { id: toastId });
            return;
         }
         if (allowedCompanies.length > 0 && !allowedCompanies.includes(fetchedOrder.buyerCompany)) {
            toast.error(t('auth.unauthorized_company'), { id: toastId });
            return;
         }
      }

      const finalOrder = { ...defaultOrderState, ...fetchedOrder, serialNumber: data.serial_number || fetchedOrder.serialNumber };
      setCurrentOrder(finalOrder);
      setAutoFocusLastSize(false);
      setSelectedColorsArr(Object.keys(finalOrder.colorDistribution || {}));
      setProductImages(finalOrder.productImages?.map(img => ({ ...img, preview: img.preview || img.url })) || []);
      setIsEditMode(true);
      setOriginalSerial(finalOrder.serialNumber);
      toast.success(t('entry.messages.fetch_success', { serial: finalOrder.serialNumber }), { id: toastId });
      if (document.getElementById('fetchSerialInput')) document.getElementById('fetchSerialInput').value = '';
    } catch {
      toast.error(t('entry.messages.save_error'), { id: toastId });
    }
  };

  const handleClear = async () => {
    setProductImages([]);
    setSelectedColorsArr([]);
    setIsEditMode(false);
    setOriginalSerial('');
    setSerialStatus('checking');
    setActiveTab('basic');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    const nextSerial = await fetchNextAvailableSerial();
    const nextOrder = await fetchNextOrderNumber();
    
    setCurrentOrder({ ...defaultOrderState, serialNumber: nextSerial, orderNumber: nextOrder });
    setAutoFocusLastSize(false);
    setSerialStatus('available');
    
    toast.success(t('entry.messages.cleared_success'));
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
    while (newMaterials.length <= index) {
      newMaterials.push({ name: '', percentage: '' });
    }
    
    if (field === 'percentage') {
       const standardValue = value.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
       const valNum = parseFloat(standardValue) || 0;
       
       let otherTotal = 0;
       newMaterials.forEach((m, i) => {
         if (i !== index) otherTotal += (parseFloat(m.percentage) || 0);
       });

       if (otherTotal + valNum > 100) {
         const allowed = 100 - otherTotal;
         newMaterials[index].percentage = allowed > 0 ? allowed.toString() : '0';
         toast.error(t('entry.messages.material_limit_error', { allowed: allowed }));
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

  const distributeQuantity = (colorsArr, isSilent = false, overrideTotalQty) => {
    const totalQty = overrideTotalQty !== undefined ? overrideTotalQty : parseInt(currentOrder.totalQuantity);
    if (!totalQty || isNaN(totalQty)) {
      if (!isSilent) toast.error(t('entry.messages.qty_error'));
      return;
    }
    if (colorsArr.length === 0) {
      if (!isSilent) toast.error(t('entry.messages.select_color_error'));
      return;
    }
    
    let sizes = [];
    const hasManual = currentOrder.manualSizes && currentOrder.manualSizes.length > 0;
    if (hasManual) {
      sizes = currentOrder.manualSizes.filter(s => s && s.trim() !== '');
    } else {
      sizes = lookups.sizes || [];
      if (currentOrder.sizeFrom && currentOrder.sizeTo) {
        const idx1 = sizes.indexOf(currentOrder.sizeFrom);
        const idx2 = sizes.indexOf(currentOrder.sizeTo);
        if (idx1 !== -1 && idx2 !== -1) {
          sizes = sizes.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1);
        }
      }
    }

    if (sizes.length === 0) {
      if (!isSilent) toast.error(t('entry.messages.no_sizes_error'));
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
    if (!isSilent) toast.success(t('entry.messages.distribution_success'));
  };

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
    targetSizes = currentOrder.manualSizes.filter(s => s && s.trim() !== '');
  } else if (currentOrder.sizeFrom && currentOrder.sizeTo) {
    const allSizes = lookups.sizes || [];
    const idx1 = allSizes.indexOf(currentOrder.sizeFrom);
    const idx2 = allSizes.indexOf(currentOrder.sizeTo);
    if (idx1 !== -1 && idx2 !== -1) {
      targetSizes = allSizes.slice(Math.min(idx1, idx2), Math.max(idx1, idx2) + 1);
    }
  }

  const currentTabIdx = TABS.findIndex(t => t.id === activeTab);

  const renderTabContent = (tabId) => {
    const targetTab = tabId || activeTab;
    switch (targetTab) {

      case 'basic':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3><Hash size={22} /> {t('entry.buyer.section_title')}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(212, 175, 55, 0.1)', padding: '0.4rem 1rem', borderRadius: '8px', border: '1px dashed var(--accent-color)' }}>
                   <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('entry.buyer.order_no')}</span>
                   <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{currentOrder.orderNumber || '---'}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.serial_no_manual')}</label>
                   <input 
                    type="text" 
                    className="form-control" 
                    value={currentOrder.serialNumber} 
                    onChange={(e) => handleSerialChange(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch(currentOrder.serialNumber)}
                    data-enter-ignore="true"
                    placeholder={t('entry.buyer.serial_placeholder')} 
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                    <span>
                      {serialStatus === 'checking' && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('entry.buyer.checking')}</span>}
                      {serialStatus === 'used' && <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>{t('entry.buyer.used')}</span>}
                      {serialStatus === 'used_in_old' && <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>{t('entry.buyer.used_in_old', { defaultValue: '⚠️ موجود في الأصناف القديمة!' })}</span>}
                      {serialStatus === 'available' && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 'bold' }}>{t('entry.buyer.available')}</span>}
                    </span>
                    {serialStatus === 'used' && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('entry.buyer.fetch_hint')}</span>}
                  </div>
                  {currentOrder.barcode && (
                    <div style={{ marginTop: '8px', padding: '6px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px dashed var(--accent-color)', borderRadius: '6px', color: 'var(--accent-color)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       {t('entry.buyer.generated_barcode')} <strong style={{ letterSpacing: '2px', fontSize: '1.1rem' }}>{currentOrder.barcode}</strong>
                    </div>
                  )}
                </div>
                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.buyer_code')}</label>
                   <ClearableSelect className="form-control" value={currentOrder.buyerMobile || ''} onChange={(e) => updateOrder('buyerMobile', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.buyer.buyer_code_placeholder')}</option>
                    {lookups.buyerCodes?.map((code, i) => {
                      const val = typeof code === 'object' ? code.name : code;
                      return <option key={i} value={val}>{val}</option>;
                    })}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.buyer_number')}</label>
                  <input type="text" className="form-control" value={currentOrder.buyerNumber || ''} onChange={(e) => updateOrder('buyerNumber', e.target.value)} />
                </div>

                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.company_name')}</label>
                     <select className="form-control" value={currentOrder.buyerCompany || ''} onChange={(e) => updateOrder('buyerCompany', e.target.value)}>
                        <option value="">{t('entry.actions.select_company_placeholder')}</option>
                       {filteredLookups.companies?.map((c, i) => <option key={i} value={typeof c === 'object' ? c.name : c}>{typeof c === 'object' ? c.name : c}</option>)}
                     </select>
                </div>
                {currentOrder.buyerCompany && (() => {
                  const selectedCompanyObj = Array.isArray(lookups.companies) ? lookups.companies.find(c => (c.name === currentOrder.buyerCompany || c === currentOrder.buyerCompany)) : null;
                  if (selectedCompanyObj && (selectedCompanyObj.mobile || selectedCompanyObj.fax || selectedCompanyObj.address)) {
                    return (
                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        {selectedCompanyObj.mobile && (
                          <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('admin.company_mobile') || 'Company Mobile'}</label>
                            <input type="text" className="form-control" value={selectedCompanyObj.mobile} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                          </div>
                        )}
                        {selectedCompanyObj.fax && (
                          <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('admin.company_fax') || 'Company Fax'}</label>
                            <input type="text" className="form-control" value={selectedCompanyObj.fax} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                          </div>
                        )}
                        {selectedCompanyObj.address && (
                          <div className="form-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('admin.company_address') || 'Company Address'}</label>
                            <input type="text" className="form-control" value={selectedCompanyObj.address} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.product_name')}</label>
                   <ClearableSelect className="form-control" value={currentOrder.productName} onChange={(e) => updateOrder('productName', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                     <option value="">{t('entry.buyer.product_name_placeholder')}</option>
                    {lookups.products?.map((p, i) => {
                      const val = typeof p === 'object' ? p.name : p;
                      return <option key={i} value={val}>{val}</option>;
                    })}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                   <label className="form-label">{t('entry.buyer.price_currency')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                     <input type="text" inputMode="decimal" dir="rtl" className="form-control" placeholder={t('entry.buyer.price_placeholder')} style={{ flex: 2, textAlign: 'right' }} value={currentOrder.productPrice || ''} onChange={(e) => updateOrder('productPrice', e.target.value.replace(/[^0-9.]/g, ''))} />
                     <ClearableSelect className="form-control" style={{ flex: 1 }} value={currentOrder.currency || ''} onChange={(e) => updateOrder('currency', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                       <option value="">{t('entry.buyer.currency_placeholder')}</option>
                      {lookups.currencies?.map((c, i) => <option key={i} value={c}>{c}</option>)}
                    </ClearableSelect>
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                   <label className="form-label">{t('entry.buyer.sale_type')}</label>
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
                     }} clearTitle={t('entry.actions.clear_btn')}>
                       <option value="">{t('entry.buyer.sale_type_placeholder')}</option>
                       <option value="تجزئة">{t('entry.buyer.retail')}</option>
                       <option value="جملة">{t('entry.buyer.wholesale')}</option>
                       <option value="جملة وتجزئة">{t('entry.buyer.both')}</option>
                    </ClearableSelect>

                    {currentOrder.saleType === 'تجزئة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('entry.buyer.retail_percentage')}</span>
                          <input type="text" className="form-control" value="100%" readOnly style={{ width: '80px', backgroundColor: 'var(--bg-color)', color: 'var(--accent-color)', fontWeight: 'bold', textAlign: 'center' }} />
                       </div>
                    )}
                    
                    {currentOrder.saleType === 'جملة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('entry.buyer.wholesale_percentage')}</span>
                          <input type="text" className="form-control" value="100%" readOnly style={{ width: '80px', backgroundColor: 'var(--bg-color)', color: 'var(--accent-color)', fontWeight: 'bold', textAlign: 'center' }} />
                       </div>
                    )}

                    {currentOrder.saleType === 'جملة وتجزئة' && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{t('entry.buyer.wholesale')} %:</span>
                             <input type="number" min="0" max="100" className="form-control" placeholder={t('entry.buyer.example', { value: 60 })} 
                               style={{ width: '100px' }}
                               value={currentOrder.wholesalePercentage || ''} 
                               onChange={(e) => {
                                  let val = e.target.value;
                                  let num = parseInt(val) || 0;
                                  let other = parseInt(currentOrder.retailPercentage) || 0;
                                  if (num + other > 100) {
                                     toast.error(t('entry.messages.material_limit_error', { allowed: 100 - other }));
                                     return;
                                  }
                                  updateOrder('wholesalePercentage', val);
                               }} 
                             />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{t('entry.buyer.retail')} %:</span>
                             <input type="number" min="0" max="100" className="form-control" placeholder={t('entry.buyer.example', { value: 40 })} 
                               style={{ width: '100px' }}
                               value={currentOrder.retailPercentage || ''}
                               onChange={(e) => {
                                  let val = e.target.value;
                                  let num = parseInt(val) || 0;
                                  let other = parseInt(currentOrder.wholesalePercentage) || 0;
                                  if (num + other > 100) {
                                     toast.error(t('entry.messages.material_limit_error', { allowed: 100 - other }));
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
                    {t('entry.buyer.product_images')}
                  </label>
                  
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
                      {t('entry.buyer.gallery_upload')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploadingImage}
                      style={{ flex: 1, borderColor: 'rgba(212, 175, 55, 0.3)', gap: '0.5rem' }}
                    >
                      <Camera size={18} />
                      {t('entry.buyer.camera_upload')}
                    </button>
                  </div>

                  {uploadingImage && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--accent-color)', fontSize: '0.9rem' }}>
                      <div style={{ width: '28px', height: '28px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.5rem' }}></div>
                      {t('entry.buyer.uploading')}
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
                            title={t('entry.actions.delete_btn')}
                          >
                            <X size={14} />
                          </button>
                          <button
                            onClick={() => handleEditExistingImage(idx, img)}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '34px',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.9)',
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
                            title={t('entry.actions.edit_image')}
                          >
                            <Edit3 size={14} />
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
                      {t('entry.buyer.no_images')}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('entry.buyer.remarks')}</label>
                  <textarea className="form-control" rows="3" placeholder={t('entry.buyer.remarks_placeholder')} value={currentOrder.remarks || ''} onChange={(e) => updateOrder('remarks', e.target.value)}></textarea>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{t('entry.buyer.contract_notes')}</label>
                  <textarea className="form-control" rows="2" placeholder={t('entry.buyer.contract_notes_placeholder')} value={currentOrder.contractNotes || ''} onChange={(e) => updateOrder('contractNotes', e.target.value)}></textarea>
                </div>
              </div>
              <hr style={{ margin: '2rem 0', borderColor: 'rgba(212, 175, 55, 0.15)', borderWidth: '1px', borderStyle: 'dashed' }} />
              
              <div className="sub-section-header" style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', margin: 0, fontSize: '1.05rem', fontWeight: '600' }}>
                  <Calendar size={18} /> {t('entry.dates.section_title')}
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <CustomDateInput 
                  label={t('entry.dates.request_date')} 
                  value={currentOrder.requestDate} 
                  onChange={(val) => {
                    updateOrder('requestDate', val);
                    // If delivery date is now before request date, clear it or adjust it
                    if (currentOrder.deliveryDate && val && currentOrder.deliveryDate < val) {
                      updateOrder('deliveryDate', '');
                      toast(t('entry.messages.delivery_date_reset'), { icon: 'ℹ️' });
                    }
                  }} 
                />
                <CustomDateInput 
                  label={t('entry.dates.delivery_date')} 
                  value={currentOrder.deliveryDate} 
                  onChange={(val) => updateOrder('deliveryDate', val)} 
                  min={currentOrder.requestDate}
                />
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('entry.dates.total_quantity')}</label>
                  <input type="text" inputMode="numeric" dir="rtl" className="form-control" style={{ textAlign: 'right' }} value={currentOrder.totalQuantity || ''} onChange={(e) => updateOrder('totalQuantity', e.target.value.replace(/[^0-9]/g, ''))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {hasManual ? t('entry.dates.custom_sizes') : t('entry.dates.size_range')}
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
                        {t('entry.dates.size_selected_count', { count: targetSizes.length })}
                      </span>
                    )}
                  </div>

                  {!hasManual ? (
                    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('entry.dates.from')}</label>
                        <ClearableSelect className="form-control" value={currentOrder.sizeFrom || ''} onChange={(e) => {
                          const newVal = e.target.value;
                          if (newVal === 'MANUAL_TRIGGER') {
                             setAutoFocusLastSize(true);
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
                        }} clearTitle={t('entry.actions.clear_btn')}>
                          <option value="">{t('entry.dates.select_size_placeholder')}</option>
                          <option value="MANUAL_TRIGGER" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{t('entry.dates.manual_trigger')}</option>
                          {lookups.sizes?.map((s, i) => <option key={i} value={s}>{s}</option>)}
                        </ClearableSelect>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('entry.dates.to')}</label>
                        <ClearableSelect className="form-control" value={currentOrder.sizeTo || ''} onChange={(e) => {
                          const newVal = e.target.value;
                          if (newVal === 'MANUAL_TRIGGER') {
                             setAutoFocusLastSize(true);
                             updateOrder('manualSizes', [...(currentOrder.manualSizes || []), '']);
                             return;
                          }
                          updateOrder('sizeTo', newVal);
                        }} clearTitle={t('entry.actions.clear_btn')}>
                          <option value="">{t('entry.dates.select_size_placeholder')}</option>
                          <option value="MANUAL_TRIGGER" style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{t('entry.dates.manual_trigger')}</option>
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
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{t('entry.dates.manual_sizes_active')}</span>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-outline"
                        style={{ padding: '4px 12px', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                        onClick={() => {
                          updateOrder('manualSizes', []);
                          toast(t('entry.dates.cancel_manual'), { icon: '🔄' });
                        }}
                      >
                        {t('entry.dates.cancel_manual')}
                      </button>
                    </div>
                  )}
                </div>

                {/* ═══ Manual Sizes Section ═══ */}
                {hasManual && (
                  <div className="form-group fade-in" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Edit3 size={16} color="var(--accent-color)" />
                      {t('entry.dates.custom_sizes')}
                    </label>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      {(currentOrder.manualSizes || []).map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ width: '100px', textAlign: 'center', border: '1px solid var(--accent-color)' }}
                            value={s}
                            autoFocus={autoFocusLastSize && idx === (currentOrder.manualSizes?.length - 1)}
                            onFocus={() => setAutoFocusLastSize(false)}
                            placeholder={t('entry.dates.size_placeholder')}
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
                          setAutoFocusLastSize(true);
                          updateOrder('manualSizes', [...(currentOrder.manualSizes || []), '']);
                        }}
                      >
                        {t('entry.dates.add_another_size')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'fabrics_factory':
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header">
                <h3><Scissors size={22} /> {t('entry.fabrics.section_title')}</h3>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('entry.fabrics.fabric_type')}</label>
                  <ClearableSelect className="form-control" value={currentOrder.productFabric || ''} onChange={(e) => updateOrder('productFabric', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.fabrics.select_fabric_placeholder')}</option>
                    {lookups.fabrics?.map((f, i) => <option key={i} value={f}>{f}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('entry.fabrics.trade_mark')}</label>
                  <ClearableSelect className="form-control" value={currentOrder.tradeMark || ''} onChange={(e) => updateOrder('tradeMark', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.fabrics.select_trademark_placeholder')}</option>
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
                      <label className="form-label">{t('entry.fabrics.material')} {num}</label>
                      <div 
                        style={{ display: 'flex', gap: '0.5rem' }}
                        onClickCapture={(e) => {
                          if (isLocked) {
                            e.preventDefault();
                            e.stopPropagation();
                            toast.error(t('entry.messages.material_limit_error', { allowed: 0 }));
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
                          clearTitle={t('entry.actions.clear_btn')}
                        >
                          <option value="">{t('entry.fabrics.select_material_placeholder')}</option>
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
              <hr style={{ margin: '2rem 0', borderColor: 'rgba(212, 175, 55, 0.15)', borderWidth: '1px', borderStyle: 'dashed' }} />
              
              <div className="sub-section-header" style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', margin: 0, fontSize: '1.05rem', fontWeight: '600' }}>
                  <Box size={18} /> {t('entry.factory.section_title')}
                </h4>
              </div>
              <div className="form-group">
                <label className="form-label">{t('entry.factory.factory_select')}</label>
                <ClearableSelect className="form-control" value={currentOrder.factoryId || ''} onChange={(e) => updateOrder('factoryId', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                  <option value="">{t('entry.factory.factory_placeholder')}</option>
                  {filteredLookups.factories?.map((f, i) => <option key={i} value={f.name || f}>{f.name || f}</option>)}
                </ClearableSelect>
              </div>
              {currentOrder.factoryId && (() => {
                const selectedFactoryObj = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === currentOrder.factoryId || f === currentOrder.factoryId)) : null;
                if (selectedFactoryObj && (selectedFactoryObj.mobile || selectedFactoryObj.code)) {
                  return (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      {selectedFactoryObj.code && (
                        <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('entry.factory.factory_code')}</label>
                          <input type="text" className="form-control" value={selectedFactoryObj.code} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed', color: 'var(--accent-color)', fontWeight: 'bold' }} />
                        </div>
                      )}
                      {selectedFactoryObj.mobile && (
                        <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('entry.factory.factory_mobile')}</label>
                          <input type="text" className="form-control" value={selectedFactoryObj.mobile} readOnly style={{ backgroundColor: 'var(--bg-color)', opacity: 0.8, borderStyle: 'dashed' }} />
                        </div>
                      )}
                      {selectedFactoryObj.address && (
                        <div className="form-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('entry.factory.factory_address')}</label>
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
                  <label className="form-label">{t('entry.factory.carton_package')}</label>
                  <ClearableSelect className="form-control" value={currentOrder.cartonPackage || ''} onChange={(e) => {
                    const val = e.target.value;
                    const pkgQty = parseInt(val.replace(/[^0-9]/g, '')) || 0;
                    const totQty = parseInt(currentOrder.totalQuantity) || 0;
                    if (val && pkgQty > totQty) {
                      toast.error(t('entry.messages.packaging_error', { package: pkgQty, total: totQty }));
                      return;
                    }
                    updateOrder('cartonPackage', val);
                  }} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.buyer.sale_type_placeholder')}</option>
                    {lookups.cartonPackages?.map((cp, i) => <option key={i} value={cp}>{cp}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('entry.factory.carton_quantity')}</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={currentOrder.cartonQty || ''} 
                    readOnly 
                    style={{ backgroundColor: 'var(--surface-highlight)', color: 'var(--accent-color)', fontWeight: 'bold' }} 
                    placeholder={t('entry.factory.auto_calc_placeholder')} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('entry.factory.carton_size')}</label>
                  <ClearableSelect className="form-control" value={currentOrder.cartonSize || ''} onChange={(e) => updateOrder('cartonSize', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.buyer.sale_type_placeholder')}</option>
                    {lookups.cartonSizes?.map((cs, i) => <option key={i} value={cs}>{cs}</option>)}
                  </ClearableSelect>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('entry.factory.plastic_bag_size')}</label>
                  <ClearableSelect className="form-control" value={currentOrder.plasticBagSize || ''} onChange={(e) => updateOrder('plasticBagSize', e.target.value)} clearTitle={t('entry.actions.clear_btn')}>
                    <option value="">{t('entry.buyer.sale_type_placeholder')}</option>
                    {lookups.plasticBagSizes?.map((pb, i) => <option key={i} value={pb}>{pb}</option>)}
                  </ClearableSelect>
                </div>
              </div>
            </div>
          </div>
        );

      case 'colors_sizes': {
        const sizesReady = (currentOrder.sizeFrom && currentOrder.sizeTo) || (currentOrder.manualSizes && currentOrder.manualSizes.some(s => s.trim() !== ''));
        const productObj = lookups.products?.find(p => (typeof p === 'object' ? p.name : p) === currentOrder.productName);
        const partsList = (productObj && productObj.parts && productObj.parts.length > 0) 
            ? productObj.parts : [currentOrder.productName];
        return (
          <div className="tab-panel" key={tabKey}>
            <div className="card">
              <div className="tab-section-header" style={{ justifyContent: 'space-between' }}>
                <h3><Palette size={22} /> {t('entry.colors.section_title')}</h3>
                {selectedColorsArr.length > 0 && sizesReady && (
                  <button className="btn btn-primary" onClick={divideQuantityEqually} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                    <LayoutGrid size={16} /> {t('entry.colors.divide_equally')}
                  </button>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '0.5rem' }}>
                    <Palette size={16} style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }} />
                    {t('entry.colors.select_colors')}
                  </label>
                  <div ref={colorPickerRef} style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '400px' }}>
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
                      <span>{selectedColorsArr.length > 0 ? t('entry.colors.color_selected_count', { count: selectedColorsArr.length }) : t('entry.colors.select_colors_placeholder')}</span>
                      <ChevronLeft size={16} style={{ transform: showColorPicker ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                    </button>
                    {showColorPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                        marginTop: '4px', padding: '0.5rem',
                        backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        maxHeight: '260px', overflowY: 'auto'
                      }}>
                        {lookups.colors?.length > 0 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              const allNames = lookups.colors.map(c => c.name || c);
                              setSelectedColorsArr(allNames);
                              toast.success(t('entry.messages.all_colors_selected', { count: allNames.length }));
                            }}
                            style={{
                              padding: '0.6rem', marginBottom: '0.5rem', textAlign: 'center',
                              background: 'rgba(212, 175, 55, 0.1)', border: '1px dashed var(--accent-color)',
                              borderRadius: '8px', cursor: 'pointer', color: 'var(--accent-color)',
                              fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)'}
                          >
                            {t('entry.colors.select_all')}
                          </div>
                        )}
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
                          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('entry.colors.no_colors_saved')}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
                          }} title={t('entry.actions.delete_btn')}>
                            <X size={13} strokeWidth={3} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedColorsArr.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                  <Palette size={40} style={{ opacity: 0.25, display: 'block', margin: '0 auto 0.75rem' }} />
                  {t('entry.colors.no_colors_selected_hint')}
                </div>
              ) : !sizesReady ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                  <Ruler size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 0.75rem' }} />
                  {t('entry.colors.select_range_hint')}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(400, selectedColorsArr.length * 100 + 200) + 'px' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)', minWidth: '100px' }}>
                          {t('entry.colors.size')}
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
                          {t('entry.colors.total_per_size')}
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
                      <tr style={{ borderTop: '2px solid var(--accent-color)', backgroundColor: 'var(--surface-highlight)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{t('entry.colors.total_per_color')}</td>
                        {selectedColorsArr.map((colorName, cIdx) => (
                          <td key={cIdx} style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '1.05rem' }}>
                            {targetSizes.reduce((sum, size) => sum + (parseInt(currentOrder.colorDistribution?.[colorName]?.[size]) || 0), 0)}
                          </td>
                        ))}
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '900', color: 'var(--text-strong)', fontSize: '1.15rem', backgroundColor: 'rgba(212, 175, 55, 0.1)' }}>
                          {selectedColorsArr.reduce((total, cn) => total + targetSizes.reduce((sum, s) => sum + (parseInt(currentOrder.colorDistribution?.[cn]?.[s]) || 0), 0), 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <hr style={{ margin: '2rem 0', borderColor: 'rgba(212, 175, 55, 0.15)', borderWidth: '1px', borderStyle: 'dashed' }} />
              
              <div className="sub-section-header" style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', margin: 0, fontSize: '1.05rem', fontWeight: '600' }}>
                  <Ruler size={18} /> {t('entry.measurements.section_title')}
                </h4>
              </div>

              {!currentOrder.productName ? (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <Ruler size={48} color="var(--accent-color)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>{t('entry.measurements.no_product_selected')}</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{t('entry.measurements.no_product_hint')}</p>
                </div>
              ) : (
                partsList.map((partName, pIdx) => {
                  const partMeasurements = (lookups.measurements || []).filter(m => {
                     if (typeof m === 'object' && m.part) {
                        return m.part.split('،').map(p => p.trim()).includes(partName.trim()); 
                     }
                     return false;
                  }).map(m => typeof m === 'object' ? m.name : m);

                  return (
                    <div key={pIdx} style={{ marginBottom: pIdx < partsList.length - 1 ? '1.5rem' : 0 }}>
                      <div style={{ marginBottom: '0.75rem', fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📍</span> {partName}
                      </div>
                    <div style={{ overflowX: 'auto', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--border-color)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--surface-highlight)', width: '200px' }}>{t('entry.measurements.size_name')}</th>
                            {targetSizes.map((s, i) => (
                              <th key={i} style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--surface-highlight)' }}>{s}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {partMeasurements.length === 0 && (
                            <tr><td colSpan={targetSizes.length + 1} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>{t('entry.measurements.no_measurements_hint', { part: partName })}</td></tr>
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
              })
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
                <h3><CheckSquare size={22} /> {t('entry.packaging.section_title')}</h3>
              </div>
              
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '0.5rem' }}>
                    <CheckSquare size={16} style={{ verticalAlign: 'middle', marginLeft: '0.4rem' }} />
                    {t('entry.packaging.select_conditions')}
                  </label>
                  <div ref={packagingPickerRef} style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '400px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!showPackagingPicker) {
                          setTempPackagingConditions({ ...(currentOrder.packagingConditions || {}) });
                          setPackagingSearchQuery('');
                        }
                        setShowPackagingPicker(prev => !prev);
                      }}
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
                      <span>{selectedConditions.length > 0 ? t('entry.packaging.conditions_selected_count', { count: selectedConditions.length, defaultValue: `تم اختيار ${selectedConditions.length} شرط` }) : t('entry.packaging.select_conditions_placeholder', { defaultValue: 'اختر الشروط المطلوبة...' })}</span>
                      <ChevronLeft size={16} style={{ transform: showPackagingPicker ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.6 }} />
                    </button>
                    {showPackagingPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 100,
                        marginTop: '4px', padding: '0.75rem',
                        backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        maxHeight: '340px', overflowY: 'auto'
                      }}>
                        {/* Search filter input inside dropdown */}
                        <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                          <input
                            type="text"
                            placeholder={t('entry.packaging.search_placeholder', { defaultValue: 'البحث في الشروط المطلوبة...' })}
                            value={packagingSearchQuery}
                            onChange={(e) => setPackagingSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem 2rem 0.5rem 0.75rem',
                              fontSize: '0.9rem',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm, 6px)',
                              backgroundColor: 'var(--bg-color)',
                              color: 'var(--text-main)',
                              outline: 'none',
                              textAlign: 'right',
                              direction: 'rtl'
                            }}
                          />
                          <Search size={15} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        </div>

                        <div style={{ 
                          maxHeight: '180px', 
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem'
                        }}>
                          {(() => {
                            const filtered = (lookups.packagingConditionsList || []).filter(cond => {
                              const condName = typeof cond === 'object' ? cond.name : cond;
                              return condName.toLowerCase().includes(packagingSearchQuery.toLowerCase());
                            });
                            if (filtered.length > 0) {
                              return filtered.map((cond, i) => {
                                const condName = typeof cond === 'object' ? cond.name : cond;
                                const isChecked = !!tempPackagingConditions[condName];
                                return (
                                  <div
                                    key={i}
                                    onClick={() => setTempPackagingConditions(prev => ({ ...prev, [condName]: !isChecked }))}
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
                                      {condName}
                                    </span>
                                  </div>
                                );
                              });
                            }
                            return (
                              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {t('entry.packaging.no_matching_conditions', { defaultValue: 'لا توجد شروط مطابقة للبحث' })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Confirmation and Clear Action Buttons */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'flex-end', 
                          gap: '0.5rem', 
                          borderTop: '1px solid var(--border-color)', 
                          paddingTop: '0.75rem',
                          marginTop: '0.75rem'
                        }}>
                          <button 
                            type="button"
                            onClick={() => setTempPackagingConditions({})}
                            className="btn"
                            style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                          >
                            {t('entry.packaging.clear_all', { defaultValue: 'مسح الكل' })}
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              updateOrder('packagingConditions', tempPackagingConditions);
                              setShowPackagingPicker(false);
                              toast.success(t('entry.packaging.conditions_updated', { defaultValue: 'تم تحديث الشروط المختارة' }));
                            }}
                            className="btn btn-accent"
                            style={{ 
                              padding: '0.35rem 1.2rem', 
                              fontSize: '0.8rem',
                              backgroundColor: 'var(--accent-color)',
                              color: '#000',
                              fontWeight: 'bold'
                            }}
                          >
                            {t('entry.packaging.ok_btn', { defaultValue: 'موافق' })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

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
                        }} title={t('entry.actions.delete_btn')}>
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
                  {t('entry.packaging.no_conditions_hint')}
                </div>
              )}
            </div>
          </div>
        );
      }



      default:
        return null;
    }
  };


  return (
    <div className="wizard-tabs-container">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }} className="fade-in">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('entry.actions.date_label')}</label>
            <input type="text" className="form-control" value={new Date().toLocaleDateString('en-GB')} readOnly style={{ width: '120px', backgroundColor: 'var(--surface-highlight)', opacity: 0.8 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('entry.actions.fetch_serial_label')}</label>
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input 
                type="text" 
                id="fetchSerialInput" 
                className="form-control" 
                placeholder={t('entry.actions.fetch_placeholder')} 
                style={{ width: '210px' }} 
                onKeyDown={handleF9Press}
                autoComplete="off"
              />
              <button
                className="inline-f9-btn"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const input = document.getElementById('fetchSerialInput');
                  if (input) {
                    input.focus();
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', code: 'F9', keyCode: 120, bubbles: true, cancelable: true }));
                  }
                }}
              >
                <Search size={15} strokeWidth={2.5} />
                F9
              </button>
              <button className="btn btn-primary" onClick={handleFetch} style={{ padding: '0.5rem 1rem' }}>{t('entry.actions.fetch_btn')}</button>
              <button
                className="btn"
                onClick={() => {
                  if (window.confirm(t('entry.messages.confirm_clear'))) {
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
                <RefreshCw size={15} /> {t('entry.actions.clear_btn')}
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
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('entry.actions.select_saved_model')}</span>
                      <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                         <X size={16} />
                      </button>
                  </div>
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                    <input
                      ref={serialSearchRef}
                      type="text"
                      placeholder={t('entry.actions.search_serial_placeholder')}
                      value={serialSearchQuery}
                      onChange={(e) => setSerialSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowSerialsList(false);
                          setSerialSearchQuery('');
                        }
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
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      autoComplete="off"
                    />
                  </div>
                  {fetchingSerials ? (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.fetching')}</div>
                  ) : (
                     (() => {
                       const filteredSerials = serialSearchQuery.trim()
                         ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
                         : availableSerials;
                       return filteredSerials.length === 0 ? (
                         <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                           {availableSerials.length === 0 ? t('entry.actions.no_saved_models') : t('entry.actions.no_match')}
                         </div>
                       ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {filteredSerials.map(serial => {
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
          title={viewMode === 'tabs' ? t('entry.actions.view_full_page') : t('entry.actions.view_tabs')}
        >
          {viewMode === 'tabs' ? (
            <><Layers size={17} /> {t('entry.actions.view_full_page')}</>
          ) : (
            <><PanelTop size={17} /> {t('entry.actions.view_tabs')}</>
          )}
        </button>
      </div>

      {viewMode === 'tabs' ? (
        <>
          <div style={{ position: 'relative' }}>
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
                  background: 'linear-gradient(to right, var(--surface-color) 60%, transparent)',
                  color: 'var(--accent-color)',
                  borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.width = '52px'}
                onMouseLeave={e => e.currentTarget.style.width = '44px'}
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
                  background: 'linear-gradient(to left, var(--surface-color) 60%, transparent)',
                  color: 'var(--accent-color)',
                  borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.width = '52px'}
                onMouseLeave={e => e.currentTarget.style.width = '44px'}
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          <div className="tab-progress">
            {TABS.map((tab, i) => (
              <div
                key={tab.id}
                className={`tab-progress-dot ${activeTab === tab.id ? 'active' : i < currentTabIdx ? 'completed' : ''}`}
              />
            ))}
          </div>

          <div className="tab-content-wrapper">
            <div style={{ 
              pointerEvents: (isEditMode && !hasPermission('entry', 'edit')) || (!isEditMode && !hasPermission('entry', 'add')) ? 'none' : 'auto', 
              opacity: (isEditMode && !hasPermission('entry', 'edit')) || (!isEditMode && !hasPermission('entry', 'add')) ? 0.7 : 1 
            }}>
              {renderTabContent()}
            </div>

            <div className="tab-nav-arrows">
              <button className="tab-nav-arrow" onClick={goPrev} disabled={currentTabIdx === 0}>
                <ChevronRight size={18} />
                {currentTabIdx > 0 ? TABS[currentTabIdx - 1].label : t('entry.actions.prev')}
              </button>
              <button className="tab-nav-arrow" onClick={goNext} disabled={currentTabIdx === TABS.length - 1}>
                {currentTabIdx < TABS.length - 1 ? TABS[currentTabIdx + 1].label : t('entry.actions.next')}
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="tab-content-wrapper fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            padding: '0.75rem 1rem',
            background: 'var(--glass-bg)',
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

          {TABS.map((tab) => (
            <div key={tab.id} id={`scroll-section-${tab.id}`} style={{ 
              scrollMarginTop: '5rem',
              pointerEvents: (isEditMode && !hasPermission('entry', 'edit')) || (!isEditMode && !hasPermission('entry', 'add')) ? 'none' : 'auto', 
              opacity: (isEditMode && !hasPermission('entry', 'edit')) || (!isEditMode && !hasPermission('entry', 'add')) ? 0.7 : 1 
            }}>
              {renderTabContent(tab.id)}
            </div>
          ))}
        </div>
      )}

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
            {t('entry.actions.edit_mode_banner', { serial: originalSerial })}
          </span>
          <button
            className="btn btn-outline"
            onClick={handleClear}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(212, 175, 55, 0.3)' }}
          >
            <X size={14} /> {t('entry.actions.cancel_edit')}
          </button>
        </div>
      )}

      <div className="wizard-bottom-bar">
        <button
          className="btn"
          disabled={isSaving}
          style={{
            flex: 1, maxWidth: '200px', fontSize: '0.95rem', padding: '0.9rem',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none', color: '#fff', fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.2s',
            opacity: isSaving ? 0.5 : 1,
            cursor: isSaving ? 'not-allowed' : 'pointer'
          }}
          onClick={() => {
            if (window.confirm(t('entry.messages.confirm_clear'))) {
              handleClear();
            }
          }}
          onMouseEnter={(e) => {
            if (isSaving) return;
            e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            if (isSaving) return;
            e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <RefreshCw size={18} /> {t('entry.actions.clear_btn')}
        </button>

        {isEditMode ? (
          <>
            {hasPermission('entry', 'delete') && (
              <button
                className="btn btn-outline"
                disabled={isSaving}
                style={{ flex: 1, maxWidth: '180px', fontSize: '0.95rem', padding: '0.9rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                onClick={handleDeleteOrder}
              >
                <Trash2 size={18} /> {t('entry.actions.delete_btn')}
              </button>
            )}
            
            {hasPermission('entry', 'add') && (
              <button
                className="btn"
                disabled={isSaving}
                style={{ flex: 1.5, maxWidth: '250px', fontSize: '1rem', padding: '0.9rem', backgroundColor: '#3b82f6', color: '#fff', fontWeight: 'bold', opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                onClick={handleSaveAsCopy}
              >
                <Copy size={18} /> {t('entry.actions.save_as_copy')}
              </button>
            )}
            
            {hasPermission('entry', 'edit') && (
              <button
                className="btn btn-primary"
                disabled={isSaving}
                style={{ flex: 2, maxWidth: '350px', fontSize: '1.1rem', padding: '0.9rem', fontWeight: 'bold', opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                onClick={handleUpdate}
              >
                <Save size={20} /> {t('entry.actions.update_btn', { serial: originalSerial })}
              </button>
            )}
          </>
        ) : (
          hasPermission('entry', 'add') && (
            <button
              className="btn btn-primary"
              disabled={isSaving}
              style={{ flex: 3, maxWidth: '600px', fontSize: '1.15rem', padding: '1rem', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)', opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
              onClick={handleSaveNew}
            >
              <Save size={22} /> {t('entry.actions.save_btn')}
            </button>
          )
        )}
      </div>

      <ImageEditorModal 
        isOpen={isEditorOpen}
        imageFile={imageToEdit}
        onSave={onSaveEditedImage}
        onCancel={onCancelEdit}
      />
    </div>
  );
};

export default DataEntryWizard;
