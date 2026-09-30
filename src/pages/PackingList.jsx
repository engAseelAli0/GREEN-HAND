import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Printer, Plus, Trash2, Search, Package, Layers, AlertCircle, X, FileSpreadsheet, Save, History, Copy, RefreshCw, ExternalLink } from 'lucide-react';
import { englishOnly } from '../utils/textUtils';
import { normalizeImageUrl } from '../utils/imageUtils';
import toast from 'react-hot-toast';
import { CustomDateInput } from '../components/CustomDateInput';
import { useFilteredLookups } from '../hooks/useFilteredLookups';
import { isOrderAllowedForUser } from '../utils/permissionUtils';
import { logAuditEvent } from '../utils/auditLogger';

const createPackingId = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
);

const createEmptyPackage = () => ({
  id: createPackingId(),
  cartonNo: '',
  cartonQty: '',
  packingKind: 'Pcs',
  qtyPerCarton: ''
});

const createEmptyPackingRow = () => ({
  id: createPackingId(),
  serial: '',
  desc: '',
  details: '',
  image: '',
  packages: [createEmptyPackage()],
  factoryCode: ''
});

const createEmptyPackingFooter = () => ({ containerNo: '', sealNo: '' });

const packingStateSignature = (header, packingRows, groups, footer, includeImages) => JSON.stringify({
  headerInfo: header,
  rows: packingRows,
  mixedGroups: groups,
  footerInfo: footer,
  showImageColumn: includeImages
});

const toEnglishNumbers = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};

const PackingList = () => {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [headerInfo, setHeaderInfo] = useState({
    companyName: 'ARABIAN FRIENDSHIP TRADING CO.,LIMITED',
    tel: 'Tel:(8620)-83265754',
    fax: 'FAX:(8620)-83265204',
    invoiceNo: '',
    customerName: '',
    date: localDate
  });

  const filteredLookups = useFilteredLookups();
  const companies = useMemo(() => filteredLookups?.companies || [], [filteredLookups?.companies]);
  const factories = filteredLookups?.factories || [];
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin' && companies.length > 0) {
      const currentAllowed = companies.some(c => (c.name || c) === headerInfo.companyName);
      if (!currentAllowed) {
        const comp = companies[0];
        // Synchronize the selected company with the user's allowed scope.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHeaderInfo(prev => ({
          ...prev,
          companyName: comp.name || '',
          fax: comp.fax ? `FAX:${comp.fax} ` : '',
          tel: comp.mobile ? `Tel:${comp.mobile} ` : ''
        }));
      }
    }
  }, [companies, user, headerInfo.companyName]);

  const [rows, setRows] = useState([createEmptyPackingRow()]);

  const [mixedGroups, setMixedGroups] = useState([]);

  const [footerInfo, setFooterInfo] = useState(createEmptyPackingFooter);

  const isExporting = false;
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [showImageColumn, setShowImageColumn] = useState(false);

  // F9 States
  const [showSerialsList, setShowSerialsList] = useState(false);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [activeF9RowId, setActiveF9RowId] = useState(null);
  const [f9Position, setF9Position] = useState({ top: 0, left: 0 });
  const serialSearchRef = useRef(null);

  // Validation States
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [invalidSerials, setInvalidSerials] = useState([]);
  const [pendingFetchOptions, setPendingFetchOptions] = useState(null);
  const [highlightedSerials, setHighlightedSerials] = useState([]);

  // Clear Confirm State
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Saved packing lists state
  const [currentPackingList, setCurrentPackingList] = useState(null);
  const [savedPackingSignature, setSavedPackingSignature] = useState(null);
  const [isSavingPackingList, setIsSavingPackingList] = useState(false);
  const [showPackingBrowser, setShowPackingBrowser] = useState(false);
  const [savedPackingLists, setSavedPackingLists] = useState([]);
  const [packingSearch, setPackingSearch] = useState('');
  const [isLoadingPackingLists, setIsLoadingPackingLists] = useState(false);

  const hasMeaningfulPackingData = Boolean(
    headerInfo.invoiceNo?.trim()
    || rows.some(row => row.serial?.trim() || row.desc?.trim())
    || mixedGroups.some(group => group.items?.some(item => item.serial?.trim()))
    || Object.values(footerInfo).some(value => String(value || '').trim())
  );
  const currentPackingSignature = packingStateSignature(headerInfo, rows, mixedGroups, footerInfo, showImageColumn);
  const hasUnsavedPackingChanges = savedPackingSignature === null
    ? hasMeaningfulPackingData
    : currentPackingSignature !== savedPackingSignature;

  const clearAllData = () => {
    const nextHeader = { ...headerInfo, invoiceNo: '', customerName: '', date: localDate };
    const nextRows = [createEmptyPackingRow()];
    const nextFooter = createEmptyPackingFooter();
    setRows(nextRows);
    setMixedGroups([]);
    setHeaderInfo(nextHeader);
    setFooterInfo(nextFooter);
    setShowImageColumn(false);
    setCurrentPackingList(null);
    setSavedPackingSignature(packingStateSignature(nextHeader, nextRows, [], nextFooter, false));
    setShowClearConfirm(false);
    toast.success(t('shipping.messages.clear_success'));
  };

  // Auto-calculate Totals Handlers
  const addRow = () => {
    setRows(prev => [...prev, createEmptyPackingRow()]);
  };

  const removeRow = (id) => {
    if (rows.length === 1 && mixedGroups.length === 0) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleRowChange = (id, field, value) => {
    let finalValue = value;
    if (field === 'serial') {
        finalValue = toEnglishNumbers(value);
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
  };

  const handlePackageChange = (rowId, pkgId, field, value) => {
    let finalValue = value;
    if (['cartonQty', 'qtyPerCarton'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, packages: r.packages.map(p => p.id === pkgId ? { ...p, [field]: finalValue } : p) };
      }
      return r;
    }));
  };

  // Mixed groups are explicitly recorded in receiving data and remain read-only here.

  const handleSerialKeyDown = async (e, rowId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow();
      setTimeout(() => {
        const inputs = document.querySelectorAll('.serial-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 50);
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (showSerialsList || fetchingSerials) return;
      
      const rect = e.target.getBoundingClientRect();
      let popupLeft = rect.left + (rect.width / 2);
      if (popupLeft < 125) popupLeft = 125;
      if (popupLeft > window.innerWidth - 125) popupLeft = window.innerWidth - 125;
      setF9Position({ top: rect.bottom + 4, left: popupLeft });
      
      setActiveF9RowId(rowId);
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
      setActiveF9RowId(null);
    }
  };

  const validateBeforeFetch = async (withImage) => {
      setShowFetchDialog(false);
      const serialsToCheck = rows.map(r => r.serial.trim()).filter(Boolean);
      
      if (serialsToCheck.length === 0) {
          return toast.error(t('shipping.messages.enter_serials_first'));
      }

      const toastId = toast.loading(t('shipping.messages.checking_status'));
      let invalidItems = [];

      try {
          const querySerials = [];
          serialsToCheck.forEach(s => {
              querySerials.push(s);
              querySerials.push(s.toLowerCase());
              querySerials.push(s.toUpperCase());
          });
          const uniqueQuerySerials = [...new Set(querySerials)];

          const { data: ordersData } = await supabase.from('orders').select('serial_number').in('serial_number', uniqueQuerySerials);
          const existingOrders = new Set(ordersData?.map(o => o.serial_number.toLowerCase()) || []);
          
          const { data: recData } = await supabase.from('receivings').select('serial_number, receive_data').in('serial_number', uniqueQuerySerials);
          const receivedMap = new Map();
          recData?.forEach(r => {
              const isReceivedStatus = r.receive_data && r.receive_data.status && typeof r.receive_data.status === 'string' && (
                  r.receive_data.status.includes('Received') ||
                  r.receive_data.status === 'مستلمة' ||
                  r.receive_data.status === '已收货' ||
                  r.receive_data.status === t('receiving.info.received')
              );
              if (isReceivedStatus) {
                  receivedMap.set(r.serial_number.toLowerCase(), true);
              }
          });
          const seenSerials = new Set();
          rows.forEach(r => {
              const s = r.serial.trim();
              if (s) {
                  const sLower = s.toLowerCase();
                  if (seenSerials.has(sLower)) {
                      invalidItems.push({ id: r.id, serial: s, reason: t('shipping.validation.reasons.duplicate') });
                  } else {
                      seenSerials.add(sLower);
                      if (!existingOrders.has(sLower)) {
                          invalidItems.push({ id: r.id, serial: s, reason: t('shipping.validation.reasons.not_found') });
                      } else if (!receivedMap.has(sLower)) {
                          invalidItems.push({ id: r.id, serial: s, reason: t('shipping.validation.reasons.not_received') });
                      }
                  }
              }
          });

          toast.dismiss(toastId);

          if (invalidItems.length > 0) {
              setInvalidSerials(invalidItems);
              setPendingFetchOptions(withImage);
              setShowValidationModal(true);
          } else {
              setHighlightedSerials([]);
              fetchAllData(withImage, [], false);
          }
      } catch {
          toast.dismiss(toastId);
          toast.error(t('shipping.messages.check_error'));
      }
  };

    const fetchAllData = async (withImage, badSerialsToSkip = [], removeBadRows = false, badRowIdsToRemove = []) => {
    setShowImageColumn(withImage);
    const toastId = toast.loading(t('shipping.messages.fetching_data'));
    let successCount = 0;
    let fetchedCustomerName = '';

    // Explicit mixed cartons are recorded by the receiving user and carry their own unique case ID.
    const explicitMixedPackages = [];

    // Map: serial -> { rowId, serial, originalPackages[], desc, image, details, factoryCode }
    const serialCartonMap = [];
    
    // Determine the working rows
    let workingRows = [...rows];
    if (removeBadRows) {
        if (badRowIdsToRemove && badRowIdsToRemove.length > 0) {
            workingRows = workingRows.filter(r => !badRowIdsToRemove.includes(r.id));
        } else {
            workingRows = workingRows.filter(r => !badSerialsToSkip.includes(r.serial.trim()));
        }
    }

    if (workingRows.length === 0) {
        workingRows = [createEmptyPackingRow()];
    }

    // First pass
    for (let i = 0; i < workingRows.length; i++) {
        let row = workingRows[i];
        if (!row.serial.trim() || (removeBadRows ? false : badSerialsToSkip.includes(row.serial.trim()))) { 
            serialCartonMap.push({ isSkipped: true, row });
            continue; 
        }
        
        try {
            const { data: orderData } = await supabase.from('orders').select('serial_number, order_data').ilike('serial_number', row.serial.trim()).single();
            const { data: recData } = await supabase.from('receivings').select('serial_number, receive_data').ilike('serial_number', row.serial.trim()).single();

            const matchedSerial = orderData?.serial_number || recData?.serial_number || row.serial.trim();

            let desc = row.desc;
            let imageUrl = row.image;
            let factoryId = '';
            let receivedAt = '';
            
            let factoryCode = '';
            
            if (orderData) {
                const d = orderData.order_data;
                
                // Data-level authorization check
                if (user && user.role !== 'admin') {
                   if (!isOrderAllowedForUser(d, user, factories)) {
                       throw new Error("Unauthorized factory or company");
                   }
                }

                factoryId = d.factoryId || '';
                
                // The Details column is entered by the user. It must not be
                // populated automatically from the factory lookup.
                factoryCode = '';

                if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                    const firstImage = d.productImages[0];
                    imageUrl = normalizeImageUrl(firstImage);
                }
                if (!fetchedCustomerName && d.buyerMobile) fetchedCustomerName = d.buyerMobile;
                if (!desc) desc = englishOnly(d.productName) || '';
            }

            if (recData && recData.receive_data) {
                receivedAt = recData.receive_data.receivedAt ? recData.receive_data.receivedAt.split('T')[0] : '';
            }

            const originalPackages = [];
            if (recData && recData.receive_data && recData.receive_data.packages && Array.isArray(recData.receive_data.packages)) {
                const validPkgs = recData.receive_data.packages.filter(p => p.active !== false && p.fromCtn && p.toCtn);
                validPkgs.forEach((pkg, index) => {
                    const from = parseInt(pkg.fromCtn) || 0;
                    const to = parseInt(pkg.toCtn) || 0;
                    const qty = from <= to ? (to - from + 1) : 0;

                    const mixedItems = Array.isArray(pkg.mixedItems)
                      ? pkg.mixedItems.filter(item => item.serial?.trim() && (parseInt(item.quantity) || 0) > 0)
                      : [];
                    if (pkg.status === 'Mixed' && from > 0 && from === to && mixedItems.length > 0) {
                        explicitMixedPackages.push({
                            id: pkg.mixedCaseId || `${matchedSerial}-${pkg.id || index}-${from}`,
                            cartonNo: String(from),
                            cartonQty: '1',
                            packingKind: pkg.kind || 'Pcs',
                            items: mixedItems
                        });
                        return;
                    }

                    if (!pkg.pcsPerCtn || qty <= 0) return;
                    originalPackages.push({
                        id: Date.now() + Math.random() + index,
                        cartonNo: `${from}-${to}`,
                        cartonQty: qty > 0 ? qty.toString() : '',
                        packingKind: pkg.kind || 'Pcs',
                        qtyPerCarton: pkg.pcsPerCtn.toString()
                    });
                });
            }

            serialCartonMap.push({
                isSkipped: false,
                rowId: row.id,
                serial: matchedSerial,
                factoryId,
                receivedAt,
                originalPackages,
                desc,
                 imageUrl,
                details: row.details,
                factoryCode,
                orderDataFound: !!orderData
            });
            
            if (orderData) successCount++;
        } catch {
            serialCartonMap.push({ isSkipped: true, row });
        }
    }

    // ─── EXPLICIT MIXED CARTONS FROM RECEIVING ───
    // Build mixed cartons only from explicit Mixed receiving records.
    // Resolve display information for the items explicitly stored inside mixed cartons.
    const mixedItemMetadata = new Map();
    serialCartonMap.forEach(item => {
        if (item.isSkipped || !item.serial) return;
        mixedItemMetadata.set(item.serial.trim().toLowerCase(), {
            serial: item.serial,
            desc: item.desc || '',
            image: item.imageUrl || '',
            factoryCode: item.factoryCode || ''
        });
    });

    const explicitMixedSerials = [...new Set(
        explicitMixedPackages.flatMap(pkg => pkg.items.map(item => item.serial.trim()))
    )];
    const missingMixedSerials = explicitMixedSerials.filter(serial => !mixedItemMetadata.has(serial.toLowerCase()));
    if (missingMixedSerials.length > 0) {
        const { data: mixedOrders } = await supabase
            .from('orders')
            .select('serial_number, order_data')
            .in('serial_number', missingMixedSerials);

        (mixedOrders || []).forEach(order => {
            const orderInfo = order.order_data || {};
            if (user && user.role !== 'admin' && !isOrderAllowedForUser(orderInfo, user, factories)) return;
            const image = withImage && Array.isArray(orderInfo.productImages) && orderInfo.productImages.length > 0
                ? normalizeImageUrl(orderInfo.productImages[0])
                : '';
            mixedItemMetadata.set(order.serial_number.trim().toLowerCase(), {
                serial: order.serial_number,
                desc: englishOnly(orderInfo.productName) || '',
                image,
                factoryCode: ''
            });
        });
    }

    const mixedCaseMap = new Map();
    explicitMixedPackages.forEach(pkg => {
        if (!mixedCaseMap.has(pkg.id)) mixedCaseMap.set(pkg.id, pkg);
    });
    const detectedMixedGroups = [...mixedCaseMap.values()].map(pkg => ({
        id: pkg.id,
        cartonNo: pkg.cartonNo,
        cartonQty: '1',
        items: pkg.items.map(item => {
            const metadata = mixedItemMetadata.get(item.serial.trim().toLowerCase());
            if (!metadata) return null;
            return {
                id: item.id || createPackingId(),
                serial: metadata.serial || item.serial.trim(),
                desc: metadata.desc,
                packingKind: pkg.packingKind,
                qtyPerCarton: String(parseInt(item.quantity) || 0),
                details: '',
                image: metadata.image,
                factoryCode: metadata.factoryCode
            };
        }).filter(Boolean)
    })).filter(group => group.items.length > 0);

    const newRows = serialCartonMap.map(item => {
        if (item.isSkipped) return item.row;
        return {
            id: item.rowId,
            serial: item.serial,
            desc: item.desc,
            details: item.details,
            image: item.imageUrl,
            packages: item.originalPackages.length > 0 ? item.originalPackages : [createEmptyPackage()],
            factoryCode: item.factoryCode || ''
        };
    });

    setRows(newRows);
    setMixedGroups(detectedMixedGroups);
    setHeaderInfo(prev => ({ ...prev, customerName: fetchedCustomerName }));

    if (successCount > 0) {
        const mixMsg = detectedMixedGroups.length > 0 ? ` | ${t('packing.messages.mix_detected', { count: detectedMixedGroups.length })}` : '';
        toast.success(t('packing.messages.fetch_success', { count: successCount, mixMsg }), { id: toastId });
    } else {
        toast.error(t('shipping.messages.fetch_no_data'), { id: toastId });
    }
  };

  // ─── CALCULATIONS ON THE FLY ───
  const serialTotals = {};
  const normalSerialTotals = {};
  let totalCtn = 0;
  let totalPcs = 0;
  let uniqueSerials = new Set();

  rows.forEach(r => {
      const s = r.serial.trim();
      let rowQty = 0;
      r.packages = r.packages || [];
      r.packages.forEach(p => {
          const c = parseFloat(p.cartonQty) || 0;
          const q = parseFloat(p.qtyPerCarton) || 0;
          const itemQty = c * q;
          totalCtn += c;
          totalPcs += itemQty;
          rowQty += itemQty;
      });
      if (s) {
          uniqueSerials.add(s);
          serialTotals[s] = (serialTotals[s] || 0) + rowQty;
          normalSerialTotals[s] = (normalSerialTotals[s] || 0) + rowQty;
      }
  });

  mixedGroups.forEach(g => {
      const c = parseFloat(g.cartonQty) || 0;
      totalCtn += c;
      g.items.forEach(item => {
          const q = parseFloat(item.qtyPerCarton) || 0;
          const itemQty = c * q;
          totalPcs += itemQty;
          const s = item.serial.trim();
          if (s) {
              uniqueSerials.add(s);
              serialTotals[s] = (serialTotals[s] || 0) + itemQty;
          }
      });
  });

  const isPackingTableMissing = (error) => (
    error?.code === 'PGRST205'
    || error?.message?.includes('packing_lists') && error?.message?.includes('schema cache')
  );

  const showPackingStorageError = (error, toastId) => {
    if (isPackingTableMissing(error)) {
      toast.error(t('packing.saved.table_missing'), { id: toastId, duration: 7000 });
      return;
    }
    if (error?.code === '42501') {
      toast.error(t('packing.saved.permission_error'), { id: toastId });
      return;
    }
    toast.error(error?.message || t('packing.saved.generic_error'), { id: toastId });
  };

  const buildPackingPayload = () => ({
    packing_no: headerInfo.invoiceNo.trim(),
    packing_date: headerInfo.date,
    company_name: headerInfo.companyName || '',
    customer_name: headerInfo.customerName || '',
    packing_data: {
      schemaVersion: 1,
      headerInfo,
      rows,
      mixedGroups,
      footerInfo,
      showImageColumn
    },
    total_cartons: Number(totalCtn.toFixed(2)),
    total_pieces: Math.max(0, Math.round(totalPcs)),
    updated_by_username: user?.username || null
  });

  const savePackingList = async () => {
    const packingNumber = headerInfo.invoiceNo.trim();
    const hasItems = rows.some(row => row.serial?.trim())
      || mixedGroups.some(group => group.items?.some(item => item.serial?.trim()));

    if (!packingNumber) {
      toast.error(t('packing.saved.number_required'));
      return;
    }
    if (!headerInfo.date) {
      toast.error(t('packing.saved.date_required'));
      return;
    }
    if (!hasItems) {
      toast.error(t('packing.saved.items_required'));
      return;
    }

    const isUpdating = Boolean(currentPackingList?.id);
    if (isUpdating && !hasPermission('packing-list', 'edit')) {
      toast.error(t('packing.saved.permission_error'));
      return;
    }
    if (!isUpdating && !hasPermission('packing-list', 'add')) {
      toast.error(t('packing.saved.permission_error'));
      return;
    }

    setIsSavingPackingList(true);
    const toastId = toast.loading(isUpdating ? t('packing.saved.updating') : t('packing.saved.saving'));

    try {
      const payload = buildPackingPayload();
      let savedRecord;

      if (isUpdating) {
        const { data, error } = await supabase
          .from('packing_lists')
          .update(payload)
          .eq('id', currentPackingList.id)
          .eq('updated_at', currentPackingList.updated_at)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          const conflictError = new Error(t('packing.saved.conflict_error'));
          conflictError.code = 'PACKING_CONFLICT';
          throw conflictError;
        }
        savedRecord = data;
      } else {
        const { data, error } = await supabase
          .from('packing_lists')
          .insert([{
            ...payload,
            created_by: user?.id || null,
            created_by_username: user?.username || null
          }])
          .select('*')
          .single();
        if (error) throw error;
        savedRecord = data;
      }

      setCurrentPackingList({
        id: savedRecord.id,
        updated_at: savedRecord.updated_at,
        created_at: savedRecord.created_at,
        created_by_username: savedRecord.created_by_username
      });
      setSavedPackingSignature(packingStateSignature(headerInfo, rows, mixedGroups, footerInfo, showImageColumn));

      await logAuditEvent({
        action: isUpdating ? 'UPDATE_PACKING_LIST' : 'CREATE_PACKING_LIST',
        actionType: isUpdating ? 'UPDATE' : 'CREATE',
        entityType: 'packing-list',
        entityId: savedRecord.id,
        user,
        screenKey: 'packing-list',
        screenName: 'قائمة التعبئة',
        summary: `${isUpdating ? 'تعديل' : 'إنشاء'} قائمة التعبئة رقم ${packingNumber}`,
        details: {
          packingNumber,
          companyName: headerInfo.companyName,
          customerName: headerInfo.customerName,
          totalCartons: Number(totalCtn.toFixed(2)),
          totalPieces: Math.round(totalPcs),
          mixedCartons: mixedGroups.length
        }
      });

      toast.success(isUpdating ? t('packing.saved.update_success') : t('packing.saved.save_success'), { id: toastId });
    } catch (error) {
      console.error('Error saving packing list:', error);
      if (error?.code === '23505') {
        toast.error(t('packing.saved.duplicate_number'), { id: toastId });
      } else if (error?.code === 'PACKING_CONFLICT') {
        toast.error(t('packing.saved.conflict_error'), { id: toastId, duration: 7000 });
      } else {
        showPackingStorageError(error, toastId);
      }
    } finally {
      setIsSavingPackingList(false);
    }
  };

  const loadSavedPackingLists = async () => {
    setIsLoadingPackingLists(true);
    try {
      const { data, error } = await supabase
        .from('packing_lists')
        .select('*')
        .order('packing_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setSavedPackingLists(data || []);
    } catch (error) {
      console.error('Error loading packing lists:', error);
      setSavedPackingLists([]);
      showPackingStorageError(error);
    } finally {
      setIsLoadingPackingLists(false);
    }
  };

  const openPackingBrowser = () => {
    setPackingSearch('');
    setShowPackingBrowser(true);
    loadSavedPackingLists();
  };

  const normalizeSavedPackingList = (record, { asCopy = false } = {}) => {
    const stored = record?.packing_data && typeof record.packing_data === 'object'
      ? record.packing_data
      : {};
    const loadedHeader = {
      ...headerInfo,
      ...(stored.headerInfo || {}),
      invoiceNo: asCopy ? '' : (stored.headerInfo?.invoiceNo || record.packing_no || ''),
      date: asCopy ? localDate : (stored.headerInfo?.date || record.packing_date || localDate)
    };
    const loadedRows = Array.isArray(stored.rows) && stored.rows.length > 0
      ? stored.rows.map(row => ({
          ...createEmptyPackingRow(),
          ...row,
          id: row.id || createPackingId(),
          packages: Array.isArray(row.packages) && row.packages.length > 0
            ? row.packages.map(pkg => ({ ...createEmptyPackage(), ...pkg, id: pkg.id || createPackingId() }))
            : [createEmptyPackage()]
        }))
      : [createEmptyPackingRow()];
    const loadedGroups = Array.isArray(stored.mixedGroups)
      ? stored.mixedGroups.map(group => ({
          ...group,
          id: group.id || createPackingId(),
          items: Array.isArray(group.items)
            ? group.items.map(item => ({ ...item, id: item.id || createPackingId() }))
            : []
        }))
      : [];
    const loadedFooter = { ...createEmptyPackingFooter(), ...(stored.footerInfo || {}) };
    const loadedShowImages = Boolean(stored.showImageColumn);
    return { loadedHeader, loadedRows, loadedGroups, loadedFooter, loadedShowImages };
  };

  const openSavedPackingList = (record) => {
    if (hasUnsavedPackingChanges && !window.confirm(t('packing.saved.discard_changes_confirm'))) return;

    const { loadedHeader, loadedRows, loadedGroups, loadedFooter, loadedShowImages } = normalizeSavedPackingList(record);
    setHeaderInfo(loadedHeader);
    setRows(loadedRows);
    setMixedGroups(loadedGroups);
    setFooterInfo(loadedFooter);
    setShowImageColumn(loadedShowImages);
    setCurrentPackingList({
      id: record.id,
      updated_at: record.updated_at,
      created_at: record.created_at,
      created_by_username: record.created_by_username
    });
    setSavedPackingSignature(packingStateSignature(loadedHeader, loadedRows, loadedGroups, loadedFooter, loadedShowImages));
    setShowPackingBrowser(false);

    logAuditEvent({
      action: 'VIEW_PACKING_LIST',
      actionType: 'VIEW',
      entityType: 'packing-list',
      entityId: record.id,
      user,
      screenKey: 'packing-list',
      screenName: 'قائمة التعبئة',
      summary: `فتح قائمة التعبئة رقم ${record.packing_no}`,
      details: { packingNumber: record.packing_no }
    }).catch(() => {});
  };

  const copySavedPackingList = (record) => {
    if (hasUnsavedPackingChanges && !window.confirm(t('packing.saved.discard_changes_confirm'))) return;

    const { loadedHeader, loadedRows, loadedGroups, loadedFooter, loadedShowImages } = normalizeSavedPackingList(record, { asCopy: true });
    setHeaderInfo(loadedHeader);
    setRows(loadedRows);
    setMixedGroups(loadedGroups);
    setFooterInfo(loadedFooter);
    setShowImageColumn(loadedShowImages);
    setCurrentPackingList(null);
    setSavedPackingSignature(null);
    setShowPackingBrowser(false);
    toast.success(t('packing.saved.copy_ready'));
  };

  const startNewPackingList = () => {
    if (hasUnsavedPackingChanges && !window.confirm(t('packing.saved.discard_changes_confirm'))) return;

    const nextHeader = { ...headerInfo, invoiceNo: '', customerName: '', date: localDate };
    const nextRows = [createEmptyPackingRow()];
    const nextFooter = createEmptyPackingFooter();
    setHeaderInfo(nextHeader);
    setRows(nextRows);
    setMixedGroups([]);
    setFooterInfo(nextFooter);
    setShowImageColumn(false);
    setCurrentPackingList(null);
    setSavedPackingSignature(packingStateSignature(nextHeader, nextRows, [], nextFooter, false));
    toast.success(t('packing.saved.new_ready'));
  };

  const deleteSavedPackingList = async (record) => {
    if (!hasPermission('packing-list', 'delete')) return;
    if (!window.confirm(t('packing.saved.delete_confirm', { number: record.packing_no }))) return;

    const toastId = toast.loading(t('packing.saved.deleting'));
    try {
      const { data, error } = await supabase
        .from('packing_lists')
        .delete()
        .eq('id', record.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(t('packing.saved.permission_error'));

      setSavedPackingLists(prev => prev.filter(list => list.id !== record.id));
      if (currentPackingList?.id === record.id) {
        const nextHeader = { ...headerInfo, invoiceNo: '', customerName: '', date: localDate };
        const nextRows = [createEmptyPackingRow()];
        const nextFooter = createEmptyPackingFooter();
        setHeaderInfo(nextHeader);
        setRows(nextRows);
        setMixedGroups([]);
        setFooterInfo(nextFooter);
        setShowImageColumn(false);
        setCurrentPackingList(null);
        setSavedPackingSignature(packingStateSignature(nextHeader, nextRows, [], nextFooter, false));
      }

      await logAuditEvent({
        action: 'DELETE_PACKING_LIST',
        actionType: 'DELETE',
        entityType: 'packing-list',
        entityId: record.id,
        user,
        screenKey: 'packing-list',
        screenName: 'قائمة التعبئة',
        summary: `حذف قائمة التعبئة رقم ${record.packing_no}`,
        details: { packingNumber: record.packing_no, fullSnapshot: record.packing_data }
      });
      toast.success(t('packing.saved.delete_success'), { id: toastId });
    } catch (error) {
      console.error('Error deleting packing list:', error);
      showPackingStorageError(error, toastId);
    }
  };

  const normalizedPackingSearch = packingSearch.trim().toLowerCase();
  const filteredSavedPackingLists = savedPackingLists.filter(record => {
    if (!normalizedPackingSearch) return true;
    const regularSerials = Array.isArray(record.packing_data?.rows)
      ? record.packing_data.rows.map(row => row.serial || '').join(' ')
      : '';
    const mixedSerials = Array.isArray(record.packing_data?.mixedGroups)
      ? record.packing_data.mixedGroups.flatMap(group => group.items || []).map(item => item.serial || '').join(' ')
      : '';
    return [
      record.packing_no,
      record.packing_date,
      record.company_name,
      record.customer_name,
      record.created_by_username,
      regularSerials,
      mixedSerials
    ].some(value => String(value || '').toLowerCase().includes(normalizedPackingSearch));
  });

  const exportToExcel = async () => {
    try {
      const getAbsoluteImageUrl = (imgSrc) => {
        if (!imgSrc) return '';
        if (imgSrc.startsWith('data:') || imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
          return imgSrc;
        }
        const origin = window.location.origin;
        return `${origin}${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`;
      };

      const getBase64Image = async (imgSrc) => {
        if (!imgSrc) return null;
        const absoluteUrl = getAbsoluteImageUrl(imgSrc);
        if (absoluteUrl.startsWith('data:')) {
          const matches = absoluteUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            return {
              mimeType: matches[1],
              base64Data: matches[2]
            };
          }
        }
        try {
          const response = await fetch(absoluteUrl);
          const blob = await response.blob();
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            return {
              mimeType: matches[1],
              base64Data: matches[2]
            };
          }
        } catch (err) {
          console.error('Error fetching image for Excel:', absoluteUrl, err);
        }
        return null;
      };

      const imageMap = new Map();
      const registerImage = (imgSrc) => {
        if (!imgSrc) return null;
        if (imageMap.has(imgSrc)) {
          return imageMap.get(imgSrc).cid;
        }
        const cid = `image_${imageMap.size}`;
        imageMap.set(imgSrc, { cid, src: imgSrc, mimeType: 'image/jpeg', base64Data: '' });
        return cid;
      };

      let htmlString = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Packing List</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body {
    font-family: 'Arial', 'Microsoft YaHei', sans-serif;
    direction: ltr;
    margin: 20px;
    font-size: 14px;
  }
  .pl-header {
    border-bottom: 3px solid #1a5276;
    padding: 15px;
    text-align: center;
  }
  .company-name {
    font-size: 26px;
    font-weight: 900;
    color: #1a5276;
    text-transform: uppercase;
  }
  .company-tel {
    font-size: 13px;
    color: #555;
    margin-top: 5px;
  }
  .pl-meta-table {
    width: 100%;
    margin-top: 15px;
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-collapse: collapse;
  }
  .pl-meta-table td {
    padding: 8px;
    font-size: 13px;
    border: 1px solid #cbd5e1;
  }
  .pl-meta-label {
    font-weight: bold;
    color: #1a5276;
  }
  .pl-title {
    font-size: 22px;
    color: #1a5276;
    text-align: center;
    margin: 20px 0;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  .pl-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    border: 2px solid #1a5276;
  }
  .pl-table th {
    background-color: #1a5276;
    color: white;
    font-weight: bold;
    padding: 10px 5px;
    border: 1px solid #1a5276;
    font-size: 12px;
    text-transform: uppercase;
  }
  .pl-table td {
    border: 1px solid #cbd5e1;
    padding: 6px;
    color: #0f172a;
    text-align: center;
    vertical-align: middle;
  }
  .pl-table img {
    width: 50px;
    height: 60px;
    object-fit: contain;
    border: 1px solid #ccc;
    border-radius: 2px;
  }
  .pl-mixed-hdr td {
    background-color: #2980b9;
    color: white;
    font-weight: bold;
    font-style: italic;
    font-size: 12px;
    padding: 8px;
  }
  .pl-total-row td {
    background-color: #eaf2f8;
    font-weight: 900;
    color: #1a5276;
    border-top: 2px solid #1a5276;
    border-bottom: 2px solid #1a5276;
    font-size: 14px;
  }
  .pl-bottom-table {
    width: 100%;
    margin-top: 20px;
    border-collapse: collapse;
    font-size: 13px;
  }
  .pl-bottom-table td {
    border: 1px solid #000;
    padding: 8px 12px;
    font-weight: bold;
    background-color: #fff;
  }
  .pl-bottom-label {
    width: 250px;
    color: #000;
  }
  .pl-bottom-value {
    color: #1a5276;
  }
  .text-cell {
    mso-number-format: "\\@";
  }
</style>
</head>
<body>

  <!-- ─── HEADER ─── -->
  <div class="pl-header">
    <div class="company-name">${headerInfo.companyName}</div>
    <div class="company-tel">
      ${headerInfo.fax ? `<span>${headerInfo.fax}</span>` : ''}
      &nbsp;&nbsp;&nbsp;&nbsp;
      ${headerInfo.tel ? `<span>${headerInfo.tel}</span>` : ''}
    </div>
  </div>

  <!-- ─── METADATA ─── -->
  <table class="pl-meta-table">
    <tr>
      <td class="pl-meta-label" width="15%">${t('packing.header.invoice_no')}:</td>
      <td width="18%">${headerInfo.invoiceNo || ''}</td>
      <td class="pl-meta-label" width="15%">${t('packing.header.customer_name')}:</td>
      <td width="18%">${headerInfo.customerName || ''}</td>
      <td class="pl-meta-label" width="15%">${t('packing.header.date')}:</td>
      <td width="19%">${headerInfo.date || ''}</td>
    </tr>
  </table>

  <!-- ─── TITLE ─── -->
  <div class="pl-title">${t('packing.header.list_title')}</div>

  <!-- ─── TABLE ─── -->
  <table class="pl-table">
    <thead>
      <tr>
        <th width="40">${t('packing.table.cols.no')}</th>
        <th width="90">${t('packing.table.cols.carton_no')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.carton_no_ar')}</span></th>
        <th width="120">${t('packing.table.cols.item_no')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.item_no_ar')}</span></th>
        <th>${t('packing.table.cols.desc')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.desc_ar')}</span></th>
        <th width="70">${t('packing.table.cols.carton_qty')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.carton_qty_ar')}</span></th>
        <th width="70">${t('packing.table.cols.packing_kind')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.packing_kind_ar')}</span></th>
        <th width="80">${t('packing.table.cols.qty_per_ctn')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.qty_per_ctn_ar')}</span></th>
        <th width="80">${t('packing.table.cols.item_qty')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.item_qty_ar')}</span></th>
        <th width="90">${t('packing.table.cols.total_item_qty')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.total_item_qty_ar')}</span></th>
        ${showImageColumn ? `<th width="100">${t('packing.table.cols.image')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.image_ar')}</span></th>` : ''}
        <th>${t('packing.table.cols.details_ar')}<br/><span style="font-size:8px; font-weight:normal;">${t('packing.table.cols.details')}</span></th>
      </tr>
    </thead>
    <tbody>
`;

    // Render normal rows
    rows.forEach((row, index) => {
      const totalItemQty = normalSerialTotals[row.serial.trim()] || 0;
      const packagesToRender = (row.packages && row.packages.length > 0) ? row.packages : [{ cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }];
      
      packagesToRender.forEach((pkg, pIndex) => {
        const isFirst = pIndex === 0;
        const c = parseFloat(pkg.cartonQty) || 0;
        const q = parseFloat(pkg.qtyPerCarton) || 0;
        const itemQty = c * q;
        const rowCid = row.image ? registerImage(row.image) : null;
        const needsImageRowHeight = isFirst && showImageColumn && rowCid;

        htmlString += `
      <tr height="${needsImageRowHeight ? 95 : 25}" style="${needsImageRowHeight ? 'height:95px;' : ''}">
        ${isFirst ? `<td rowspan="${packagesToRender.length}" style="font-weight:bold;">${index + 1}</td>` : ''}
        <td class="text-cell" style="font-weight:bold;">${pkg.cartonNo || ''}</td>
        ${isFirst ? `<td class="text-cell" rowspan="${packagesToRender.length}" style="font-weight:bold;">${row.serial}</td>` : ''}
        ${isFirst ? `<td rowspan="${packagesToRender.length}">${row.desc || ''}</td>` : ''}
        <td>${pkg.cartonQty || ''}</td>
        <td>${pkg.packingKind || ''}</td>
        <td>${pkg.qtyPerCarton || ''}</td>
        <td style="font-weight:bold;">${itemQty > 0 ? itemQty : ''}</td>
        ${isFirst ? `<td rowspan="${packagesToRender.length}" style="font-weight:bold; color:#d4af37;">${totalItemQty > 0 ? totalItemQty : ''}</td>` : ''}
        ${isFirst && showImageColumn ? `
        <td rowspan="${packagesToRender.length}" style="width:90px; height:90px; text-align:center; vertical-align:middle; padding:5px;">
          ${rowCid ? `<img src="cid:${rowCid}" style="width:80px; height:80px; display:block; margin:0 auto;" width="80" height="80" alt="Item" />` : ''}
        </td>` : ''}
        ${isFirst ? `<td rowspan="${packagesToRender.length}">${row.factoryCode || row.details || '-'}</td>` : ''}
      </tr>
`;
      });
    });

    // Render mixed groups
    if (mixedGroups.length > 0) {
      htmlString += `
      <tr class="pl-mixed-hdr">
        <td colspan="${showImageColumn ? 11 : 10}" style="text-align:center;">
          ${t('packing.table.mixed_header')}
        </td>
      </tr>
`;

      mixedGroups.forEach((group) => {
        const c = parseFloat(group.cartonQty) || 0;
        let totalGroupQty = 0;
        group.items.forEach(i => {
          totalGroupQty += c * (parseFloat(i.qtyPerCarton) || 0);
        });

        group.items.forEach((item, itemIdx) => {
          const isFirst = itemIdx === 0;
          const itemQty = c * (parseFloat(item.qtyPerCarton) || 0);
          const itemCid = item.image ? registerImage(item.image) : null;

          htmlString += `
      <tr height="${showImageColumn && itemCid ? 95 : 25}" style="${showImageColumn && itemCid ? 'height:95px;' : ''}">
        ${isFirst ? `<td rowspan="${group.items.length}">-</td>` : ''}
        ${isFirst ? `<td class="text-cell" rowspan="${group.items.length}" style="font-weight:bold; color:#d4af37;">${group.cartonNo}</td>` : ''}
        <td class="text-cell" style="font-weight:bold;">${item.serial}</td>
        <td>${item.desc || ''}</td>
        ${isFirst ? `<td rowspan="${group.items.length}" style="font-weight:bold;">${group.cartonQty}</td>` : ''}
        <td>${item.packingKind || ''}</td>
        <td>${item.qtyPerCarton || ''}</td>
        <td style="font-weight:bold;">${itemQty > 0 ? itemQty : ''}</td>
        ${isFirst ? `<td rowspan="${group.items.length}" style="font-weight:bold;">${totalGroupQty > 0 ? totalGroupQty : ''}</td>` : ''}
        ${showImageColumn ? `
        <td style="width:90px; height:90px; text-align:center; vertical-align:middle; padding:5px;">
          ${itemCid ? `<img src="cid:${itemCid}" style="width:80px; height:80px; display:block; margin:0 auto;" width="80" height="80" alt="Item" />` : ''}
        </td>` : ''}
        <td>${item.factoryCode || item.details || '-'}</td>
      </tr>
`;
        });
      });
    }

    // Totals Row
    htmlString += `
      <tr class="pl-total-row">
        <td colspan="3">${t('packing.footer.total')}</td>
        <td>${uniqueSerials.size} ${t('shipping.footer.items')}</td>
        <td colspan="3">${totalCtn} ${t('shipping.footer.ctn', { defaultValue: 'CTN' })}</td>
        <td colspan="${showImageColumn ? 4 : 3}">${totalPcs} ${t('shipping.footer.pcs')}</td>
      </tr>
    </tbody>
  </table>

  <!-- ─── BOTTOM DETAILS ─── -->
  <table class="pl-bottom-table">
    <tr>
      <td class="pl-bottom-label">${t('packing.footer.summary_label')}</td>
      <td class="pl-bottom-value">${totalCtn} ${t('shipping.footer.ctn', { defaultValue: 'CTN' })} & ${totalPcs} ${t('shipping.footer.pcs')}</td>
    </tr>
    <tr>
      <td class="pl-bottom-label">${t('packing.footer.container_no')}</td>
      <td>${footerInfo.containerNo || '-'}</td>
    </tr>
    <tr>
      <td class="pl-bottom-label">${t('packing.footer.seal_no')}</td>
      <td>${footerInfo.sealNo || '-'}</td>
    </tr>
  </table>

</body>
</html>
`;

      // Fetch and convert all images to base64
      const imagePromises = Array.from(imageMap.entries()).map(async ([src, imgInfo]) => {
        const base64Info = await getBase64Image(src);
        if (base64Info) {
          imgInfo.mimeType = base64Info.mimeType;
          imgInfo.base64Data = base64Info.base64Data;
        }
      });
      await Promise.all(imagePromises);

      // Construct MHTML
      let mhtmlString = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_NextPart_ExcelImage"

------=_NextPart_ExcelImage
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit

` + htmlString;

      // Append images to MHTML
      imageMap.forEach((imgInfo) => {
        if (imgInfo.base64Data) {
          mhtmlString += `
------=_NextPart_ExcelImage
Content-Type: ${imgInfo.mimeType}
Content-Transfer-Encoding: base64
Content-Location: ${imgInfo.cid}

${imgInfo.base64Data}
`;
        }
      });

      mhtmlString += `\n------=_NextPart_ExcelImage--\n`;

      const blob = new Blob([mhtmlString], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Packing_List_${headerInfo.invoiceNo || 'Export'}.xls`;
      link.click();
      toast.success(t('excel_export_success'));
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error(t('excel_export_error'));
    }
  };

  const exportToPDF = async () => {
    if (rows.length === 0 || uniqueSerials.size === 0) {
      return toast.error(t('shipping.messages.enter_serials_first', { defaultValue: 'لا توجد بيانات صالحة للتصدير' }));
    }

    const toastId = toast.loading(t('reports.messages.preparing_pdf', { defaultValue: 'جاري تجهيز ملف الـ PDF...' }));

    try {
      const companyDetails = [
        headerInfo.fax ? `${headerInfo.fax}` : '',
        headerInfo.tel ? `${headerInfo.tel}` : ''
      ].filter(Boolean).join(' | ');

      const fD = (d) => { 
        if (!d || d === '-') return '-'; 
        const p = d.split('-'); 
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; 
      };

      // 1. إنشاء حاوية مؤقتة معزولة لتنسيق الطباعة بدقة وثبات تام
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1050px;background:#fff;padding:25px 30px;font-family:"Arial","Microsoft YaHei",sans-serif;color:#000;font-size:14px;line-height:1.4;direction:ltr;text-align:left;-webkit-font-smoothing:antialiased;';

      const b = 'border:1px solid #cbd5e1;padding:8px 6px;font-weight:600;';
      const tc = b + 'text-align:center;font-size:13px;';
      const bl = b + 'text-align:left;font-size:13px;';
      const hr = 'border:1px solid #1a5276;font-weight:900;text-align:center;font-size:12px;background:#1a5276;color:#fff;padding:10px 5px;text-transform:uppercase;';

      // 2. بناء صفوف الجدول الديناميكي بـ HTML
      let tableRowsHtml = '';
      rows.forEach((row, index) => {
        if (!row.serial.trim()) return;
        const totalItemQty = normalSerialTotals[row.serial.trim()] || 0;
        const packagesToRender = (row.packages && row.packages.length > 0) ? row.packages : [{ cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }];
        
        packagesToRender.forEach((pkg, pIndex) => {
          const isFirst = pIndex === 0;
          const c = parseFloat(pkg.cartonQty) || 0;
          const q = parseFloat(pkg.qtyPerCarton) || 0;
          const itemQty = c * q;

          tableRowsHtml += `
            <tr>
              ${isFirst ? `<td style="${tc}font-weight:bold;" rowspan="${packagesToRender.length}">${index + 1}</td>` : ''}
              <td style="${tc}font-weight:bold;mso-number-format:'\\@';">${pkg.cartonNo || ''}</td>
              ${isFirst ? `<td style="${tc}font-weight:bold;mso-number-format:'\\@';" rowspan="${packagesToRender.length}">${row.serial}</td>` : ''}
              ${isFirst ? `<td style="${bl}" rowspan="${packagesToRender.length}">${row.desc || ''}</td>` : ''}
              <td style="${tc}">${pkg.cartonQty || ''}</td>
              <td style="${tc}">${pkg.packingKind || ''}</td>
              <td style="${tc}">${pkg.qtyPerCarton || ''}</td>
              <td style="${tc}font-weight:bold;">${itemQty > 0 ? itemQty : ''}</td>
              ${isFirst ? `<td style="${tc}font-weight:bold;color:#1a5276;" rowspan="${packagesToRender.length}">${totalItemQty > 0 ? totalItemQty : ''}</td>` : ''}
              ${isFirst && showImageColumn ? `
              <td style="${tc}width:90px;height:90px;vertical-align:middle;padding:5px;" rowspan="${packagesToRender.length}">
                ${row.image ? `<img src="${row.image}" style="width:75px;height:75px;object-fit:contain;border:1px solid #ccc;border-radius:4px;display:block;margin:0 auto;" crossOrigin="anonymous" />` : '-'}
              </td>` : ''}
              ${isFirst ? `<td style="${tc}" rowspan="${packagesToRender.length}">${row.factoryCode || row.details || '-'}</td>` : ''}
            </tr>
          `;
        });
      });

      // إدراج المجموعات المشتركة (Mixed Groups)
      if (mixedGroups.length > 0) {
        tableRowsHtml += `
          <tr style="background:rgba(26,82,118,0.1);">
            <td colspan="${showImageColumn ? 11 : 10}" style="${tc}font-weight:bold;color:#1a5276;text-align:center;">
              ${t('packing.table.mixed_header')}
            </td>
          </tr>
        `;

        mixedGroups.forEach((group) => {
          const c = parseFloat(group.cartonQty) || 0;
          let totalGroupQty = 0;
          group.items.forEach(i => {
            totalGroupQty += c * (parseFloat(i.qtyPerCarton) || 0);
          });

          group.items.forEach((item, itemIdx) => {
            const isFirst = itemIdx === 0;
            const itemQty = c * (parseFloat(item.qtyPerCarton) || 0);

            tableRowsHtml += `
              <tr>
                ${isFirst ? `<td style="${tc}font-weight:bold;" rowspan="${group.items.length}">-</td>` : ''}
                ${isFirst ? `<td style="${tc}font-weight:bold;color:#1a5276;" rowspan="${group.items.length}">${group.cartonNo}</td>` : ''}
                <td style="${tc}font-weight:bold;mso-number-format:'\\@';">${item.serial}</td>
                <td style="${bl}">${item.desc || ''}</td>
                ${isFirst ? `<td style="${tc}font-weight:bold;" rowspan="${group.items.length}">${group.cartonQty}</td>` : ''}
                <td style="${tc}">${item.packingKind || ''}</td>
                <td style="${tc}">${item.qtyPerCarton || ''}</td>
                <td style="${tc}font-weight:bold;">${itemQty > 0 ? itemQty : ''}</td>
                ${isFirst ? `<td style="${tc}font-weight:bold;color:#1a5276;" rowspan="${group.items.length}">${totalGroupQty > 0 ? totalGroupQty : ''}</td>` : ''}
                ${showImageColumn ? `
                <td style="${tc}width:90px;height:90px;vertical-align:middle;padding:5px;">
                  ${item.image ? `<img src="${item.image}" style="width:75px;height:75px;object-fit:contain;border:1px solid #ccc;border-radius:4px;display:block;margin:0 auto;" crossOrigin="anonymous" />` : '-'}
                </td>` : ''}
                <td style="${tc}">${item.factoryCode || item.details || '-'}</td>
              </tr>
            `;
          });
        });
      }

      // 3. تجميع هيكل الفاتورة المتكامل بستايل بريميوم متناسق
      el.innerHTML = `
        <div style="border-bottom:3px solid #1a5276;padding-bottom:15px;text-align:center;margin-bottom:20px;">
          <div style="font-size:28px;font-weight:900;color:#1a5276;text-transform:uppercase;letter-spacing:0.5px;">${headerInfo.companyName}</div>
          <div style="font-size:13px;color:#555;margin-top:6px;">${companyDetails}</div>
        </div>

        <table style="width:100%;margin-bottom:20px;background-color:#f8fafc;border:1px solid #cbd5e1;border-collapse:collapse;">
          <tr>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('packing.header.invoice_no')}：</td>
            <td style="${tc}width:17%;font-weight:bold;">${headerInfo.invoiceNo || '-'}</td>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('packing.header.customer_name')}：</td>
            <td style="${tc}width:17%;font-weight:bold;">${headerInfo.customerName || '-'}</td>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('packing.header.date')}：</td>
            <td style="${tc}width:18%;font-weight:bold;">${fD(headerInfo.date)}</td>
          </tr>
        </table>

        <div style="font-size:22px;color:#1a5276;text-align:center;margin:20px 0;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;">
          ${t('packing.header.list_title')}
        </div>

        <table style="width:100%;border-collapse:collapse;border:2px solid #1a5276;margin-bottom:20px;">
          <thead>
            <tr>
              <th style="${hr}width:40px;">No</th>
              <th style="${hr}width:90px;">${t('packing.table.cols.carton_no')}<br/><small>${t('packing.table.cols.carton_no_ar')}</small></th>
              <th style="${hr}width:120px;">${t('packing.table.cols.item_no')}<br/><small>${t('packing.table.cols.item_no_ar')}</small></th>
              <th style="${hr}">${t('packing.table.cols.desc')}<br/><small>${t('packing.table.cols.desc_ar')}</small></th>
              <th style="${hr}width:70px;">${t('packing.table.cols.carton_qty')}<br/><small>${t('packing.table.cols.carton_qty_ar')}</small></th>
              <th style="${hr}width:70px;">${t('packing.table.cols.packing_kind')}<br/><small>${t('packing.table.cols.packing_kind_ar')}</small></th>
              <th style="${hr}width:80px;">${t('packing.table.cols.qty_per_ctn')}<br/><small>${t('packing.table.cols.qty_per_ctn_ar')}</small></th>
              <th style="${hr}width:80px;">${t('packing.table.cols.item_qty')}<br/><small>${t('packing.table.cols.item_qty_ar')}</small></th>
              <th style="${hr}width:90px;">${t('packing.table.cols.total_item_qty')}<br/><small>${t('packing.table.cols.total_item_qty_ar')}</small></th>
              ${showImageColumn ? `<th style="${hr}width:100px;">${t('packing.table.cols.image')}<br/><small>${t('packing.table.cols.image_ar')}</small></th>` : ''}
              <th style="${hr}">${t('packing.table.cols.details_ar')}<br/><small>${t('packing.table.cols.details')}</small></th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
            
            <tr style="background:#eaf2f8;font-weight:bold;font-size:13px;color:#1a5276;border-top:2px solid #1a5276;border-bottom:2px solid #1a5276;">
              <td style="${tc}padding:10px 5px;" colspan="3">${t('packing.footer.total')}</td>
              <td style="${tc}padding:10px 5px;">${uniqueSerials.size} ${t('shipping.footer.items')}</td>
              <td style="${tc}padding:10px 5px;" colspan="3">${totalCtn} ${t('shipping.footer.ctn', { defaultValue: 'CTN' })}</td>
              <td style="${tc}padding:10px 5px;" colspan="${showImageColumn ? 4 : 3}">${totalPcs} ${t('shipping.footer.pcs')}</td>
            </tr>
          </tbody>
        </table>

        <table style="width:100%;margin-top:25px;border-collapse:collapse;border:1px solid #000;">
          <tr>
            <td style="${bl}width:200px;background:#f8fafc;border:1px solid #000;font-weight:bold;">Total Summary:</td>
            <td style="${bl}color:#1a5276;border:1px solid #000;font-weight:bold;">${totalCtn} ${t('shipping.footer.ctn', { defaultValue: 'CTN' })} & ${totalPcs} ${t('shipping.footer.pcs')}</td>
          </tr>
          <tr>
            <td style="${bl}background:#f8fafc;border:1px solid #000;font-weight:bold;">Container No:</td>
            <td style="${bl}border:1px solid #000;font-weight:bold;">${footerInfo.containerNo || '-'}</td>
          </tr>
          <tr>
            <td style="${bl}background:#f8fafc;border:1px solid #000;font-weight:bold;">Seal No:</td>
            <td style="${bl}border:1px solid #000;font-weight:bold;">${footerInfo.sealNo || '-'}</td>
          </tr>
        </table>
      `;

      document.body.appendChild(el);

      // 4. استدعاء مكتبة html2canvas لأخذ سكرين شوت برمجية بدقة Scale 3
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      document.body.removeChild(el);

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // 5. استخدام jsPDF لإنشاء مستند يتناسب طوله تلقائياً مع حجم الجدول لمنع تداخل الصفحات
      const { jsPDF } = await import('jspdf');
      const pW = 210; 
      const pM = 6;   
      const cW = pW - pM * 2; 
      const cH = (canvas.height * cW) / canvas.width; 
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pW, Math.max(cH + pM * 2, 297)] });
      pdf.addImage(imgData, 'JPEG', pM, pM, cW, cH);
      
      const invoiceNoStr = headerInfo.invoiceNo ? `_${headerInfo.invoiceNo}` : '';
      pdf.save(`Packing_List${invoiceNoStr}_${localDate}.pdf`);
      
      toast.success(t('reports.messages.pdf_success', { defaultValue: 'تم تصدير ملف الـ PDF بنجاح!' }), { id: toastId });
    } catch (err) {
      toast.error(t('reports.messages.pdf_error', { defaultValue: 'فشل تصدير ملف الـ PDF' }), { id: toastId });
      console.error(err);
    }
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0, color: 'var(--text-strong)' }}>
            <Package size={40} color="var(--accent-color)" />
            {t('packing.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
            {t('packing.subtitle')}
          </p>
          <div className="no-print" style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.7rem',
              borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold',
              color: currentPackingList ? '#22c55e' : 'var(--text-muted)',
              background: currentPackingList ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
              border: `1px solid ${currentPackingList ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.25)'}`
            }}>
              {currentPackingList ? t('packing.saved.saved_status') : t('packing.saved.new_status')}
            </span>
            {hasUnsavedPackingChanges && (
              <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {t('packing.saved.unsaved_changes')}
              </span>
            )}
            {currentPackingList?.updated_at && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {t('packing.saved.last_saved')}: {new Date(currentPackingList.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {hasPermission('packing-list', 'add') && (
            <button className="btn btn-outline no-print" onClick={startNewPackingList} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={20} /> {t('packing.saved.new_list')}
            </button>
          )}
          <button className="btn btn-outline no-print" onClick={openPackingBrowser} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa', borderColor: '#60a5fa' }}>
            <History size={20} /> {t('packing.saved.previous_lists')}
          </button>
          {((currentPackingList && hasPermission('packing-list', 'edit')) || (!currentPackingList && hasPermission('packing-list', 'add'))) && (
            <button
              className="btn no-print"
              onClick={savePackingList}
              disabled={isSavingPackingList || !hasUnsavedPackingChanges}
              style={{
                padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none',
                background: hasUnsavedPackingChanges ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'rgba(100,116,139,0.35)',
                color: 'white', cursor: isSavingPackingList || !hasUnsavedPackingChanges ? 'not-allowed' : 'pointer',
                opacity: isSavingPackingList || !hasUnsavedPackingChanges ? 0.65 : 1
              }}
            >
              {isSavingPackingList ? <RefreshCw size={20} className="spin" /> : <Save size={20} />}
              {currentPackingList ? t('packing.saved.save_changes') : t('packing.saved.save_list')}
            </button>
          )}
          {hasPermission('packing-list', 'export') && (
            <>
              <button onClick={exportToExcel} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981', color: 'white', border: 'none', padding: '10px 20px', fontSize: '1.1rem', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
                <FileSpreadsheet size={20} /> {t('packing.excel_btn')}
              </button>
              <button onClick={exportToPDF} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', fontSize: '1.1rem', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                <Printer size={20} /> {t('packing.print_btn')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', border: 'none', background: 'var(--surface-color)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        
        {/* Print Styles */}
        <style>
          {`
            @media print {
              @page { size: portrait; margin: 6mm 8mm; }
              *, *::before, *::after { box-sizing: border-box; }
              body, html {
                background: #fff !important; color: #000 !important;
                margin: 0 !important; padding: 0 !important;
                font-size: 12px !important;
              }
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area {
                position: absolute; left: 0; top: 0; width: 100% !important;
                border: none !important; box-shadow: none !important;
                border-radius: 0 !important; overflow: visible !important;
                background: #fff !important; color: #000 !important;
                padding: 0 !important;
              }
              .no-print { display: none !important; }
              .pl-header {
                border-bottom: 3px solid #1a5276 !important;
                padding: 12px !important;
                background: #fff !important;
              }
              .pl-header input { font-size: 17px !important; color: #1a5276 !important; font-family: 'Arial', sans-serif !important; font-weight: bold !important; }
              .pl-header .pl-tel input { font-size: 13px !important; color: #555 !important; font-family: sans-serif !important; }
              .pl-meta {
                padding: 8px 12px !important; gap: 8px !important;
                background: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-radius: 4px !important;
                margin-top: 8px !important;
              }
              .pl-meta label { font-size: 11px !important; color: #64748b !important; margin-bottom: 2px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
              .pl-meta input, .pl-meta .form-control {
                font-size: 13px !important; padding: 4px 6px !important;
                border: 1px solid #94a3b8 !important; color: #0f172a !important; font-weight: bold !important;
                background: #fff !important; min-height: unset !important; height: auto !important;
              }
              .pl-title { font-size: 18px !important; margin: 12px 0 8px !important; text-transform: uppercase !important; letter-spacing: 1.5px !important; color: #1a5276 !important; font-weight: 900 !important; }
              .pl-table { font-size: 12px !important; table-layout: auto !important; border-collapse: collapse !important; border: 2px solid #1a5276 !important; }
              .pl-table th {
                padding: 8px 6px !important; font-size: 11px !important;
                background: #1a5276 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                border: 1px solid #1a5276 !important; color: #fff !important;
                white-space: normal !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;
              }
              .pl-table td {
                padding: 6px !important; border: 1px solid #94a3b8 !important; color: #0f172a !important;
                white-space: normal !important; word-wrap: break-word !important; overflow-wrap: break-word !important;
              }
              .pl-table td span { color: #0f172a !important; }
              .pl-table input {
                font-size: 12px !important; color: #0f172a !important; font-weight: bold !important;
                padding: 0 !important; height: auto !important; min-height: unset !important;
                white-space: normal !important; overflow: visible !important;
              }
              .pl-table img { width: 40px !important; height: 52px !important; border-radius: 2px !important; border: 1px solid #ccc !important; }
              .pl-table .pl-total-row td {
                padding: 8px 10px !important; font-size: 12px !important;
                background: #eaf2f8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                font-weight: 900 !important; border-top: 2px solid #1a5276 !important; border-bottom: 2px solid #1a5276 !important; color: #1a5276 !important;
              }
              .pl-table .pl-mixed-hdr td {
                background: #2980b9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
                font-size: 11px !important; padding: 6px !important; font-style: italic !important; color: #fff !important; font-weight: bold !important; letter-spacing: 1px !important;
              }
              .pl-bottom { font-size: 12px !important; gap: 2px !important; margin-top: 6px !important; }
              .pl-bottom > div {
                padding: 4px 10px !important; border-radius: 0 !important;
                background: #fff !important; border: 1px solid #000 !important;
              }
              .pl-bottom input { font-size: 12px !important; color: #000 !important; }
            }
          `}
        </style>

      <div id="invoice-print-area" className="" style={{ 
          background: 'var(--surface-color)', 
          border: '2px solid var(--accent-color)', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          color: 'var(--text-main)',
          direction: 'ltr'
      }}>
           
           {/* ─── HEADER ─── */}
           <div className="pl-header" style={{ 
               background: 'var(--surface-highlight)', 
               borderBottom: '2px solid var(--accent-color)',
               padding: '1.5rem',
               textAlign: 'center',
               position: 'relative'
           }}>
              <div 
                onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                style={{ cursor: 'pointer', display: 'inline-block', width: '100%', padding: '0.5rem', borderRadius: '8px', transition: 'background-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.05)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  {headerInfo.companyName}
                </div>
                <div className="pl-tel" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', color: 'var(--text-muted)', fontWeight: 'bold', direction: 'ltr' }}>
                  <span>{headerInfo.fax}</span>
                  <span>{headerInfo.tel}</span>
                </div>
              </div>

              {/* Dropdown for Companies */}
              {showCompanyDropdown && (
                <div className="no-print" style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  width: '400px', backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
                  borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 100, maxHeight: '300px', overflowY: 'auto', marginTop: '0.5rem'
                }}>
                  {companies.length === 0 ? (
                    <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('packing.messages.no_companies_warning')}</div>
                  ) : (
                    companies.map((comp, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setHeaderInfo({
                            ...headerInfo,
                            companyName: comp.name || '',
                            fax: comp.fax ? `FAX:${comp.fax}` : '',
                            tel: comp.mobile ? `Tel:${comp.mobile}` : ''
                          });
                          setShowCompanyDropdown(false);
                        }}
                        style={{
                          padding: '1rem', borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer', textAlign: 'center', transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.1)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)', textTransform: 'uppercase' }}>{comp.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', direction: 'ltr' }}>
                          {comp.fax && <span>FAX: {comp.fax} | </span>}
                          {comp.mobile && <span>Tel: {comp.mobile}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
           </div>

           <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="pl-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'rgba(212, 175, 55, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                 <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.invoice_no')}</label>
                    <input type="text" className="form-control" value={headerInfo.invoiceNo} onChange={e => setHeaderInfo({...headerInfo, invoiceNo: toEnglishNumbers(e.target.value)})} style={{ background: 'var(--bg-color)' }} />
                 </div>
                 <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.customer_name')}</label>
                    <input type="text" className="form-control" value={headerInfo.customerName} readOnly style={{ background: 'var(--bg-color)', opacity: 0.85 }} />
                 </div>
                 <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.date')}</label>
                    <CustomDateInput 
                      value={headerInfo.date} 
                      onChange={val => setHeaderInfo({...headerInfo, date: val})}
                    />
                 </div>
              </div>

              <h2 className="pl-title" style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.8rem', color: 'var(--text-strong)' }}>{t('packing.header.list_title')}</h2>

           {/* ─── INVOICE TABLE ─── */}
           <div style={{ overflowX: 'auto' }}>
             <table className="pl-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '1.15rem' }}>
               <thead>
                 <tr style={{ background: 'var(--surface-highlight)', borderBottom: '2px solid var(--accent-color)' }}>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '40px' }}>{t('packing.table.cols.no')}</th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('packing.table.cols.carton_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.carton_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '100px' }}>{t('packing.table.cols.item_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.item_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('packing.table.cols.desc')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.desc_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.carton_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.carton_qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.packing_kind')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.packing_kind_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.qty_per_ctn')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.qty_per_ctn_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.item_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.item_qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '60px' }}>{t('packing.table.cols.total_item_qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.total_item_qty_ar')}</span></th>
                   {showImageColumn && (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('packing.table.cols.image')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.image_ar')}</span></th>
                   )}
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('packing.table.cols.details_ar')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('packing.table.cols.details')}</span></th>
                   <th className="no-print" style={{ padding: '10px 5px', width: '40px', border: '1px solid var(--border-color)' }}></th>
                 </tr>
               </thead>
               <tbody>
                 {rows.map((row, index) => {
                     const totalItemQty = normalSerialTotals[row.serial.trim()] || 0;
                     const packagesToRender = (row.packages && row.packages.length > 0) ? row.packages : [{ id: 'fallback_' + row.id, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }];

                    return (
                        <React.Fragment key={row.id}>
                            {packagesToRender.map((pkg, pIndex) => {
                                const isFirst = pIndex === 0;
                                const c = parseFloat(pkg.cartonQty) || 0;
                                const q = parseFloat(pkg.qtyPerCarton) || 0;
                                const itemQty = c * q;

                                return (
                                    <tr key={pkg.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.cartonNo} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonNo', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        {isFirst && (
                                          <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              <input 
                                                className="serial-input"
                                                type="text" 
                                                value={row.serial} 
                                                onChange={e => handleRowChange(row.id, 'serial', e.target.value)}
                                                onKeyDown={e => handleSerialKeyDown(e, row.id)}
                                                placeholder={t('packing.table.serial_placeholder')}
                                                style={{ flex: 1, background: 'transparent', border: 'none', color: highlightedSerials.includes(row.serial.trim()) ? '#ef4444' : 'var(--text-main)', textAlign: 'center', fontWeight: 'bold', minWidth: 0 }}
                                              />
                                              <button
                                                className="no-print"
                                                type="button"
                                                onClick={(e) => {
                                                  const input = e.currentTarget.previousSibling;
                                                  const syntheticEvent = {
                                                    key: 'F9',
                                                    preventDefault: () => {},
                                                    target: input
                                                  };
                                                  handleSerialKeyDown(syntheticEvent, row.id);
                                                }}
                                                style={{
                                                  background: 'transparent',
                                                  border: 'none',
                                                  color: 'var(--accent-color)',
                                                  cursor: 'pointer',
                                                  padding: '2px',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  flexShrink: 0
                                                }}
                                                title="F9 Search"
                                              >
                                                <Search size={14} />
                                              </button>
                                            </div>
                                            {activeF9RowId === row.id && showSerialsList && (
                                              <div style={{
                                                position: 'fixed', top: f9Position.top, left: f9Position.left, transform: 'translateX(-50%)',
                                                width: '250px', maxHeight: '250px', overflowY: 'auto',
                                                backgroundColor: 'var(--surface-color)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-md)',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                                zIndex: 99999,
                                                textAlign: 'right'
                                              }}>
                                                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('entry.actions.select_saved_model')}</span>
                                                    <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); setActiveF9RowId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
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
                                                        setActiveF9RowId(null);
                                                      }
                                                      if (e.key === 'Enter') {
                                                        const filtered = availableSerials.filter(s => s.toString().includes(serialSearchQuery));
                                                        if (filtered.length > 0) {
                                                          setShowSerialsList(false);
                                                          setSerialSearchQuery('');
                                                          setActiveF9RowId(null);
                                                          handleRowChange(row.id, 'serial', filtered[0]);
                                                        }
                                                      }
                                                    }}
                                                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--surface-color)', color: 'var(--text-color)', outline: 'none' }}
                                                    autoComplete="off"
                                                  />
                                                </div>
                                                {fetchingSerials ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.loading')}</div>
                                                ) : (
                                                   (() => {
                                                     const filteredSerials = serialSearchQuery.trim()
                                                       ? availableSerials.filter(s => s.toString().includes(serialSearchQuery.trim()))
                                                       : availableSerials;
                                                     return filteredSerials.length === 0 ? (
                                                       <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('entry.actions.no_match')}</div>
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
                                                                      setShowSerialsList(false);
                                                                      setSerialSearchQuery('');
                                                                      setActiveF9RowId(null);
                                                                      handleRowChange(row.id, 'serial', serial);
                                                                  }}
                                                                  style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-color)' }}
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
                                            <span className="print-val" style={{ display: 'none' }}>{row.serial}</span>
                                          </td>
                                        )}
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                            </td>
                                        )}
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.cartonQty} onChange={e => handlePackageChange(row.id, pkg.id, 'cartonQty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 'bold', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="text" value={pkg.packingKind} onChange={e => handlePackageChange(row.id, pkg.id, 'packingKind', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                            <input type="number" value={pkg.qtyPerCarton} onChange={e => handlePackageChange(row.id, pkg.id, 'qtyPerCarton', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} />
                                        </td>
                                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                            {itemQty > 0 ? itemQty : ''}
                                        </td>
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                                {totalItemQty > 0 ? totalItemQty : ''}
                                            </td>
                                        )}
                                        {isFirst && (
                                            showImageColumn && (
                                                <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                                    {row.image && <img src={row.image} alt="Item" crossOrigin="anonymous" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                                </td>
                                            )
                                        )}
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                                <input type="text" value={row.factoryCode || row.details} onChange={e => handleRowChange(row.id, 'factoryCode', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'center', outline: 'none', color: 'var(--text-main)' }} placeholder="-" />
                                            </td>
                                        )}
                                        {isFirst && (
                                            <td rowSpan={packagesToRender.length} className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                                {(hasPermission('packing-list', 'delete') || hasPermission('packing-list', 'edit')) && (
                                                  <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                                      <Trash2 size={14} />
                                                  </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    );
                 })}
                 
                 {/* ─── MIXED CARTONS GROUPS ─── */}
                 {mixedGroups.length > 0 && (
                     <tr className="pl-mixed-hdr">
                         <td colSpan={showImageColumn ? 11 : 11} style={{ border: '2px solid var(--border-color)', background: 'rgba(239, 68, 68, 0.1)', padding: '5px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>
                            {t('packing.table.mixed_header')}
                         </td>
                     </tr>
                 )}

                 {mixedGroups.map((group) => {
                     const c = parseFloat(group.cartonQty) || 0;
                     let totalGroupQty = 0;
                     group.items.forEach(i => {
                         totalGroupQty += c * (parseFloat(i.qtyPerCarton) || 0);
                     });

                     return (
                         <React.Fragment key={group.id}>
                             {group.items.map((item, iIndex) => {
                                 const isFirst = iIndex === 0;
                                 const itemQty = c * (parseFloat(item.qtyPerCarton) || 0);
                                 
                                 return (
                                     <tr key={item.id} style={{ background: iIndex % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background-color 0.2s' }}>
                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', background: 'var(--surface-highlight)' }}>
                                                -
                                             </td>
                                         ) : null}
                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', background: 'var(--surface-highlight)' }}>
                                                <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{group.cartonNo}</span>
                                             </td>
                                         ) : null}
                                         
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.serial}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.desc}</span>
                                         </td>

                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', background: 'var(--surface-highlight)' }}>
                                                <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{group.cartonQty}</span>
                                             </td>
                                         ) : null}

                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ color: 'var(--text-main)' }}>{item.packingKind}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.qtyPerCarton}</span>
                                         </td>
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>
                                             {itemQty > 0 ? itemQty : ''}
                                         </td>

                                         {isFirst ? (
                                             <td rowSpan={group.items.length} style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', background: 'var(--surface-highlight)', verticalAlign: 'middle' }}>
                                                {totalGroupQty > 0 ? totalGroupQty : ''}
                                             </td>
                                         ) : null}

                                         {showImageColumn && (
                                             <td style={{ border: '1px solid var(--border-color)', padding: '2px', textAlign: 'center' }}>
                                                 {item.image && <img src={item.image} alt="Item" crossOrigin="anonymous" style={{ width: '50px', height: '60px', objectFit: 'contain' }} />}
                                             </td>
                                         )}
                                         <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                                             <span style={{ color: 'var(--text-main)' }}>{item.factoryCode || item.details || '-'}</span>
                                         </td>

                                          {isFirst && (
                                         <td rowSpan={group.items.length} className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                                              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>{t('receiving.table.auto')} ✓</span>
                                         </td>
                                         )}
                                     </tr>
                                 );
                             })}
                         </React.Fragment>
                     );
                 })}

                 {/* ─── TOTALS ROW ─── */}
                 <tr className="pl-total-row" style={{ background: 'var(--surface-highlight)', border: '2px solid var(--accent-color)', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-strong)' }}>
                    <td colSpan={3} style={{ padding: '12px', border: '1px solid var(--border-color)', background: 'rgba(212, 175, 55, 0.1)', color: 'var(--text-strong)' }}>{t('packing.footer.total')}</td>
                    <td style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{uniqueSerials.size} {t('shipping.footer.items')}</td>
                    <td colSpan={3} style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalCtn} {t('shipping.footer.ctn', { defaultValue: 'CTN' })}</td>
                    <td colSpan={4} style={{ padding: '12px', border: '1px solid var(--border-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</td>
                 </tr>

               </tbody>
             </table>
           </div>

           {!isExporting && (
             <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                {hasPermission('packing-list', 'add') && (
                  <button onClick={addRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                     <Plus size={18} /> {t('shipping.actions.add_row')}
                  </button>
                )}
                <button onClick={() => setShowFetchDialog(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #10b981, #059669)', border: 'none', padding: '10px 24px' }}>
                   <Search size={18} /> {t('shipping.actions.fetch_all')}
                </button>
                {hasPermission('packing-list', 'delete') && (
                  <button onClick={() => setShowClearConfirm(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', borderColor: '#ef4444' }}>
                     <Trash2 size={18} /> {t('shipping.actions.clear_all')}
                  </button>
                )}
             </div>
           )}

           {/* ─── BOTTOM DETAILS ─── */}
           <div className="pl-bottom" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }} dir="ltr">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '300px', color: 'var(--text-main)' }}>{t('packing.footer.summary_label')}</span>
                 <span style={{ padding: '0 15px', color: 'var(--accent-color)' }}>{totalCtn} {t('shipping.footer.ctn', { defaultValue: 'CTN' })}</span>
                 <span style={{ margin: '0 1rem', color: 'var(--text-muted)' }}>&</span>
                 <span style={{ padding: '0 15px', color: 'var(--accent-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px', color: 'var(--text-main)' }}>{t('packing.footer.container_no')}</span>
                 <input type="text" value={footerInfo.containerNo} onChange={e => setFooterInfo({...footerInfo, containerNo: e.target.value})} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px', color: 'var(--text-main)' }}>{t('packing.footer.seal_no')}</span>
                 <input type="text" value={footerInfo.sealNo} onChange={e => setFooterInfo({...footerInfo, sealNo: e.target.value})} style={{ width: '300px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px', outline: 'none' }} />
              </div>
           </div>
         </div>
        </div>
      </div>

      {showPackingBrowser && (
        <div className="no-print" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 10000,
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem',
          backdropFilter: 'blur(6px)'
        }}>
          <div className="card fade-in" style={{
            width: 'min(1150px, 96vw)', maxHeight: '90vh', overflow: 'hidden', padding: 0,
            border: '2px solid var(--accent-color)', boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
              background: 'var(--surface-highlight)'
            }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <History size={25} color="var(--accent-color)" />
                  {t('packing.saved.previous_lists')}
                </h2>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {t('packing.saved.browser_desc')}
                </p>
              </div>
              <button onClick={() => setShowPackingBrowser(false)} aria-label={t('shipping.fetch_dialog.cancel')} style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', width: '38px', height: '38px', borderRadius: '9px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  value={packingSearch}
                  onChange={event => setPackingSearch(event.target.value)}
                  placeholder={t('packing.saved.search_placeholder')}
                  style={{ paddingLeft: '40px', width: '100%' }}
                  autoFocus
                />
              </div>
              <button className="btn btn-outline" onClick={loadSavedPackingLists} disabled={isLoadingPackingLists} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <RefreshCw size={18} className={isLoadingPackingLists ? 'spin' : ''} />
                {t('packing.saved.refresh')}
              </button>
            </div>

            <div style={{ overflow: 'auto', padding: '1rem 1.5rem 1.5rem' }}>
              {isLoadingPackingLists ? (
                <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={30} className="spin" style={{ marginBottom: '0.75rem' }} />
                  <div>{t('packing.saved.loading')}</div>
                </div>
              ) : filteredSavedPackingLists.length === 0 ? (
                <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Package size={42} style={{ opacity: 0.45, marginBottom: '0.75rem' }} />
                  <div>{packingSearch ? t('packing.saved.no_search_results') : t('packing.saved.no_lists')}</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent-color)' }}>
                      <th style={{ padding: '0.8rem', textAlign: 'start', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.list_number')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'start', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.list_date')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'start', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.company')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'start', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.customer')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.cartons')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.pieces')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'start', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.last_update')}</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>{t('packing.saved.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSavedPackingLists.map(record => {
                      const isCurrent = currentPackingList?.id === record.id;
                      return (
                        <tr key={record.id} style={{ background: isCurrent ? 'rgba(34,197,94,0.07)' : 'transparent' }}>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                            {record.packing_no}
                            {isCurrent && <span style={{ marginInlineStart: '0.5rem', fontSize: '0.7rem', color: '#22c55e' }}>{t('packing.saved.current')}</span>}
                          </td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>{record.packing_date || '-'}</td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)', maxWidth: '200px' }}>{record.company_name || '-'}</td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>{record.customer_name || '-'}</td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>{Number(record.total_cartons || 0).toLocaleString('en-US')}</td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>{record.total_pieces ?? 0}</td>
                          <td style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            <div>{record.updated_at ? new Date(record.updated_at).toLocaleString() : '-'}</div>
                            <div>{record.updated_by_username || record.created_by_username || '-'}</div>
                          </td>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                              <button onClick={() => openSavedPackingList(record)} title={t('packing.saved.open')} style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: '7px', padding: '0.45rem', cursor: 'pointer', display: 'flex' }}>
                                <ExternalLink size={16} />
                              </button>
                              {hasPermission('packing-list', 'add') && (
                                <button onClick={() => copySavedPackingList(record)} title={t('packing.saved.copy_as_new')} style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc', borderRadius: '7px', padding: '0.45rem', cursor: 'pointer', display: 'flex' }}>
                                  <Copy size={16} />
                                </button>
                              )}
                              {hasPermission('packing-list', 'delete') && (
                                <button onClick={() => deleteSavedPackingList(record)} title={t('packing.saved.delete')} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', borderRadius: '7px', padding: '0.45rem', cursor: 'pointer', display: 'flex' }}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── FETCH DIALOG ─── */}
      {showFetchDialog && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '450px', textAlign: 'center', border: '2px solid var(--accent-color)', boxShadow: '0 10px 40px rgba(212,175,55,0.2)' }}>
               <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>{t('shipping.fetch_dialog.title')}</h3>
               <p style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>{t('shipping.fetch_dialog.question')}</p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => validateBeforeFetch(true)} className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--accent-color), #b58d27)', color: '#000', padding: '12px', fontSize: '1.1rem' }}>
                     {t('shipping.fetch_dialog.with_images')}
                  </button>
                  <button onClick={() => validateBeforeFetch(false)} className="btn btn-outline" style={{ flex: 1, padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.fetch_dialog.without_images')}
                  </button>
               </div>
               <button onClick={() => setShowFetchDialog(false)} style={{ marginTop: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '1rem' }}>
                  {t('shipping.fetch_dialog.cancel')}
               </button>
            </div>
         </div>
      )}

      {/* ─── F9 OVERLAY ─── */}
      {showSerialsList && (
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} 
            onClick={() => { setShowSerialsList(false); setActiveF9RowId(null); setSerialSearchQuery(''); }}
          />
      )}

      {/* ─── VALIDATION MODAL ─── */}
      {showValidationModal && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '550px', border: '2px solid #ef4444', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)' }}>
               <h3 style={{ marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={24} /> {t('shipping.validation.title')}
               </h3>
               <p style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                 {t('shipping.validation.desc')}
               </p>
               <ul style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '1.5rem', listStyle: 'none' }}>
                  {invalidSerials.map((inv, idx) => (
                      <li key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                          <span style={{ fontWeight: 'bold' }}>{inv.serial}</span>
                          <span style={{ fontSize: '0.85rem' }}>{inv.reason}</span>
                      </li>
                  ))}
               </ul>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => {
                      const badSerials = invalidSerials.map(inv => inv.serial);
                      const badIds = invalidSerials.map(inv => inv.id);
                      setHighlightedSerials([]);
                      setShowValidationModal(false);
                      setTimeout(() => fetchAllData(pendingFetchOptions, badSerials, true, badIds), 0);
                  }} className="btn btn-primary" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '12px', fontSize: '1.1rem' }}>
                     {t('shipping.validation.remove_invalid')}
                  </button>
                  <button onClick={() => {
                      const badSerials = invalidSerials.map(inv => inv.serial);
                      setHighlightedSerials(badSerials);
                      setShowValidationModal(false);
                      setTimeout(() => fetchAllData(pendingFetchOptions, badSerials, false), 0);
                  }} className="btn btn-outline" style={{ flex: 1, padding: '12px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.validation.keep_all')}
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* ─── CLEAR CONFIRM MODAL ─── */}
      {showClearConfirm && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div className="card fade-in" style={{ width: '400px', border: '2px solid #ef4444', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
               <h3 style={{ marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <AlertCircle size={32} /> {t('shipping.clear_confirm.title')}
               </h3>
               <p style={{ marginBottom: '2rem', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                 {t('shipping.clear_confirm.desc')}
               </p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={clearAllData} className="btn btn-primary" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', fontSize: '1.1rem' }}>
                     {t('shipping.clear_confirm.confirm')}
                  </button>
                  <button onClick={() => setShowClearConfirm(false)} className="btn btn-outline" style={{ flex: 1, padding: '10px', fontSize: '1.1rem', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
                     {t('shipping.fetch_dialog.cancel')}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default PackingList;
