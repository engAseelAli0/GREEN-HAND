import { Link } from 'react-router-dom';
import { Edit3, Printer, Settings, Hexagon, Truck, Barcode, Factory, FileSpreadsheet, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const HomePortal = () => {
  const { t } = useTranslation();
  return (
    <div className="fade-in" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '80vh',
        padding: '2rem'
      }}>
      
      <style>{`
        .portal-container {
           text-align: center;
           margin-bottom: 4rem;
        }
        
        .portal-title {
           font-size: 3rem;
           font-weight: 900;
           background: linear-gradient(135deg, var(--text-strong) 0%, var(--accent-color) 100%);
           -webkit-background-clip: text;
           -webkit-text-fill-color: transparent;
           margin-bottom: 1rem;
           letter-spacing: -1px;
        }
        
        .portal-subtitle {
           color: var(--text-muted);
           font-size: 1.2rem;
           max-width: 600px;
           margin: 0 auto;
           line-height: 1.6;
        }

        .capsules-grid {
           display: grid;
           grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
           gap: 2.5rem;
           width: 100%;
           max-width: 1200px;
        }

        .capsule-card {
           background: linear-gradient(145deg, var(--surface-color) 0%, var(--bg-color) 100%);
           border: 1px solid rgba(212, 175, 55, 0.15);
           border-radius: 24px;
           padding: 3rem 2rem;
           text-align: center;
           text-decoration: none;
           display: flex;
           flex-direction: column;
           align-items: center;
           transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
           box-shadow: var(--shadow-md);
           position: relative;
           overflow: hidden;
        }

        .capsule-card::before {
           content: '';
           position: absolute;
           top: 0;
           left: 0;
           width: 100%;
           height: 100%;
           background: radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.08) 0%, transparent 70%);
           pointer-events: none;
        }

        .capsule-card:hover {
           transform: translateY(-15px);
           border-color: var(--accent-color);
           box-shadow: 0 20px 40px rgba(212, 175, 55, 0.15);
        }

        .capsule-card:hover .icon-ring {
           transform: scale(1.1) rotate(5deg);
           box-shadow: 0 0 25px rgba(212, 175, 55, 0.4);
        }

        .icon-ring {
           width: 90px;
           height: 90px;
           border-radius: 50%;
           background: var(--surface-highlight);
           display: flex;
           align-items: center;
           justify-content: center;
           margin-bottom: 2rem;
           border: 2px solid rgba(212, 175, 55, 0.3);
           transition: all 0.4s ease;
           color: var(--accent-color);
        }

        .capsule-title {
           color: var(--text-main);
           font-size: 1.5rem;
           font-weight: 800;
           margin-bottom: 1rem;
        }

        .capsule-desc {
           color: var(--text-muted);
           font-size: 1rem;
           line-height: 1.5;
        }
      `}</style>

      <div className="portal-container">
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(212, 175, 55, 0.1)', padding: '0.75rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
           <Hexagon size={40} color="var(--accent-color)" />
        </div>
        <h1 className="portal-title">GREEN HAND Platform</h1>
        <p className="portal-subtitle">
          {t('portal_welcome')}
        </p>
      </div>

      <div className="capsules-grid">
        
        {/* Capsule 1: Data Entry */}
        <Link to="/entry" className="capsule-card">
          <div className="icon-ring">
            <Edit3 size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.entry')}</h2>
          <p className="capsule-desc">
            {t('home.entry_desc')}
          </p>
        </Link>

        {/* Capsule 2: Export Document */}
        <Link to="/export" className="capsule-card">
          <div className="icon-ring" style={{ color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.3)' }}>
            <Printer size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.export')}</h2>
          <p className="capsule-desc">
            {t('home.export_desc')}
          </p>
        </Link>

        {/* Capsule 3: Admin & Settings */}
        <Link to="/admin" className="capsule-card">
          <div className="icon-ring" style={{ color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.3)' }}>
            <Settings size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.admin')}</h2>
          <p className="capsule-desc">
            {t('home.admin_desc')}
          </p>
        </Link>

        {/* Capsule 4: Factory Receiving */}
        <Link to="/receiving" className="capsule-card">
          <div className="icon-ring" style={{ color: '#4ade80', borderColor: 'rgba(74, 222, 128, 0.3)' }}>
            <Truck size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.receiving')}</h2>
          <p className="capsule-desc">
            {t('home.receiving_desc')}
          </p>
        </Link>

        {/* Capsule 4.5: Factory Portal */}
        <Link to="/factory-portal" className="capsule-card">
          <div className="icon-ring" style={{ color: '#d4af37', borderColor: 'rgba(212, 175, 55, 0.3)' }}>
            <Factory size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.factory_portal')}</h2>
          <p className="capsule-desc">
            {t('home.factory_portal_desc')}
          </p>
        </Link>

        {/* Capsule 5: Batch Barcodes */}
        <Link to="/barcodes" className="capsule-card">
          <div className="icon-ring" style={{ color: '#fb923c', borderColor: 'rgba(251, 146, 60, 0.3)' }}>
            <Barcode size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.barcodes')}</h2>
          <p className="capsule-desc">
            {t('home.barcodes_desc')}
          </p>
        </Link>

        {/* Capsule 6: Reports */}
        <Link to="/reports" className="capsule-card">
          <div className="icon-ring" style={{ color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.3)' }}>
            <Printer size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.reports')}</h2>
          <p className="capsule-desc">
            {t('home.reports_desc')}
          </p>
        </Link>

        {/* Capsule 7: Shipping Invoice */}
        <Link to="/shipping-invoice" className="capsule-card">
          <div className="icon-ring" style={{ color: '#06b6d4', borderColor: 'rgba(6, 182, 212, 0.3)' }}>
            <FileSpreadsheet size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.shipping_invoice')}</h2>
          <p className="capsule-desc">
            {t('home.shipping_invoice_desc')}
          </p>
        </Link>

        {/* Capsule 8: Packing List */}
        <Link to="/packing-list" className="capsule-card">
          <div className="icon-ring" style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <Package size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.packing_list')}</h2>
          <p className="capsule-desc">
            {t('home.packing_list_desc')}
          </p>
        </Link>

        {/* Capsule 9: Warehouse Receipt */}
        <Link to="/warehouse-receipt" className="capsule-card">
          <div className="icon-ring" style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <FileSpreadsheet size={40} />
          </div>
          <h2 className="capsule-title">{t('nav.warehouse_receipt')}</h2>
          <p className="capsule-desc">
            {t('home.warehouse_receipt_desc')}
          </p>
        </Link>

      </div>
    </div>
  );
};

export default HomePortal;
