import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Printer, Plus, Trash2, Search, Package, Layers, AlertCircle, X, FileSpreadsheet } from 'lucide-react';
import { englishOnly } from '../utils/textUtils';
import toast from 'react-hot-toast';
import { CustomDateInput } from '../components/CustomDateInput';
import { useFilteredLookups } from '../hooks/useFilteredLookups';
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
    branch: '',
    date: localDate
  });

  const { lookups } = useAppData();
  const filteredLookups = useFilteredLookups();
  const companies = filteredLookups?.companies || [];
  const factories = filteredLookups?.factories || [];
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin' && companies.length > 0) {
      const currentAllowed = companies.some(c => (c.name || c) === headerInfo.companyName);
      if (!currentAllowed) {
        const comp = companies[0];
        setHeaderInfo(prev => ({
          ...prev,
          companyName: comp.name || '',
          fax: comp.fax ? `FAX:${comp.fax} ` : '',
          tel: comp.mobile ? `Tel:${comp.mobile} ` : '',
          branch: comp.address || ''
        }));
      }
    }
  }, [companies, user]);

  const [rows, setRows] = useState([
    { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }], factoryCode: '' }
  ]);

  const [mixedGroups, setMixedGroups] = useState([]);

  const [footerInfo, setFooterInfo] = useState({
    containerNo: '',
    sealNo: ''
  });

  const [isExporting, setIsExporting] = useState(false);
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

  const clearAllData = () => {
    setRows([{ id: Date.now(), serial: '', desc: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }], details: '', image: '', factoryCode: '' }]);
    setMixedGroups([]);
    setHeaderInfo(prev => ({ ...prev, invoiceNo: '', branch: '' }));
    setShowClearConfirm(false);
    toast.success(t('shipping.messages.clear_success'));
  };

  // Auto-calculate Totals Handlers
  const addRow = () => {
    setRows([...rows, { id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }], factoryCode: '' }]);
  };

  const removeRow = (id) => {
    if (rows.length === 1 && mixedGroups.length === 0) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id, field, value) => {
    let finalValue = value;
    if (field === 'serial') {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
  };

  const handlePackageChange = (rowId, pkgId, field, value) => {
    let finalValue = value;
    if (['cartonQty', 'qtyPerCarton'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => {
      if (r.id === rowId) {
        return { ...r, packages: r.packages.map(p => p.id === pkgId ? { ...p, [field]: finalValue } : p) };
      }
      return r;
    }));
  };

  // Mixed groups are now auto-detected from receivings data (read-only)

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
    let newBuyer = headerInfo.buyer;

    // Map: serial -> { rowId, serial, factoryId, receivedAt, expandedCartons[], originalPackages[], desc, image, details, factoryCode }
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
        workingRows = [{ id: Date.now(), serial: '', desc: '', details: '', image: '', packages: [{ id: Date.now() + 1, cartonNo: '', cartonQty: '', packingKind: 'Pcs', qtyPerCarton: '' }], factoryCode: '' }];
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
                   const allowedFactories = user.permissions?.allowed_factories || [];
                   const allowedCompanies = user.permissions?.allowed_companies || [];
                   if (allowedFactories.length > 0 && !allowedFactories.includes(d.factoryId)) {
                      throw new Error("Unauthorized factory");
                   }
                   if (allowedCompanies.length > 0 && !allowedCompanies.includes(d.buyerCompany)) {
                      throw new Error("Unauthorized company");
                   }
                }

                factoryId = d.factoryId || '';
                
                const factName = d.factoryId || '';
                const factoryObj = factories.find(f => (f.name || f) === factName);
                factoryCode = typeof factoryObj === 'object' ? factoryObj.code : (d.factoryCode || '');

                if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                    const firstImage = d.productImages[0];
                    imageUrl = typeof firstImage === 'object' ? firstImage.url : firstImage;
                }
                if (!newBuyer && d.buyerCompany) newBuyer = d.buyerCompany;
                if (!desc) desc = englishOnly(d.productName) || '';
            }

            if (recData && recData.receive_data) {
                receivedAt = recData.receive_data.receivedAt ? recData.receive_data.receivedAt.split('T')[0] : '';
            }

            let originalPackages = [];
            let expandedCartons = [];
            if (recData && recData.receive_data && recData.receive_data.packages && Array.isArray(recData.receive_data.packages)) {
                const validPkgs = recData.receive_data.packages.filter(p => p.fromCtn && p.toCtn && p.pcsPerCtn);
                validPkgs.forEach((pkg, index) => {
                    const from = parseInt(pkg.fromCtn) || 0;
                    const to = parseInt(pkg.toCtn) || 0;
                    const qty = from <= to ? (to - from + 1) : 0;
                    originalPackages.push({
                        id: Date.now() + Math.random() + index,
                        cartonNo: `${from}-${to}`,
                        cartonQty: qty > 0 ? qty.toString() : '',
                        packingKind: pkg.kind || 'Pcs',
                        qtyPerCarton: pkg.pcsPerCtn.toString()
                    });
                    for (let c = from; c <= to; c++) {
                        expandedCartons.push({ ctn: c, pcsPerCtn: pkg.pcsPerCtn.toString(), kind: pkg.kind || 'Pcs' });
                    }
                });
            }

            serialCartonMap.push({
                isSkipped: false,
                rowId: row.id,
                serial: matchedSerial,
                factoryId,
                receivedAt,
                expandedCartons,
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

    // ─── AUTO-DETECT MIXED CARTONS ───
    // Group by factoryId+receivedAt, then find carton numbers that appear in multiple serials
    const groupKey = (item) => `${item.factoryId}__${item.receivedAt}`;
    const factoryGroups = {};
    serialCartonMap.forEach(item => {
        if (item.isSkipped || !item.factoryId || !item.receivedAt) return;
        const key = groupKey(item);
        if (!factoryGroups[key]) factoryGroups[key] = [];
        factoryGroups[key].push(item);
    });

    const detectedMixedGroups = [];
    const mixedCartonSet = new Set(); // Store strings of carton numbers

    Object.values(factoryGroups).forEach(items => {
        if (items.length < 2) return; // need at least 2 serials to have a mix
        // Build map: cartonNumber -> [{ serial, desc, image, pcsPerCtn, kind }]
        const ctnMap = {};
        items.forEach(item => {
            item.expandedCartons.forEach(ec => {
                if (!ctnMap[ec.ctn]) ctnMap[ec.ctn] = [];
                ctnMap[ec.ctn].push({
                    serial: item.serial,
                    desc: item.desc,
                    imageUrl: item.imageUrl,
                    pcsPerCtn: ec.pcsPerCtn,
                    kind: ec.kind,
                    factoryCode: item.factoryCode
                });
            });
        });
        // Find cartons with more than 1 serial
        Object.entries(ctnMap).forEach(([ctnNo, entries]) => {
            if (entries.length < 2) return;
            // Check it's actually different serials (not duplicates)
            const uniqueSerials = [...new Set(entries.map(e => e.serial))];
            if (uniqueSerials.length < 2) return;
            
            mixedCartonSet.add(ctnNo.toString());
            
            detectedMixedGroups.push({
                id: Date.now() + Math.random() + parseInt(ctnNo),
                cartonNo: ctnNo,
                cartonQty: '1',
                items: entries.map((e, idx) => ({
                    id: Date.now() + Math.random() + idx,
                    serial: e.serial,
                    desc: e.desc || '',
                    packingKind: e.kind || 'Pcs',
                    qtyPerCarton: e.pcsPerCtn || '',
                    details: '',
                    image: e.imageUrl || '',
                    factoryCode: e.factoryCode || ''
                }))
            });
        });
    });

    // ─── SECOND PASS: BUILD newRows FILTERING OUT MIXED CARTONS ───
    let newRows = [];
    serialCartonMap.forEach(item => {
        if (item.isSkipped) {
            newRows.push(item.row);
            return;
        }

        let packagesToUse = item.originalPackages;
        
        // If there are generated packages, filter out mixed cartons and rebuild ranges
        if (item.expandedCartons.length > 0) {
            const nonMixedCartons = item.expandedCartons.filter(c => !mixedCartonSet.has(c.ctn.toString()));
            
            if (nonMixedCartons.length === 0) {
                // All cartons were mixed! No non-mixed cartons.
                // We leave packagesToUse empty so the row uses a fallback empty structure in render.
                packagesToUse = []; 
            } else {
                // Rebuild contiguous ranges from nonMixedCartons
                nonMixedCartons.sort((a, b) => a.ctn - b.ctn);
                const rebuiltPkgs = [];
                let currentGroup = { ...nonMixedCartons[0], startCtn: nonMixedCartons[0].ctn, endCtn: nonMixedCartons[0].ctn, count: 1 };
                
                for (let i = 1; i < nonMixedCartons.length; i++) {
                    const c = nonMixedCartons[i];
                    if (c.ctn === currentGroup.endCtn + 1 && c.pcsPerCtn === currentGroup.pcsPerCtn && c.kind === currentGroup.kind) {
                        currentGroup.endCtn = c.ctn;
                        currentGroup.count++;
                    } else {
                        rebuiltPkgs.push(currentGroup);
                        currentGroup = { ...c, startCtn: c.ctn, endCtn: c.ctn, count: 1 };
                    }
                }
                rebuiltPkgs.push(currentGroup);
                
                packagesToUse = rebuiltPkgs.map((g, idx) => ({
                    id: Date.now() + Math.random() + idx,
                    cartonNo: `${g.startCtn}-${g.endCtn}`,
                    cartonQty: g.count.toString(),
                    packingKind: g.kind || 'Pcs',
                    qtyPerCarton: g.pcsPerCtn
                }));
            }
        } else if (!item.orderDataFound) {
            packagesToUse = item.row.packages;
        }

        newRows.push({
            id: item.rowId,
            serial: item.serial,
            desc: item.desc,
            details: item.details,
            image: item.imageUrl,
            packages: packagesToUse.length > 0 ? packagesToUse : item.row.packages, 
            factoryCode: item.factoryCode || ''
        });
    });

    setRows(newRows);
    setMixedGroups(detectedMixedGroups);

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
      <td class="pl-meta-label" width="15%">${t('packing.header.branch')}:</td>
      <td width="18%">${headerInfo.branch || ''}</td>
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

      mixedGroups.forEach((group, index) => {
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

  const exportToPDF = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const invoiceNo = headerInfo.invoiceNo ? `_${headerInfo.invoiceNo}` : '';
    const originalTitle = document.title;
    document.title = `Packing_List${invoiceNo}_${dateStr}`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
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
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {hasPermission('packing', 'export') && (
            <>
              <button onClick={exportToExcel} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#107c41', borderColor: '#107c41', padding: '10px 20px', fontSize: '1.1rem' }}>
                <FileSpreadsheet size={20} /> {t('packing.excel_btn')}
              </button>
              <button onClick={exportToPDF} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-color)', color: '#000', padding: '10px 20px', fontSize: '1.1rem', border: 'none' }}>
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
                            tel: comp.mobile ? `Tel:${comp.mobile}` : '',
                            branch: comp.address || ''
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
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('packing.header.branch')}</label>
                    <input type="text" className="form-control" value={headerInfo.branch} onChange={e => setHeaderInfo({...headerInfo, branch: e.target.value})} style={{ background: 'var(--bg-color)' }} />
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
