import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { englishOnly, chineseOnly } from '../utils/textUtils';
import { normalizeImageUrl } from '../utils/imageUtils';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const getSizeRange = (orderData) => {
  if (!orderData) return '-';
  if (orderData.manualSizes && Array.isArray(orderData.manualSizes) && orderData.manualSizes.length > 0) {
    const validSizes = orderData.manualSizes
      .map(s => s !== null && s !== undefined ? String(s).trim() : '')
      .filter(s => s !== '');
    if (validSizes.length > 0) {
      const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
      const sortedSizes = [...validSizes].sort((a, b) => {
        const ai = sizeOrderArr.indexOf(a.toUpperCase());
        const bi = sizeOrderArr.indexOf(b.toUpperCase());
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
      const minSize = sortedSizes[0];
      const maxSize = sortedSizes[sortedSizes.length - 1];
      return minSize === maxSize ? minSize : `${minSize} - ${maxSize}`;
    }
  }
  if (orderData.sizeFrom && orderData.sizeTo) {
    return `${orderData.sizeFrom} - ${orderData.sizeTo}`;
  }
  if (orderData.sizeFrom) return orderData.sizeFrom;
  if (orderData.sizeTo) return orderData.sizeTo;
  return '-';
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const ProductImageFrame = ({ img, index, isMultiImage, maxHeight }) => {
  const [ratio, setRatio] = useState(null);
  const maxWidth = isMultiImage ? 180 : 250;
  const fallbackRatio = 3 / 4;
  const activeRatio = ratio || fallbackRatio;
  const boundedByWidthHeight = maxWidth / activeRatio;
  const height = Math.min(maxHeight, boundedByWidthHeight);
  const width = Math.min(maxWidth, height * activeRatio);

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: '100%',
        border: '1.5px solid #000',
        borderRadius: '4px',
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
        boxSizing: 'border-box',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}
    >
      <img
        src={normalizeImageUrl(img)}
        alt={`product-${index + 1}`}
        crossOrigin="anonymous"
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth && naturalHeight) {
            setRatio(naturalWidth / naturalHeight);
          }
        }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
        style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
      />
    </div>
  );
};

const FitOneLine = ({ children, maxFontSize = 15, minFontSize = 7, align = 'center', style }) => {
  const outerRef = useRef(null);
  const textRef = useRef(null);
  const [fit, setFit] = useState({ fontSize: maxFontSize, scale: 1 });

  useLayoutEffect(() => {
    const fitText = () => {
      const outer = outerRef.current;
      const text = textRef.current;
      if (!outer || !text) return;

      text.style.fontSize = `${maxFontSize}px`;
      text.style.transform = 'scaleX(1)';

      const availableWidth = Math.max(1, outer.clientWidth - 2);
      const naturalWidth = text.scrollWidth || 1;
      let nextFontSize = maxFontSize;
      let nextScale = 1;

      if (naturalWidth > availableWidth) {
        nextFontSize = Math.max(minFontSize, maxFontSize * (availableWidth / naturalWidth));
        const widthAtMin = naturalWidth * (nextFontSize / maxFontSize);
        if (widthAtMin > availableWidth) {
          nextScale = Math.max(0.62, availableWidth / widthAtMin);
        }
      }

      setFit(prev => (
        Math.abs(prev.fontSize - nextFontSize) > 0.1 || Math.abs(prev.scale - nextScale) > 0.01
          ? { fontSize: nextFontSize, scale: nextScale }
          : prev
      ));
    };

    const frame = requestAnimationFrame(fitText);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitText) : null;
    if (outerRef.current && resizeObserver) resizeObserver.observe(outerRef.current);
    document.fonts?.ready?.then(fitText);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [children, maxFontSize, minFontSize]);

  return (
    <span ref={outerRef} className="fit-one-line" style={{ display: 'block', width: '100%', overflow: 'hidden', textAlign: align, ...style }}>
      <span
        ref={textRef}
        className="fit-one-line-text"
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          fontSize: `${fit.fontSize}px`,
          lineHeight: 1.15,
          transform: `scaleX(${fit.scale})`,
          transformOrigin: align === 'left' ? 'left center' : align === 'right' ? 'right center' : 'center',
        }}
      >
        {children || '-'}
      </span>
    </span>
  );
};

const prepareExportCloneForCapture = async (clonedElement) => {
  await document.fonts?.ready;

  clonedElement.querySelectorAll('.fit-one-line').forEach((outer) => {
    const text = outer.querySelector('.fit-one-line-text');
    if (!text) return;

    text.style.fontSize = text.style.fontSize || '12px';
    text.style.transform = 'scaleX(1)';

    const availableWidth = Math.max(1, outer.clientWidth - 2);
    const naturalWidth = text.scrollWidth || 1;
    if (naturalWidth > availableWidth) {
      const currentSize = parseFloat(text.style.fontSize) || 12;
      const nextSize = Math.max(5, currentSize * (availableWidth / naturalWidth));
      text.style.fontSize = `${nextSize}px`;
      const adjustedWidth = naturalWidth * (nextSize / currentSize);
      if (adjustedWidth > availableWidth) {
        text.style.transform = `scaleX(${Math.max(0.55, availableWidth / adjustedWidth)})`;
      }
    }
  });

  const images = Array.from(clonedElement.querySelectorAll('img'));
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
};

export const downloadOrderPDF = async ({ order, elementId = 'export-doc', t }) => {
  if (!order) return;
  const element = document.getElementById(elementId);
  if (!element) {
    toast.error(t ? t('export.messages.not_found', 'لم يتم العثور على مستند الطلبية') : 'Document element not found');
    return;
  }
  const toastId = toast.loading(t ? t('export.messages.preparing_pdf', 'جاري إعداد وتحميل ملف PDF...') : 'Preparing PDF...');
  const filename = `Order_${order.serialNumber || order.serial_number || 'Export'}.pdf`;

  try {
    // Clone element to isolate in memory and render desktop-width canvas
    const clonedElement = element.cloneNode(true);
    clonedElement.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 1350px;
      max-width: none !important;
      min-height: 820px;
      display: flex;
      flex-direction: column;
      background: #ffffff !important;
      box-shadow: none !important;
      padding: 15px !important;
      margin: 0 !important;
    `;
    const sigFooter = clonedElement.querySelector('.export-signatures-footer');
    if (sigFooter) sigFooter.style.marginTop = 'auto';
    clonedElement.dataset.exportPdfClone = 'true';

    document.body.appendChild(clonedElement);
    await prepareExportCloneForCapture(clonedElement);

    const canvas = await html2canvas(clonedElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    document.body.removeChild(clonedElement);

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    // حساب الأبعاد والنسب لضمان أن ملف الـ PDF ورقة A4 أفقية قياسية واحدة تماماً (Single Page A4)
    const pdfWidthMM = 297;
    const pdfHeightMM = 210;
    const margin = 5;
    const maxContentWidthMM = pdfWidthMM - margin * 2; // 287mm
    const maxContentHeightMM = pdfHeightMM - margin * 2; // 200mm

    const scaleRatio = Math.min(
      maxContentWidthMM / imgWidthPx,
      maxContentHeightMM / imgHeightPx
    );

    const renderWidthMM = imgWidthPx * scaleRatio;
    const renderHeightMM = imgHeightPx * scaleRatio;

    // توسيط الفاتورة بشكل متناسق في الورقة
    const posX = margin + (maxContentWidthMM - renderWidthMM) / 2;
    const posY = margin + (maxContentHeightMM - renderHeightMM) / 2;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    pdf.addImage(imgData, 'JPEG', posX, posY, renderWidthMM, renderHeightMM, undefined, 'FAST');

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    toast.success(t ? t('export.messages.download_success', 'تم تحميل ملف PDF بنجاح!') : 'PDF downloaded successfully!', { id: toastId });
  } catch (err) {
    toast.error(t ? t('export.messages.download_error', 'حدث خطأ أثناء تحميل ملف PDF') : 'Error downloading PDF', { id: toastId });
    console.error(err);
    document.querySelectorAll('[data-export-pdf-clone="true"]').forEach(node => node.remove());
  }
};

const ExportOrderDocument = ({ order, lookups = {}, t, id = "export-doc", className = "print-doc" }) => {
  if (!order) return null;

  const getFactoryDetails = (factoryId) => {
    const factory = Array.isArray(lookups.factories) ? lookups.factories.find(f => (f.name === factoryId || f === factoryId)) : null;
    if (factory && typeof factory === 'object') {
      return { name: factory.name || '', mobile: factory.mobile || '', address: factory.address || '', code: factory.code || '' };
    }
    return { name: factoryId || '', mobile: '', address: '', code: '' };
  };

  const factoryInfo = getFactoryDetails(order.factoryId);
  const activeColors = order.colorDistribution ? Object.keys(order.colorDistribution) : [];

  let activeSizesSet = new Set();
  if (order.colorDistribution) {
    activeColors.forEach(color => {
      Object.keys(order.colorDistribution[color] || {}).forEach(size => activeSizesSet.add(size));
    });
  }
  const sizeOrderArr = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'F', 'FREE'];
  const sizesToRender = Array.from(activeSizesSet).sort((a, b) => {
    const ai = sizeOrderArr.indexOf(a.toUpperCase());
    const bi = sizeOrderArr.indexOf(b.toUpperCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const tmObj = lookups.tradeMarks?.find(tItem => (typeof tItem === 'object' ? tItem.name : tItem) === order.tradeMark);
  const tmImage = tmObj?.imageUrl || null;

  useEffect(() => {
    const onBeforePrint = () => {
      const el = document.getElementById(id) || document.querySelector('.print-doc');
      if (el) {
        const elHeight = el.scrollHeight || el.offsetHeight || 1100;
        const targetHeight = 710;
        const zoom = elHeight > targetHeight ? Math.max(0.5, Math.min(0.95, (targetHeight / elHeight) * 0.98)) : 0.95;
        document.documentElement.style.setProperty('--print-zoom', zoom.toFixed(3));
      }
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [order, id]);

  return (
    <div className={className} id={id} dir="ltr">
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 3mm 4mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          .app-container, .main-content {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-doc, .print-doc * {
            visibility: visible;
          }
          .print-doc {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: calc(100vh - 6mm) !important;
            display: flex !important;
            flex-direction: column !important;
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            zoom: var(--print-zoom, 0.65) !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
          }
          .export-signatures-footer {
            margin-top: auto !important;
            padding-top: 15px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inv-table-new {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inv-table-new tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .hdr-blue, .hdr-grey, .hdr-light, .title-cell, .bg-cyan, .bg-light-blue { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
        }

        .print-doc {
          display: flex;
          flex-direction: column;
          min-height: 800px;
        }

        .inv-table-new {
          width: 100%;
          border-collapse: collapse;
          border: 3px solid #000;
          table-layout: fixed;
          background: #fff;
        }
        .inv-table-new th, .inv-table-new td {
          border: 1px solid #000;
          padding: 6px 4px;
          word-wrap: break-word;
          white-space: normal;
          line-height: 1.3;
          overflow: hidden;
        }
        .hdr-blue {
          background-color: #1a5276 !important;
          color: #fff !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-grey {
          background-color: #d5dbdb !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 15px;
        }
        .hdr-light {
          background-color: #f2f2f2 !important;
          color: #000 !important;
          font-weight: 800;
          text-align: center;
          font-size: 14px;
        }
        .title-cell {
          background-color: #1a5276 !important;
          color: #fff !important;
          text-align: center;
          vertical-align: middle;
        }
        .val-center {
          text-align: center;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-left {
          text-align: left;
          font-size: 15px;
          vertical-align: middle;
        }
        .val-bold {
          font-weight: 800;
          color: #000;
        }
        .bg-cyan {
          background-color: #dcf4f5 !important;
        }
        .bg-light-blue {
          background-color: #eaf2f8 !important;
        }
      `}</style>

      <table className="inv-table-new">
        <colgroup>
          <col style={{ width: '26%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <tbody>
          {/* ═══ ROW 1: HEADER ═══ */}
          <tr>
            <th colSpan={1} className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.order_no', 'ORDER NO.')}</FitOneLine></th>
            <td colSpan={2} className="val-center val-bold"><FitOneLine maxFontSize={13} minFontSize={7}>{order.orderNumber || '-'}</FitOneLine></td>
            <th colSpan={2} className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.request_date', 'Order Date')}</FitOneLine></th>
            <td colSpan={2} className="val-center val-bold"><FitOneLine maxFontSize={13} minFontSize={7}>{formatDate(order.requestDate)}</FitOneLine></td>
            <th colSpan={2} className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.delivery_date', 'Delivery Date')}</FitOneLine></th>
            <td colSpan={2} className="val-center val-bold"><FitOneLine maxFontSize={13} minFontSize={7}>{formatDate(order.deliveryDate)}</FitOneLine></td>
          </tr>

          {/* ═══ ROW 2-4: BUYER & FACTORY INFO ═══ */}
          <tr>
            <th colSpan={1} rowSpan={3} className="title-cell" style={{ padding: '8px 6px', verticalAlign: 'middle' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px', letterSpacing: '0.5px' }}>{t('export.doc.product_order_en', 'PRODUCT ORDER')}</div>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{t('export.doc.product_order_zh', '产品订购单')}</div>
              {tmImage && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: '#fff', padding: '4px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                    <img
                      src={tmImage}
                      alt="trademark"
                      crossOrigin="anonymous"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      style={{ maxHeight: '42px', maxWidth: '120px', objectFit: 'contain' }}
                    />
                  </div>
                </div>
              )}
            </th>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.buyer_name', 'Buyer')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{order.buyerCompany || '-'}</FitOneLine></td>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.factory_name', 'Factory')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{factoryInfo.name || '-'}</FitOneLine></td>
          </tr>
          <tr>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.buyer_mobile', 'Buyer Mobile')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{order.buyerNumber || '-'}</FitOneLine></td>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.factory_mobile', 'Factory Mobile')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{factoryInfo.mobile || '-'}</FitOneLine></td>
          </tr>
          <tr>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.customer_id', 'Customer ID')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{order.buyerMobile || '-'}</FitOneLine></td>
            <th colSpan={2} className="hdr-light" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={11} minFontSize={6}>{t('export.doc.factory_address', 'Factory Address')}</FitOneLine></th>
            <td colSpan={3} className="val-center val-bold" style={{ padding: '6px 8px' }}><FitOneLine maxFontSize={12} minFontSize={6}>{factoryInfo.address || '-'}</FitOneLine></td>
          </tr>

          {/* ═══ ROW 5: PRODUCT COLUMNS ═══ */}
          <tr>
            <th className="hdr-blue" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}><FitOneLine maxFontSize={13} minFontSize={7}>{t('export.doc.product_name', 'Product')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.model_no', 'Model NO.')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.barcode', 'Barcode')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.qty', 'Quantity')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.price', 'Price')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.total_price', 'Total Price')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.size_qty', 'Sizes Qty')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.size_range', 'Size Range')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.carton_size', 'Carton Size')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.plastic_bag', 'Plastic Bag')}</FitOneLine></th>
            <th className="hdr-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.ctn_packaging', 'CTN Packaging')}</FitOneLine></th>
          </tr>

          {/* ═══ ROW 6: PRODUCT VALUES ═══ */}
          <tr>
            <td className="val-center val-bold hdr-grey" style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}>
              <FitOneLine maxFontSize={13} minFontSize={6}>
                {[
                  englishOnly(order.productName),
                  chineseOnly(order.productName)
                ].filter(Boolean).join(' - ') || '-'}
              </FitOneLine>
            </td>
            <td className="val-center val-bold bg-cyan"><FitOneLine maxFontSize={12} minFontSize={6}>{order.serialNumber || order.serial_number || '-'}</FitOneLine></td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>{order.barcode ? `${order.barcode}` : '-'}</FitOneLine></td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>{order.totalQuantity || '-'}</FitOneLine></td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>¥ {order.productPrice || '-'}</FitOneLine></td>
            <td className="val-center val-bold bg-light-blue"><FitOneLine maxFontSize={12} minFontSize={6}>¥ {order.productPrice && order.totalQuantity ? (parseFloat(order.productPrice) * parseFloat(order.totalQuantity)).toFixed(2) : '-'}</FitOneLine></td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>{sizesToRender.length || '-'}</FitOneLine></td>
            <td className="val-center val-bold">
              <FitOneLine maxFontSize={11} minFontSize={6}>{(() => {
                const range = getSizeRange(order);
                if (range && range !== '-') {
                  const parts = range.split(' - ');
                  if (parts.length === 2) return `From ${parts[0]} - To ${parts[1]}`;
                  return range;
                }
                return '-';
              })()}</FitOneLine>
            </td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>{order.cartonSize || '-'}</FitOneLine></td>
            <td className="val-center val-bold"><FitOneLine maxFontSize={12} minFontSize={6}>{order.plasticBagSize || '-'}</FitOneLine></td>
            <td className="val-center val-bold">
              <FitOneLine maxFontSize={11} minFontSize={6}>{(() => {
                const getFirstNum = (str) => {
                  if (!str) return null;
                  const match = String(str).match(/\d+(\.\d+)?/);
                  return match ? match[0] : null;
                };
                const qNum = getFirstNum(order.cartonQty);
                const pNum = getFirstNum(order.cartonPackage);
                if (!qNum && !pNum) return '-';
                if (qNum && pNum) return `${qNum} Carton × ${pNum} Pcs`;
                if (qNum) return `${qNum} Carton`;
                if (pNum) return `${pNum} Pcs`;
                return '-';
              })()}</FitOneLine>
            </td>
          </tr>

          {/* ═══ MEASUREMENTS BLOCK ═══ */}
          {(() => {
            let totalRows = 0;
            const parts = order.groupedMeasurements ? Object.keys(order.groupedMeasurements) : (order.measurements ? ['Product'] : []);

            parts.forEach(part => {
              totalRows += 1;
              if (order.groupedMeasurements) {
                totalRows += Object.keys(order.groupedMeasurements[part] || {}).length;
              } else {
                totalRows += Object.keys(order.measurements || {}).length;
              }
            });

            if (totalRows === 0) totalRows = 2;

            const totalImages = order.productImages?.filter(Boolean).length || 0;
            const isMultiImage = totalImages > 1;
            const maxSizeCols = isMultiImage ? 7 : 8;
            const imageColSpan = isMultiImage ? 3 : 2;
            const partSizes = sizesToRender.slice(0, maxSizeCols);

            const rows = [];
            let isFirstRow = true;

            if (parts.length === 0) {
              const emptyRowCount = 4;
              const totalEmptyRows = 1 + emptyRowCount;
              const displaySizes = partSizes.length > 0 ? partSizes : [];
              const actualCols = displaySizes.length > 0 ? displaySizes.length : 4;
              const remainingCols = Math.max(0, maxSizeCols - actualCols);

              rows.push(
                <tr key="empty-hdr">
                  <th className="hdr-grey"><FitOneLine maxFontSize={13} minFontSize={6}>{t('export.doc.size_header', 'Size')}</FitOneLine></th>
                  {displaySizes.length > 0 ? (
                    displaySizes.map((s, i) => (
                      <th key={i} className="hdr-grey" style={{ height: '28px' }}>
                        <FitOneLine maxFontSize={13} minFontSize={6}>{s}</FitOneLine>
                      </th>
                    ))
                  ) : (
                    Array.from({ length: 4 }).map((_, i) => (
                      <th key={i} className="hdr-grey" style={{ height: '28px' }}>&nbsp;</th>
                    ))
                  )}
                  {remainingCols > 0 && (
                    <td
                      colSpan={remainingCols}
                      style={{ border: 'none', background: '#fff' }}
                    ></td>
                  )}
                  <td colSpan={imageColSpan} rowSpan={totalEmptyRows} style={{ padding: '6px', borderLeft: '3px solid #000', backgroundColor: '#fff', verticalAlign: 'middle', textAlign: 'center' }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: '8px',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexWrap: 'wrap',
                      width: '100%',
                      maxWidth: isMultiImage ? '380px' : '250px',
                      margin: '0 auto',
                      boxSizing: 'border-box'
                    }}>
                      {order.productImages?.filter(Boolean).map((img, idx) => (
                        <ProductImageFrame key={idx} img={img} index={idx} isMultiImage={isMultiImage} maxHeight={isMultiImage ? 230 : 250} />
                      ))}
                    </div>
                  </td>
                </tr>
              );

              for (let r = 1; r <= emptyRowCount; r++) {
                rows.push(
                  <tr key={`empty-row-${r}`}>
                    <td className="val-bold val-left" style={{ height: '32px', minHeight: '32px', paddingLeft: '6px' }}>&nbsp;</td>
                    {displaySizes.length > 0 ? (
                      displaySizes.map((_, c) => (
                        <td key={c} className="val-center" style={{ height: '32px', minHeight: '32px' }}>&nbsp;</td>
                      ))
                    ) : (
                      Array.from({ length: 4 }).map((_, c) => (
                        <td key={c} className="val-center" style={{ height: '32px', minHeight: '32px' }}>&nbsp;</td>
                      ))
                    )}
                    {remainingCols > 0 && (
                      <td
                        colSpan={remainingCols}
                        style={{ border: 'none', background: '#fff' }}
                      ></td>
                    )}
                  </tr>
                );
              }

              return rows;
            }

            parts.forEach(part => {
              rows.push(
                <tr key={`part-hdr-${part}`}>
                  <th className="hdr-grey"><FitOneLine maxFontSize={13} minFontSize={6}>{t('export.doc.part_size_header', { part, defaultValue: `${part} Size` })}</FitOneLine></th>
                  {partSizes.map(s => <th key={s} className="hdr-grey"><FitOneLine maxFontSize={13} minFontSize={6}>{s}</FitOneLine></th>)}
                  {partSizes.length < maxSizeCols && (
                    <td colSpan={maxSizeCols - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                  )}

                  {isFirstRow && (
                    <td colSpan={imageColSpan} rowSpan={totalRows} style={{ padding: '6px', borderLeft: '3px solid #000', backgroundColor: '#fff', verticalAlign: 'middle', textAlign: 'center' }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '8px',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        width: '100%',
                        maxWidth: isMultiImage ? '380px' : '250px',
                        margin: '0 auto',
                        boxSizing: 'border-box'
                      }}>
                        {order.productImages?.filter(Boolean).map((img, idx) => (
                          <ProductImageFrame key={idx} img={img} index={idx} isMultiImage={isMultiImage} maxHeight={isMultiImage ? 250 : 275} />
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
              isFirstRow = false;

              const measurementsObj = order.groupedMeasurements ? order.groupedMeasurements[part] : order.measurements;
              Object.keys(measurementsObj || {}).forEach(mName => {
                rows.push(
                  <tr key={`m-${part}-${mName}`}>
                    <td className="val-bold val-left" style={{ paddingLeft: '6px' }}>{mName}</td>
                    {partSizes.map(s => (
                      <td key={s} className="val-center val-bold">{measurementsObj[mName]?.[s] || ''}</td>
                    ))}
                    {partSizes.length < maxSizeCols && (
                      <td colSpan={maxSizeCols - partSizes.length} style={{ border: 'none', background: '#fff' }}></td>
                    )}
                  </tr>
                );
              });
            });
            return rows;
          })()}

          {/* ═══ FABRICS & CONDITIONS ═══ */}
          {(() => {
            const numMaterials = [0, 1, 2].filter(i => order.materials && order.materials[i] && order.materials[i].name).length;
            const actualMaterials = Math.max(1, numMaterials);
            const fabricColSpan = 1 + (actualMaterials === 1 ? 2 : actualMaterials);
            const conditionsColSpan = 11 - 2 - fabricColSpan;

            return (
              <React.Fragment>
                <tr>
                  <th colSpan={fabricColSpan} className="hdr-blue">{t('export.doc.fabric_kind', 'Fabric Kind')}</th>
                  <th colSpan={conditionsColSpan} className="hdr-blue">{t('export.doc.conditions', 'Packaging Conditions')}</th>
                  <th colSpan={2} className="hdr-blue">{t('export.doc.remarks_header', 'Remarks')}</th>
                </tr>

                <tr>
                  <td colSpan={fabricColSpan} className="val-center val-bold bg-light-blue" style={{ fontSize: '14px' }}>
                    {order.productFabric || t('export.doc.default_fabric', 'Standard')}
                  </td>
                  <td colSpan={conditionsColSpan} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', color: '#c0392b', fontWeight: 800 }}>
                    {order.packagingConditions?.cond1 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond1_text', { val1: order.packagingConditions.cond1_val1 || '-', val2: order.packagingConditions.cond1_val2 || '-', defaultValue: 'Condition 1' })}</div>}
                    {order.packagingConditions?.cond2 && <div style={{ marginBottom: '4px' }}>* {t('export.doc.cond2_text', { val1: order.packagingConditions.cond2_val1 || '-', val2: order.packagingConditions.cond2_val2 || '-', defaultValue: 'Condition 2' })}</div>}
                    {lookups.packagingConditionsList?.filter(c => order.packagingConditions?.[c]).map((c, i) => <div key={i} style={{ marginBottom: '4px' }}>* {c}</div>)}
                  </td>
                  <td colSpan={2} rowSpan={3} style={{ verticalAlign: 'top', padding: '8px', fontSize: '12px', fontWeight: 800 }}>
                    {order.remarks || ''}
                  </td>
                </tr>

                <tr>
                  <th colSpan={1} className="hdr-light" style={{ backgroundColor: '#d0dbe5', whiteSpace: 'nowrap', padding: '4px 6px' }}>{t('export.doc.fabric_comp', 'Fabric Composition')}</th>
                  {[0, 1, 2].slice(0, actualMaterials).map(i => (
                    <td key={i} colSpan={actualMaterials === 1 ? 2 : 1} className="val-center val-bold">
                      {order.materials?.[i]?.name || ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th colSpan={1} className="hdr-light" style={{ backgroundColor: '#d0dbe5', whiteSpace: 'nowrap', padding: '4px 6px' }}>{t('export.doc.percentage', 'Percentage')}</th>
                  {[0, 1, 2].slice(0, actualMaterials).map(i => (
                    <td key={i} colSpan={actualMaterials === 1 ? 2 : 1} className="val-center val-bold" style={{ color: order.materials?.[i] ? '#38761d' : 'inherit' }}>
                      {order.materials?.[i] ? `${order.materials[i].percentage}%` : ''}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })()}

          {/* ═══ COLORS QTY & BARCODES ═══ */}
          <tr>
            <th colSpan={1} className="hdr-blue">{t('export.doc.colors_qty', 'Colors Qty')}</th>
            <td colSpan={10} className="val-center val-bold bg-light-blue" style={{ fontSize: '16px' }}>
              {activeColors.length || '0'}
            </td>
          </tr>

          {(() => {
            if (activeColors.length === 0) return null;

            const CHUNK_SIZE = 6;
            const numChunks = Math.ceil(activeColors.length / CHUNK_SIZE);
            const chunks = [];
            for (let i = 0; i < numChunks; i++) {
              const chunkColors = [];
              for (let j = 0; j < CHUNK_SIZE; j++) {
                const colorIndex = i * CHUNK_SIZE + j;
                if (colorIndex < activeColors.length) {
                  chunkColors.push(activeColors[colorIndex]);
                } else {
                  chunkColors.push(null);
                }
              }
              chunks.push(chunkColors);
            }

            const getColSpans = (total, count) => {
              if (count === 0) return [];
              const base = Math.floor(total / count);
              const rem = total % count;
              return Array(count).fill(0).map((_, i) => base + (i < rem ? 1 : 0));
            };

            return chunks.map((chunk, chunkIndex) => {
              const spans = getColSpans(10, chunk.length);
              return (
                <React.Fragment key={`color-chunk-${chunkIndex}`}>
                  <tr>
                    <th colSpan={1} className="hdr-light" style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.colors_zh', '颜色 / Colors')}</FitOneLine></th>
                    {chunk.map((c, i) => {
                      let hex = '';
                      if (c) {
                        const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                        if (cInfo && typeof cInfo === 'object' && cInfo.hex) hex = cInfo.hex;
                      }
                      return (
                        <td key={`c-${i}`} colSpan={spans[i]} className={c ? "val-center val-bold bg-light-blue" : ""} style={{ borderTop: chunkIndex > 0 ? '3px solid #000' : '1px solid #000' }}>
                          {c ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%', overflow: 'hidden' }}>
                              {hex && <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: hex, border: '1px solid #000', flexShrink: 0 }} />}
                              <FitOneLine maxFontSize={11} minFontSize={5}>{c}</FitOneLine>
                            </div>
                          ) : ''}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.qty_zh', '数量 / Qty')}</FitOneLine></th>
                    {chunk.map((c, i) => {
                      if (!c) return <td key={`q-${i}`} colSpan={spans[i]}></td>;
                      const qty = sizesToRender.reduce((sum, s) => sum + (parseInt(order.colorDistribution[c]?.[s]) || 0), 0);
                      return <td key={`q-${i}`} colSpan={spans[i]} className="val-center val-bold bg-light-blue"><FitOneLine maxFontSize={12} minFontSize={6}>{qty}</FitOneLine></td>;
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light"><FitOneLine maxFontSize={12} minFontSize={6}>{t('export.doc.color_barcodes', 'Color Barcodes')}</FitOneLine></th>
                    {chunk.map((c, i) => {
                      if (!c) return <td key={`b-${i}`} colSpan={spans[i]}></td>;
                      const cInfo = lookups.colors?.find(color => typeof color === 'object' ? color.name === c : color === c);
                      const code = (cInfo && typeof cInfo === 'object') ? (cInfo.abbr || cInfo.code || '') : '';
                      return <td key={`b-${i}`} colSpan={spans[i]} className="val-center val-bold" style={{ whiteSpace: 'nowrap' }}>
                        <FitOneLine maxFontSize={11} minFontSize={5}>{order.barcode ? `${order.barcode}${code ? '-' + code : ''}` : '-'}</FitOneLine>
                      </td>;
                    })}
                  </tr>
                  <tr>
                    <th colSpan={1} className="hdr-light" style={{ height: '70px', verticalAlign: 'middle' }}>{t('export.doc.fabric_samples', 'Fabric Samples')}</th>
                    {chunk.map((_, i) => (
                      <td key={`s-${i}`} colSpan={spans[i]}></td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            });
          })()}
        </tbody>
      </table>

      {/* ═══ FOOTER SIGNATURES (منفصلة تماماً في تذييل الصفحة) ═══ */}
      <div className="export-signatures-footer" style={{ 
        marginTop: 'auto', 
        paddingTop: '15px', 
        paddingBottom: '5px',
        paddingLeft: '25px', 
        paddingRight: '25px',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ marginBottom: '20px', fontSize: '13px', fontWeight: 800 }}>
              {t ? t('export.doc.name_zh', '客户名称') : '客户名称'} <span style={{ color: '#c0392b', marginLeft: '35px' }}>{t ? t('export.doc.buyer_sign', 'Buyer Sign') : 'Buyer Sign'}</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'flex-end' }}>
              {t ? t('export.doc.signature_zh', '客户签字') : '客户签字'} 
              <div style={{ display: 'inline-block', width: '180px', borderBottom: '2px solid #000', marginLeft: '12px' }}></div>
            </div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '13px', marginBottom: '20px' }}>{t ? t('export.doc.coordinator_sign', 'Coordinator Sign') : 'Coordinator Sign'}</div>
            <div style={{ display: 'inline-block', width: '210px', borderBottom: '2px solid #000' }}></div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#c0392b', fontWeight: 800, fontSize: '13px', marginBottom: '20px' }}>{t ? t('export.doc.factory_sign', 'Factory Sign') : 'Factory Sign'}</div>
            <div style={{ display: 'inline-block', width: '210px', borderBottom: '2px solid #000' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportOrderDocument;
