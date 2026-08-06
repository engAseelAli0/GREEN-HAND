import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { englishOnly } from '../utils/textUtils';
import { normalizeImageUrl } from '../utils/imageUtils';
import { Printer, Plus, Trash2, Search, FileText, Settings, LayoutGrid, AlertCircle, X, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CustomDateInput } from '../components/CustomDateInput';
import { useFilteredLookups } from '../hooks/useFilteredLookups';

const toEnglishNumbers = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};

const ShippingInvoice = () => {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [headerInfo, setHeaderInfo] = useState({
    companyName: 'ARABIAN FRIENDSHIP TRADING CO.,LIMITED',
    tel: 'Tel:(8620)-83265754',
    fax: 'FAX:(8620)-83265204',
    address: '',
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
          address: comp.address || '',
          branch: comp.address || ''
        }));
      }
    }
  }, [companies, user]);

  const [rows, setRows] = useState([
    { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }
  ]);

  const [footerInfo, setFooterInfo] = useState({
    commissionPercent: '',
    containerFee: '',
    insurance: '',
    internalShipping: '',
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
    setRows([{ id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }]);
    setHeaderInfo(prev => ({ ...prev, invoiceNo: '', branch: '' }));
    setShowClearConfirm(false);
    toast.success(t('shipping.messages.clear_success'));
  };

  useEffect(() => {
    const updatedRows = rows.map(r => {
      const q = parseFloat(r.qty) || 0;
      const p = parseFloat(r.unitPrice) || 0;
      return { ...r, totalAmount: q * p };
    });
    
    const hasChanges = updatedRows.some((r, i) => r.totalAmount !== rows[i].totalAmount);
    if (hasChanges) {
      setRows(updatedRows);
    }
  }, [rows]);

  const addRow = () => {
    setRows([...rows, { id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }]);
  };

  const removeRow = (id) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const fetchRowData = async (_id, serial) => {
    if (!serial?.trim()) {
      toast.error(t('shipping.messages.enter_serials_first'));
      return;
    }
    await fetchAllData(false, [], false);
  };

  const handleRowChange = (id, field, value) => {
    let finalValue = value;
    if (['qty', 'unitPrice', 'serial'].includes(field)) {
        finalValue = toEnglishNumbers(value);
    }
    setRows(rows.map(r => r.id === id ? { ...r, [field]: finalValue } : r));
  };

  const calculateTotalPiecesCount = (orderData) => {
      if (!orderData) return 0;
      const colorsDist = orderData.colorDistribution || {};
      let total = 0;
      Object.keys(colorsDist).forEach(color => {
          if (colorsDist[color] && typeof colorsDist[color] === 'object') {
              Object.values(colorsDist[color]).forEach(val => {
                  total += (parseInt(val) || 0);
              });
          }
      });
      return total;
  };

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
    
    let updatedRows = [...rows];
    if (removeBadRows) {
        if (badRowIdsToRemove && badRowIdsToRemove.length > 0) {
            updatedRows = updatedRows.filter(r => !badRowIdsToRemove.includes(r.id));
        } else {
            updatedRows = updatedRows.filter(r => !badSerialsToSkip.includes(r.serial.trim()));
        }
    }

    if (updatedRows.length === 0) {
        updatedRows = [{ id: Date.now(), serial: '', desc: '', arabicName: '', qty: '', currency: '¥ RMB', unitPrice: '', totalAmount: 0, details: '', image: '', factoryCode: '' }];
    }
    for (let i = 0; i < updatedRows.length; i++) {
        let r = updatedRows[i];
        if (r.serial.trim() && (removeBadRows ? true : !badSerialsToSkip.includes(r.serial.trim()))) {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('serial_number, order_data')
                    .ilike('serial_number', r.serial.trim())
                    .single();

                if (!error && data) {
                    const d = data.order_data;
                    const matchedSerial = data.serial_number || r.serial.trim();
                    
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

                    const totalPieces = calculateTotalPiecesCount(d) || parseInt(d.totalQuantity) || 0;
                    
                    let imageUrl = '';
                    if (withImage && d.productImages && Array.isArray(d.productImages) && d.productImages.length > 0) {
                        const firstImage = d.productImages[0];
                        imageUrl = normalizeImageUrl(firstImage);
                    }

                    const factName = d.factoryId || '';
                    const factoryObj = factories.find(f => (f.name || f) === factName);
                    const factoryCode = typeof factoryObj === 'object' ? factoryObj.code : (d.factoryCode || '');

                    updatedRows[i] = {
                        ...r,
                        serial: matchedSerial,
                        desc: englishOnly(d.productName) || '',
                        arabicName: englishOnly(d.productName) || '',
                        qty: totalPieces.toString(),
                        currency: d.currency || '¥ RMB',
                        unitPrice: d.productPrice || '',
                        image: imageUrl,
                        factoryCode: factoryCode || ''
                    };
                    successCount++;
                }
            } catch {
                // ignore
            }
        }
    }
    
    setRows(updatedRows);

    if (successCount > 0) {
        toast.success(t('shipping.messages.fetch_success', { count: successCount }), { id: toastId });
    } else {
        toast.error(t('shipping.messages.fetch_no_data'), { id: toastId });
    }
  };

  const totalItemsCount = rows.filter(r => r.serial.trim() !== '').length;
  const totalPcs = rows.reduce((acc, r) => acc + (parseFloat(r.qty) || 0), 0);
  const subTotalAmount = rows.reduce((acc, r) => acc + (r.totalAmount || 0), 0);

  const commPercent = parseFloat(footerInfo.commissionPercent) || 0;
  const commissionAmount = subTotalAmount * (commPercent / 100);
  
  const contFee = parseFloat(footerInfo.containerFee) || 0;
  const ins = parseFloat(footerInfo.insurance) || 0;
  const intShip = parseFloat(footerInfo.internalShipping) || 0;

  const invoiceTotal = subTotalAmount + commissionAmount + contFee + ins + intShip;
  const primaryCurrency = rows[0]?.currency || 'RMB ¥';

  // ─── الدالة المعدلة والمطورة لتصدير PDF الاحترافي ───
  const exportToPDF = async () => {
    if (rows.length === 0 || totalItemsCount === 0) {
      return toast.error(t('shipping.messages.enter_serials_first', { defaultValue: 'لا توجد بيانات صالحة للتصدير' }));
    }
    
    const toastId = toast.loading(t('reports.messages.preparing_pdf', { defaultValue: 'جاري تجهيز ملف الـ PDF...' }));
    
    try {
      const companyDetails = [
        headerInfo.fax ? `${headerInfo.fax}` : '',
        headerInfo.tel ? `${headerInfo.tel}` : '',
        headerInfo.address ? `${headerInfo.address}` : ''
      ].filter(Boolean).join(' | ');

      const fD = (d) => { 
        if (!d || d === '-') return '-'; 
        const p = d.split('-'); 
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; 
      };

      // 1. إنشاء حاوية ووردبريس مؤقتة معزولة لتنسيق الطباعة بدقة وثبات تام
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
        tableRowsHtml += `
          <tr>
            <td style="${tc}font-weight:bold;">${index + 1}</td>
            <td style="${tc}font-weight:bold;mso-number-format:'\\@';">${row.serial}</td>
            <td style="${bl}">${row.desc || ''}</td>
            <td style="${tc}direction:rtl;">${row.arabicName || ''}</td>
            <td style="${tc}font-weight:bold;">${row.qty || ''}</td>
            <td style="${tc}">${row.currency || ''}</td>
            <td style="${tc}">${row.unitPrice || ''}</td>
            <td style="${tc}font-weight:bold;color:#1a5276;">${row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            ${showImageColumn ? `
            <td style="${tc}width:90px;height:90px;vertical-align:middle;padding:5px;">
              ${row.image ? `<img src="${row.image}" style="width:75px;height:75px;object-fit:contain;border:1px solid #ccc;border-radius:4px;display:block;margin:0 auto;" crossOrigin="anonymous" />` : '-'}
            </td>` : ''}
            <td style="${tc}">${row.factoryCode || row.details || '-'}</td>
          </tr>
        `;
      });

      // 3. تجميع هيكل الفاتورة المتكامل بستايل بريميوم متناسق
      el.innerHTML = `
        <div style="border-bottom:3px solid #1a5276;padding-bottom:15px;text-align:center;margin-bottom:20px;">
          <div style="font-size:28px;font-weight:900;color:#1a5276;text-transform:uppercase;letter-spacing:0.5px;">${headerInfo.companyName}</div>
          <div style="font-size:13px;color:#555;margin-top:6px;">${companyDetails}</div>
        </div>

        <table style="width:100%;margin-bottom:20px;background-color:#f8fafc;border:1px solid #cbd5e1;border-collapse:collapse;">
          <tr>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('shipping.header.invoice_no')}：</td>
            <td style="${tc}width:17%;font-weight:bold;">${headerInfo.invoiceNo || '-'}</td>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('shipping.header.branch')}：</td>
            <td style="${tc}width:17%; font-weight:bold;">${headerInfo.branch || '-'}</td>
            <td style="${bl}width:16%;font-weight:bold;color:#1a5276;">${t('shipping.header.date')}：</td>
            <td style="${tc}width:18%;font-weight:bold;">${fD(headerInfo.date)}</td>
          </tr>
        </table>

        <div style="font-size:22px;color:#1a5276;text-align:center;margin:20px 0;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;">
          SHIPPING INVOICE
        </div>

        <table style="width:100%;border-collapse:collapse;border:2px solid #1a5276;margin-bottom:20px;">
          <thead>
            <tr>
              <th style="${hr}width:40px;">No</th>
              <th style="${hr}width:130px;">${t('shipping.table.cols.item_no')}<br/><small>${t('shipping.table.cols.item_no_ar')}</small></th>
              <th style="${hr}">${t('shipping.table.cols.desc')}<br/><small>${t('shipping.table.cols.desc_ar')}</small></th>
              <th style="${hr}">${t('shipping.table.cols.arabic_name')}<br/><small>${t('shipping.table.cols.arabic_name_en')}</small></th>
              <th style="${hr}width:80px;">${t('shipping.table.cols.qty')}<br/><small>${t('shipping.table.cols.qty_ar')}</small></th>
              <th style="${hr}width:80px;">${t('shipping.table.cols.currency')}<br/><small>${t('shipping.table.cols.currency_ar')}</small></th>
              <th style="${hr}width:90px;">${t('shipping.table.cols.unit_price')}<br/><small>${t('shipping.table.cols.unit_price_ar')}</small></th>
              <th style="${hr}width:120px;">${t('shipping.table.cols.total_amount')}<br/><small>${t('shipping.table.cols.total_amount_ar')}</small></th>
              ${showImageColumn ? `<th style="${hr}width:100px;">${t('shipping.table.cols.item_image')}<br/><small>${t('shipping.table.cols.item_image_ar')}</small></th>` : ''}
              <th style="${hr}width:120px;">${t('shipping.table.cols.other_details_ar')}<br/><small>${t('shipping.table.cols.other_details')}</small></th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div style="width:100%;margin-top:15px;display:inline-block;">
          <table style="width:100%;border-collapse:collapse;border:2px solid #1a5276;font-size:13px;">
            <tr>
              <td style="${bl}padding:9px;color:#475569;">Subtotal (${totalItemsCount} Items / ${totalPcs} PCS)</td>
              <td style="${tc}padding:9px;background:#f1f5f9;font-weight:900;color:#1a5276;text-align:right;width:40%;">${subTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
            <tr>
              <td style="${bl}padding:9px;color:#475569;">Commission Amount (${commPercent}%)</td>
              <td style="${tc}padding:9px;text-align:right;font-weight:bold;">${commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
            <tr>
              <td style="${bl}padding:9px;color:#475569;">Container Fee</td>
              <td style="${tc}padding:9px;text-align:right;font-weight:bold;">${contFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
            <tr>
              <td style="${bl}padding:9px;color:#475569;">Insurance</td>
              <td style="${tc}padding:9px;text-align:right;font-weight:bold;">${ins.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
            <tr>
              <td style="${bl}padding:9px;color:#475569;">Internal Shipping</td>
              <td style="${tc}padding:9px;text-align:right;font-weight:bold;">${intShip.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
            <tr style="background:rgba(26,82,118,0.15);">
              <td style="${bl}padding:10px;font-weight:900;color:#1a5276;font-size:14px;">Invoice Total Amount</td>
              <td style="${tc}padding:10px;text-align:right;font-weight:900;color:#1a5276;font-size:15px;">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
            </tr>
          </table>
        </div>

        <table style="width:100%;margin-top:25px;border-collapse:collapse;border:1px solid #000;">
          <tr>
            <td style="${bl}width:200px;background:#f8fafc;border:1px solid #000;font-weight:bold;">Say Total:</td>
            <td style="${bl}color:#1a5276;border:1px solid #000;font-weight:bold;">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency} & ${totalPcs} PCS</td>
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

      // 4. استدعاء مكتبة html2canvas لأخذ سكرين شوت برمجية بدقة Scale 3 لدعم تعدد اللغات بشكل مثالي
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      document.body.removeChild(el);

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // 5. استخدام jsPDF لإنشاء مستند يتناسب طوله تلقائياً مع حجم الفاتورة لمنع تداخل الصفحات
      const { jsPDF } = await import('jspdf');
      const pW = 210; 
      const pM = 6;   
      const cW = pW - pM * 2; 
      const cH = (canvas.height * cW) / canvas.width; 
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pW, Math.max(cH + pM * 2, 297)] });
      pdf.addImage(imgData, 'JPEG', pM, pM, cW, cH);
      
      const invoiceNoStr = headerInfo.invoiceNo ? `_${headerInfo.invoiceNo}` : '';
      pdf.save(`Shipping_Invoice${invoiceNoStr}_${localDate}.pdf`);
      
      toast.success(t('reports.messages.pdf_success', { defaultValue: 'تم تصدير ملف الـ PDF بنجاح!' }), { id: toastId });
    } catch (err) {
      toast.error(t('reports.messages.pdf_error', { defaultValue: 'فشل تصدير ملف الـ PDF' }), { id: toastId });
      console.error(err);
    }
  };

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

      const companyDetails = [
        headerInfo.fax ? `${headerInfo.fax}` : '',
        headerInfo.tel ? `${headerInfo.tel}` : '',
        headerInfo.address ? `${headerInfo.address}` : ''
      ].filter(Boolean).join(' | ');

      let htmlString = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Shipping Invoice</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body {
    font-family: 'Arial', 'Microsoft YaHei', sans-serif;
    direction: ltr;
    margin: 20px;
    font-size: 14px;
  }
  .inv-header {
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
  .inv-meta-table {
    width: 100%;
    margin-top: 15px;
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-collapse: collapse;
  }
  .inv-meta-table td {
    padding: 8px;
    font-size: 13px;
    border: 1px solid #cbd5e1;
  }
  .inv-meta-label {
    font-weight: bold;
    color: #1a5276;
  }
  .inv-title {
    font-size: 22px;
    color: #1a5276;
    text-align: center;
    margin: 20px 0;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  .inv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    border: 2px solid #1a5276;
  }
  .inv-table th {
    background-color: #1a5276;
    color: white;
    font-weight: bold;
    padding: 10px 5px;
    border: 1px solid #1a5276;
    font-size: 12px;
    text-transform: uppercase;
  }
  .inv-table td {
    border: 1px solid #cbd5e1;
    padding: 6px;
    color: #0f172a;
    text-align: center;
    vertical-align: middle;
  }
  .inv-table img {
    width: 60px;
    height: 80px;
    object-fit: contain;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .text-cell {
    mso-number-format: "\\@";
  }
  .inv-footer-table {
    width: 450px;
    margin-top: 20px;
    float: right;
    border-collapse: collapse;
    font-size: 13px;
  }
  .inv-footer-table td {
    border: 1px solid #cbd5e1;
    padding: 8px;
    text-align: center;
    color: #0f172a;
  }
  .inv-footer-table td.highlight-cell {
    background-color: #1a5276;
    color: white;
    font-weight: bold;
  }
  .inv-bottom-table {
    width: 100%;
    margin-top: 20px;
    border-collapse: collapse;
    font-size: 13px;
  }
  .inv-bottom-table td {
    border: 1px solid #000;
    padding: 8px 12px;
    font-weight: bold;
    background-color: #fff;
  }
  .inv-bottom-label {
    width: 250px;
    color: #000;
  }
  .inv-bottom-value {
    color: #1a5276;
  }
</style>
</head>
<body>

  <!-- ─── HEADER ─── -->
  <div class="inv-header">
    <div class="company-name">${headerInfo.companyName}</div>
    <div class="company-tel">${companyDetails}</div>
  </div>

  <!-- ─── METADATA ─── -->
  <table class="inv-meta-table">
    <tr>
      <td class="inv-meta-label" width="15%">${t('shipping.header.invoice_no')}:</td>
      <td width="18%">${headerInfo.invoiceNo || ''}</td>
      <td class="inv-meta-label" width="15%">${t('shipping.header.branch')}:</td>
      <td width="18%">${headerInfo.branch || ''}</td>
      <td class="inv-meta-label" width="15%">${t('shipping.header.date')}:</td>
      <td width="19%">${headerInfo.date || ''}</td>
    </tr>
  </table>

  <!-- ─── TITLE ─── -->
  <div class="inv-title">SHIPPING INVOICE</div>

  <!-- ─── TABLE ─── -->
  <table class="inv-table">
    <thead>
      <tr>
        <th width="40">${t('shipping.table.cols.no')}</th>
        <th width="120">${t('shipping.table.cols.item_no')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.item_no_ar')}</span></th>
        <th>${t('shipping.table.cols.desc')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.desc_ar')}</span></th>
        <th>${t('shipping.table.cols.arabic_name')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.arabic_name_en')}</span></th>
        <th width="80">${t('shipping.table.cols.qty')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.qty_ar')}</span></th>
        <th width="80">${t('shipping.table.cols.currency')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.currency_ar')}</span></th>
        <th width="90">${t('shipping.table.cols.unit_price')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.unit_price_ar')}</span></th>
        <th width="120">${t('shipping.table.cols.total_amount')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.total_amount_ar')}</span></th>
        ${showImageColumn ? `<th width="100">${t('shipping.table.cols.item_image')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.item_image_ar')}</span></th>` : ''}
        <th width="120">${t('shipping.table.cols.other_details_ar')}<br/><span style="font-size:8px; font-weight:normal;">${t('shipping.table.cols.other_details')}</span></th>
      </tr>
    </thead>
    <tbody>
`;

      rows.forEach((row, index) => {
        const rowCid = row.image ? registerImage(row.image) : null;
        const needsImageRowHeight = showImageColumn && rowCid;
        htmlString += `
      <tr height="${needsImageRowHeight ? 95 : 25}" style="${needsImageRowHeight ? 'height:95px;' : ''}">
        <td style="font-weight:bold;">${index + 1}</td>
        <td class="text-cell" style="font-weight:bold;">${row.serial}</td>
        <td>${row.desc || ''}</td>
        <td style="direction:rtl;">${row.arabicName || ''}</td>
        <td style="font-weight:bold;">${row.qty || ''}</td>
        <td>${row.currency || ''}</td>
        <td>${row.unitPrice || ''}</td>
        <td style="font-weight:bold; color:#d4af37;">${row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        ${showImageColumn ? `
        <td style="width:90px; height:90px; text-align:center; vertical-align:middle; padding:5px;">
          ${rowCid ? `<img src="cid:${rowCid}" style="width:80px; height:80px; display:block; margin:0 auto;" width="80" height="80" alt="Product" />` : ''}
        </td>` : ''}
        <td>${row.factoryCode || row.details || '-'}</td>
      </tr>
`;
      });

      htmlString += `
    </tbody>
  </table>

  <!-- ─── FOOTER CALCULATIONS ─── -->
  <div style="width: 100%; display: inline-block;">
    <table class="inv-footer-table">
      <tr>
        <td style="text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.total')} (${totalItemsCount} ${t('shipping.footer.items')} / ${totalPcs} ${t('shipping.footer.pcs')})</td>
        <td class="highlight-cell" style="text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${subTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
      <tr>
        <td style="background-color:rgba(212, 175, 55, 0.05); text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.commission')} (${footerInfo.commissionPercent || 0}%)</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
      <tr>
        <td style="background-color:rgba(212, 175, 55, 0.05); text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.container_fee')}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${contFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
      <tr>
        <td style="background-color:rgba(212, 175, 55, 0.05); text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.insurance')}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${ins.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
      <tr>
        <td style="background-color:rgba(212, 175, 55, 0.05); text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.internal_shipping')}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${intShip.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
      <tr style="font-size:14px; font-weight:bold; background-color:rgba(212, 175, 55, 0.15);">
        <td style="color:#1a5276; text-align: left; padding: 8px; border: 1px solid #cbd5e1;">${t('shipping.footer.invoice_total')}</td>
        <td style="color:#1a5276; text-align: right; padding: 8px; border: 1px solid #cbd5e1;">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency}</td>
      </tr>
    </table>
  </div>

  <!-- ─── BOTTOM DETAILS ─── -->
  <table class="inv-bottom-table">
    <tr>
      <td class="inv-bottom-label">${t('shipping.footer.say_total')}</td>
      <td class="inv-bottom-value">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${primaryCurrency} & ${totalPcs} ${t('shipping.footer.pcs')}</td>
    </tr>
    <tr>
      <td class="inv-bottom-label">${t('shipping.footer.container_no')}</td>
      <td>${footerInfo.containerNo || '-'}</td>
    </tr>
    <tr>
      <td class="inv-bottom-label">${t('shipping.footer.seal_no')}</td>
      <td>${footerInfo.sealNo || '-'}</td>
    </tr>
  </table>

</body>
</html>
`;

      const imagePromises = Array.from(imageMap.entries()).map(async ([src, imgInfo]) => {
        const base64Info = await getBase64Image(src);
        if (base64Info) {
          imgInfo.mimeType = base64Info.mimeType;
          imgInfo.base64Data = base64Info.base64Data;
        }
      });
      await Promise.all(imagePromises);

      let mhtmlString = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_NextPart_ExcelImage"

------=_NextPart_ExcelImage
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit

` + htmlString;

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
      link.download = `Shipping_Invoice_${headerInfo.invoiceNo || 'Export'}.xls`;
      link.click();
      toast.success(t('excel_export_success'));
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error(t('excel_export_error'));
    }
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2.2rem', margin: 0, color: 'var(--text-strong)' }}>
            <FileText size={40} color="var(--accent-color)" />
            {t('shipping.title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
            {t('shipping.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {hasPermission('shipping-invoice', 'export') && (
            <>
              <button className="btn no-print" onClick={exportToExcel} disabled={isExporting} style={{ padding: '12px 24px', fontSize: '1.1rem', backgroundColor: '#10b981', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
                <FileSpreadsheet size={20} /> {t('shipping.actions.excel_btn')}
              </button>
              <button className="btn no-print" onClick={exportToPDF} style={{ padding: '12px 24px', fontSize: '1.1rem', backgroundColor: '#ef4444', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                <Printer size={20} /> {t('shipping.print_btn')}
              </button>
            </>
          )}
        </div>
      </div>

      <div id="invoice-print-area" className="" style={{ 
          background: 'var(--surface-color)', 
          border: '2px solid var(--accent-color)', 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          color: 'var(--text-main)',
          direction: 'ltr'
      }}>
        
        {/* HTML/CSS Layout Table Elements */}
        <div className="inv-header-section" style={{ 
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
             <div className="company-tel" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', color: 'var(--text-muted)', fontWeight: 'bold', direction: 'ltr' }}>
               {headerInfo.fax && <span>{headerInfo.fax}</span>}
               {headerInfo.tel && <span>{headerInfo.tel}</span>}
               {headerInfo.address && <span>{headerInfo.address}</span>}
             </div>
           </div>

           {showCompanyDropdown && (
             <div className="no-print" style={{
               position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
               width: '400px', backgroundColor: 'var(--surface-color)', border: '2px solid var(--accent-color)',
               borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
               zIndex: 100, maxHeight: '300px', overflowY: 'auto', marginTop: '0.5rem'
             }}>
               {companies.length === 0 ? (
                 <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('shipping.messages.no_companies_warning')}</div>
               ) : (
                 companies.map((comp, idx) => (
                   <div 
                     key={idx}
                     onClick={() => {
                       setHeaderInfo({
                         ...headerInfo,
                         companyName: comp.name || '',
                         fax: comp.fax ? `FAX:${comp.fax} ` : '',
                         tel: comp.mobile ? `Tel:${comp.mobile} ` : '',
                         address: comp.address || '',
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
                       {comp.address && <span> | {comp.address}</span>}
                     </div>
                   </div>
                 ))
               )}
             </div>
           )}
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           
           <div className="inv-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'rgba(212, 175, 55, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.invoice_no')}</label>
                 <input type="text" className="form-control" value={headerInfo.invoiceNo} onChange={e => setHeaderInfo({...headerInfo, invoiceNo: toEnglishNumbers(e.target.value)})} style={{ background: 'var(--bg-color)' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.branch')}</label>
                 <input type="text" className="form-control" value={headerInfo.branch} onChange={e => setHeaderInfo({...headerInfo, branch: e.target.value})} style={{ background: 'var(--bg-color)' }} />
              </div>
                 <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{t('shipping.header.date')}</label>
                    <CustomDateInput 
                      value={headerInfo.date} 
                      onChange={val => setHeaderInfo({...headerInfo, date: val})}
                    />
                 </div>
           </div>

           <h2 className="inv-title-h2" style={{ textAlign: 'center', margin: '1rem 0', fontSize: '1.8rem', color: 'var(--text-strong)' }}>{t('shipping.header.list_title')}</h2>

           <div style={{ overflowX: 'auto' }}>
             <table className="inv-main-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '1.15rem' }}>
               <thead>
                 <tr style={{ background: 'var(--surface-highlight)', borderBottom: '2px solid var(--accent-color)' }}>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '40px' }}>{t('shipping.table.cols.no')}</th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '140px' }}>{t('shipping.table.cols.item_no')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.item_no_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('shipping.table.cols.desc')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.desc_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)' }}>{t('shipping.table.cols.arabic_name')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.arabic_name_en')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('shipping.table.cols.qty')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.qty_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '80px' }}>{t('shipping.table.cols.currency')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.currency_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>{t('shipping.table.cols.unit_price')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.unit_price_ar')}</span></th>
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '120px' }}>{t('shipping.table.cols.total_amount')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.total_amount_ar')}</span></th>
                   {showImageColumn && (
                       <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>{t('shipping.table.cols.item_image')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.item_image_ar')}</span></th>
                   )}
                   <th style={{ padding: '10px 5px', border: '1px solid var(--border-color)', width: '90px' }}>{t('shipping.table.cols.other_details_ar')}<br/><span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{t('shipping.table.cols.other_details')}</span></th>
                   <th className="no-print" style={{ padding: '10px 5px', width: '40px', border: '1px solid var(--border-color)' }}></th>
                 </tr>
               </thead>
               <tbody>
                 {rows.map((row, index) => (
                   <tr key={row.id} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>{index + 1}</td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                           <input 
                             className="serial-input"
                             type="text" 
                             value={row.serial} 
                             onChange={e => handleRowChange(row.id, 'serial', e.target.value)}
                             onKeyDown={e => handleSerialKeyDown(e, row.id)}
                             placeholder={t('shipping.table.serial_placeholder')}
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
                             style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                             title="F9 Search"
                           >
                             <Search size={14} />
                           </button>
                        </div>
                        {activeF9RowId === row.id && showSerialsList && (
                          <div style={{ position: 'fixed', top: f9Position.top, left: f9Position.left, transform: 'translateX(-50%)', width: '250px', maxHeight: '250px', overflowY: 'auto', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 99999, textAlign: 'right' }}>
                            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-highlight)' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t('print.search.title')}</span>
                                <button onClick={() => { setShowSerialsList(false); setSerialSearchQuery(''); setActiveF9RowId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color)', padding: 0, display: 'flex', alignItems: 'center' }}>
                                   <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
                              <input
                                ref={serialSearchRef}
                                type="text"
                                placeholder={t('print.search.placeholder')}
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
                                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('print.search.loading')}</div>
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
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.desc} onChange={e => handleRowChange(row.id, 'desc', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.desc}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.arabicName} onChange={e => handleRowChange(row.id, 'arabicName', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', direction: 'rtl' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.arabicName}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.qty} onChange={e => handleRowChange(row.id, 'qty', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center', fontWeight: 'bold' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.qty}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="text" value={row.currency} onChange={e => handleRowChange(row.id, 'currency', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.currency}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px' }}>
                        <input type="number" value={row.unitPrice} onChange={e => handleRowChange(row.id, 'unitPrice', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} />
                        <span className="print-val" style={{ display: 'none' }}>{row.unitPrice}</span>
                     </td>
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                        {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </td>
                     
                     {showImageColumn && (
                        <td style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            {row.image ? (
                                <img src={row.image} alt="Product" crossOrigin="anonymous" style={{ width: '60px', height: '80px', objectFit: 'contain', borderRadius: '4px' }} />
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('shipping.table.no_image')}</span>
                            )}
                        </td>
                     )}
                     
                     <td style={{ border: '1px solid var(--border-color)', padding: '5px', fontWeight: 'bold' }}>
                        <input type="text" value={row.factoryCode || row.details} onChange={e => handleRowChange(row.id, 'factoryCode', e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'center' }} placeholder="-" />
                        <span className="print-val" style={{ display: 'none' }}>{row.factoryCode || row.details || '-'}</span>
                     </td>

                        <td className="no-print" style={{ border: '1px solid var(--border-color)', padding: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                {(hasPermission('shipping-invoice', 'delete') || hasPermission('shipping-invoice', 'edit')) && (
                                  <button onClick={() => removeRow(row.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}>
                                      <Trash2 size={14} />
                                  </button>
                                )}
                                <button className="no-print" onClick={() => fetchRowData(row.id, row.serial)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '2px' }}>
                                    <Search size={14} />
                                </button>
                            </div>
                        </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>

           {!isExporting && (
             <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
                {hasPermission('shipping-invoice', 'add') && (
                  <button onClick={addRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                     <Plus size={18} /> {t('shipping.actions.add_row')}
                  </button>
                )}
                <button onClick={() => setShowFetchDialog(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #10b981, #059669)', border: 'none', padding: '10px 24px' }}>
                   <Search size={18} /> {t('shipping.actions.fetch_all')}
                </button>
                {hasPermission('shipping-invoice', 'delete') && (
                  <button onClick={() => setShowClearConfirm(true)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', borderColor: '#ef4444' }}>
                     <Trash2 size={18} /> {t('shipping.actions.clear_all')}
                  </button>
                )}
             </div>
           )}

           <div style={{ display: 'flex', justifyContent: 'left', marginTop: '2rem', width: '100%' }}>
              <table className="inv-footer-table" style={{ width: '800px', borderCollapse: 'collapse', textAlign: 'center', fontWeight: 'bold', fontSize: '1.15rem', marginLeft: '0', marginRight: 'auto' }} dir="ltr">
                 <tbody>
                    <tr>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                          {t('shipping.footer.total')} ({totalItemsCount} {t('shipping.footer.items')} / {totalPcs} {t('shipping.footer.pcs')})
                       </td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--border-color)', color: 'var(--accent-color)', textAlign: 'right' }} className="highlight-cell">
                          {subTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}
                       </td>
                    </tr>
                    
                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                             {t('shipping.footer.commission')} 
                             <input 
                               type="number" 
                               value={footerInfo.commissionPercent} 
                               onChange={e => setFooterInfo({...footerInfo, commissionPercent: e.target.value})} 
                               style={{ width: '60px', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', textAlign: 'center', borderRadius: '4px', padding: '2px', fontWeight: 'bold', fontSize: '1.1rem' }} 
                             /> %
                          </div>
                       </td>
                       <td style={{ padding: '12px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
                          {commissionAmount > 0 ? commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + primaryCurrency : '0.00 ' + primaryCurrency}
                       </td>
                    </tr>

                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)', textAlign: 'left' }}>{t('shipping.footer.container_fee')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.containerFee} onChange={e => setFooterInfo({...footerInfo, containerFee: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'right', fontWeight: 'bold', fontSize: '1.15rem' }} />
                       </td>
                    </tr>

                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)', textAlign: 'left' }}>{t('shipping.footer.insurance')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.insurance} onChange={e => setFooterInfo({...footerInfo, insurance: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'right', fontWeight: 'bold', fontSize: '1.15rem' }} />
                       </td>
                    </tr>

                    <tr>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid var(--border-color)', textAlign: 'left' }}>{t('shipping.footer.internal_shipping')}</td>
                       <td style={{ padding: '8px', border: '1px solid var(--border-color)' }}>
                          <input type="number" value={footerInfo.internalShipping} onChange={e => setFooterInfo({...footerInfo, internalShipping: e.target.value})} placeholder="0.00" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'right', fontWeight: 'bold', fontSize: '1.15rem' }} />
                       </td>
                    </tr>

                    <tr>
                       <td style={{ padding: '12px', background: 'var(--accent-color)', color: '#000', border: '1px solid var(--border-color)', textAlign: 'left' }} className="total-cell">{t('shipping.footer.invoice_total')}</td>
                       <td style={{ padding: '12px', background: 'rgba(212, 175, 55, 0.5)', border: '1px solid var(--border-color)', color: 'var(--accent-color)', fontSize: '1.4rem', textAlign: 'right' }} className="total-cell">
                          {invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}
                       </td>
                    </tr>
                 </tbody>
              </table>
           </div>

           <div className="inv-bottom-details" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }} dir="ltr">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.say_total')}</span>
                 <span style={{ color: 'var(--accent-color)' }}>{invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {primaryCurrency}</span>
                 <span style={{ margin: '0 1rem' }}>&</span>
                 <span style={{ color: 'var(--accent-color)' }}>{totalPcs} {t('shipping.footer.pcs')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.container_no')}</span>
                 <input type="text" value={footerInfo.containerNo} onChange={e => setFooterInfo({...footerInfo, containerNo: e.target.value})} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-highlight)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <span style={{ width: '200px' }}>{t('shipping.footer.seal_no')}</span>
                 <input type="text" value={footerInfo.sealNo} onChange={e => setFooterInfo({...footerInfo, sealNo: e.target.value})} style={{ width: '300px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--accent-color)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', padding: '0 10px' }} />
              </div>
           </div>

        </div>
      </div>

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

      {showSerialsList && (
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} 
            onClick={() => { setShowSerialsList(false); setActiveF9RowId(null); setSerialSearchQuery(''); }}
          />
      )}

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

export default ShippingInvoice;