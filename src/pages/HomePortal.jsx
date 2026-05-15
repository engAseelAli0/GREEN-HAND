import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, Printer, Settings, Hexagon, Truck, Barcode, Factory, FileSpreadsheet, Package, ChevronRight, Sparkles, BarChart3, ClipboardList, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const PAGE_GROUPS = [
  {
    id: 'orders',
    icon: ClipboardList,
    gradient: 'linear-gradient(135deg, #d4af37 0%, #f5d060 50%, #b8941f 100%)',
    glowColor: 'rgba(212, 175, 55, 0.4)',
    bgPattern: 'radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.12) 0%, transparent 50%)',
    accentColor: '#d4af37',
    titleKey: 'groups.orders.title',
    descKey: 'groups.orders.desc',
    pages: [
      { path: '/entry', icon: Edit3, color: '#d4af37', titleKey: 'nav.entry' },
      { path: '/export', icon: Printer, color: '#60a5fa', titleKey: 'nav.export' },
    ]
  },
  {
    id: 'factory',
    icon: Factory,
    gradient: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 50%, #10b981 100%)',
    glowColor: 'rgba(52, 211, 153, 0.35)',
    bgPattern: 'radial-gradient(circle at 20% 80%, rgba(52, 211, 153, 0.1) 0%, transparent 50%)',
    accentColor: '#34d399',
    titleKey: 'groups.factory.title',
    descKey: 'groups.factory.desc',
    pages: [
      { path: '/receiving', icon: Truck, color: '#4ade80', titleKey: 'nav.receiving' },
      { path: '/factory-portal', icon: Factory, color: '#d4af37', titleKey: 'nav.factory_portal' },
    ]
  },
  {
    id: 'reports',
    icon: BarChart3,
    gradient: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 50%, #3b82f6 100%)',
    glowColor: 'rgba(96, 165, 250, 0.35)',
    bgPattern: 'radial-gradient(circle at 80% 80%, rgba(96, 165, 250, 0.1) 0%, transparent 50%)',
    accentColor: '#60a5fa',
    titleKey: 'groups.reports.title',
    descKey: 'groups.reports.desc',
    pages: [
      { path: '/reports', icon: BarChart3, color: '#ec4899', titleKey: 'nav.reports' },
      { path: '/shipping-invoice', icon: FileSpreadsheet, color: '#06b6d4', titleKey: 'nav.shipping_invoice' },
      { path: '/packing-list', icon: Package, color: '#10b981', titleKey: 'nav.packing_list' },
      { path: '/warehouse-receipt', icon: FileSpreadsheet, color: '#f59e0b', titleKey: 'nav.warehouse_receipt' },
      { path: '/barcodes', icon: Barcode, color: '#fb923c', titleKey: 'nav.barcodes' },
    ]
  },
  {
    id: 'admin',
    icon: Settings,
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #c4b5fd 50%, #7c3aed 100%)',
    glowColor: 'rgba(167, 139, 250, 0.35)',
    bgPattern: 'radial-gradient(circle at 50% 20%, rgba(167, 139, 250, 0.1) 0%, transparent 50%)',
    accentColor: '#a78bfa',
    titleKey: 'groups.admin.title',
    descKey: 'groups.admin.desc',
    directPath: '/admin',
    pages: [
      { path: '/admin', icon: Settings, color: '#a78bfa', titleKey: 'nav.admin' },
    ]
  },
];

const HomePortal = () => {
  const { t } = useTranslation();
  const { hasAccess } = useAuth();
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const visibleGroups = PAGE_GROUPS.map(group => ({
    ...group,
    pages: group.pages.filter(page => hasAccess(page.path))
  })).filter(group => group.pages.length > 0);

  const handleGroupClick = (group) => {
    if (group.directPath && group.pages.length === 1) return;
    setExpandedGroup(expandedGroup === group.id ? null : group.id);
  };

  return (
    <div className="fade-in" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        minHeight: '80vh',
        padding: '2rem'
      }}>
      
      <style>{`
        /* ═══ Hero Section ═══ */
        .hero-section {
           text-align: center;
           margin-bottom: 3rem;
           position: relative;
        }
        
        .hero-badge {
           display: inline-flex;
           align-items: center;
           gap: 0.5rem;
           background: rgba(212, 175, 55, 0.08);
           border: 1px solid rgba(212, 175, 55, 0.15);
           padding: 0.5rem 1.25rem;
           border-radius: 50px;
           font-size: 0.8rem;
           color: var(--accent-color);
           font-weight: 600;
           margin-bottom: 1.25rem;
           letter-spacing: 0.02em;
        }
        
        .hero-title {
           font-size: 2.75rem;
           font-weight: 900;
           background: linear-gradient(135deg, var(--text-strong) 0%, var(--accent-color) 60%, #f5d060 100%);
           -webkit-background-clip: text;
           -webkit-text-fill-color: transparent;
           margin-bottom: 0.75rem;
           letter-spacing: -1.5px;
           line-height: 1.1;
        }
        
        .hero-subtitle {
           color: var(--text-muted);
           font-size: 1rem;
           max-width: 500px;
           margin: 0 auto;
           line-height: 1.6;
           opacity: 0.8;
        }

        /* ═══ Bento Grid ═══ */
        .bento-grid {
           display: grid;
           grid-template-columns: repeat(3, 1fr);
           grid-template-rows: auto;
           gap: 1rem;
           width: 100%;
           max-width: 1000px;
        }

        /* First card spans 2 columns when not expanded */
        .bento-grid .bento-card:nth-child(1) { grid-column: span 1; }
        .bento-grid .bento-card:nth-child(2) { grid-column: span 1; }
        .bento-grid .bento-card:nth-child(3) { grid-column: span 1; }
        /* Admin takes full width bottom */
        .bento-grid .bento-card:nth-child(4) { grid-column: 1 / -1; }

        /* ═══ Bento Card ═══ */
        .bento-card {
           position: relative;
           border-radius: 20px;
           overflow: hidden;
           cursor: pointer;
           transition: all 0.45s cubic-bezier(0.23, 1, 0.32, 1);
           border: 1px solid rgba(255, 255, 255, 0.06);
           background: var(--surface-color);
        }

        .bento-card::before {
           content: '';
           position: absolute;
           inset: 0;
           border-radius: 20px;
           padding: 1px;
           background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
           -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
           -webkit-mask-composite: xor;
           mask-composite: exclude;
           pointer-events: none;
           opacity: 0;
           transition: opacity 0.4s ease;
        }

        .bento-card:hover::before {
           opacity: 1;
        }

        .bento-card:hover {
           transform: translateY(-6px) scale(1.01);
           box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        }

        .bento-card.direct-card:hover {
           border-color: rgba(167, 139, 250, 0.25);
        }

        /* ═══ Card Inner ═══ */
        .bento-inner {
           position: relative;
           z-index: 1;
           padding: 1.75rem;
           height: 100%;
           display: flex;
           flex-direction: column;
        }

        /* Background glow orb */
        .bento-glow {
           position: absolute;
           width: 200px;
           height: 200px;
           border-radius: 50%;
           filter: blur(80px);
           opacity: 0.15;
           transition: opacity 0.5s ease, transform 0.5s ease;
           pointer-events: none;
           z-index: 0;
        }

        .bento-card:hover .bento-glow {
           opacity: 0.3;
           transform: scale(1.2);
        }

        /* ═══ Icon Container ═══ */
        .bento-icon-wrap {
           width: 52px;
           height: 52px;
           border-radius: 16px;
           display: flex;
           align-items: center;
           justify-content: center;
           margin-bottom: 1.25rem;
           position: relative;
           transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }

        .bento-icon-wrap::after {
           content: '';
           position: absolute;
           inset: -3px;
           border-radius: 18px;
           opacity: 0;
           transition: opacity 0.4s ease;
           pointer-events: none;
        }

        .bento-card:hover .bento-icon-wrap {
           transform: scale(1.1) rotate(-3deg);
        }

        .bento-card:hover .bento-icon-wrap::after {
           opacity: 0.5;
        }

        /* ═══ Text ═══ */
        .bento-title {
           font-size: 1.35rem;
           font-weight: 800;
           color: var(--text-strong);
           margin-bottom: 0.5rem;
           display: flex;
           align-items: center;
           gap: 0.6rem;
           line-height: 1.2;
        }

        .bento-count {
           display: inline-flex;
           align-items: center;
           justify-content: center;
           width: 22px;
           height: 22px;
           border-radius: 7px;
           font-size: 0.72rem;
           font-weight: 800;
           color: #fff;
           font-family: 'Outfit', sans-serif;
           flex-shrink: 0;
        }

        .bento-desc {
           color: var(--text-muted);
           font-size: 0.85rem;
           line-height: 1.5;
           flex: 1;
           opacity: 0.75;
        }

        /* ═══ Bottom action hint ═══ */
        .bento-action {
           display: flex;
           align-items: center;
           gap: 0.4rem;
           margin-top: 1.25rem;
           font-size: 0.78rem;
           font-weight: 600;
           opacity: 0;
           transform: translateY(6px);
           transition: all 0.35s ease;
        }

        .bento-card:hover .bento-action {
           opacity: 0.7;
           transform: translateY(0);
        }

        .bento-action-arrow {
           transition: transform 0.25s ease;
        }

        .bento-card:hover .bento-action-arrow {
           transform: translateX(-3px);
        }

        [dir="ltr"] .bento-card:hover .bento-action-arrow {
           transform: translateX(3px);
        }

        /* ═══ Expanded Sub-Pages ═══ */
        .bento-pages {
           display: grid;
           grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
           gap: 0.65rem;
           margin-top: 1.25rem;
           padding-top: 1.25rem;
           border-top: 1px solid rgba(255, 255, 255, 0.06);
           animation: pagesReveal 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        }

        @keyframes pagesReveal {
           from { opacity: 0; transform: translateY(-8px); }
           to { opacity: 1; transform: translateY(0); }
        }

        .page-chip {
           display: flex;
           align-items: center;
           gap: 0.65rem;
           padding: 0.75rem 1rem;
           background: rgba(255, 255, 255, 0.03);
           border: 1px solid rgba(255, 255, 255, 0.05);
           border-radius: 14px;
           text-decoration: none;
           transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
           cursor: pointer;
           position: relative;
           overflow: hidden;
        }

        .page-chip::before {
           content: '';
           position: absolute;
           inset: 0;
           background: linear-gradient(135deg, rgba(255,255,255,0.04), transparent);
           opacity: 0;
           transition: opacity 0.3s ease;
        }

        .page-chip:hover {
           transform: translateY(-3px) scale(1.02);
           border-color: rgba(255, 255, 255, 0.12);
           box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
        }

        .page-chip:hover::before {
           opacity: 1;
        }

        .page-chip:active {
           transform: translateY(-1px) scale(0.99);
        }

        .page-chip-icon {
           width: 36px;
           height: 36px;
           border-radius: 10px;
           display: flex;
           align-items: center;
           justify-content: center;
           flex-shrink: 0;
           transition: transform 0.3s ease;
        }

        .page-chip:hover .page-chip-icon {
           transform: scale(1.12) rotate(-5deg);
        }

        .page-chip-label {
           color: var(--text-main);
           font-size: 0.82rem;
           font-weight: 600;
           line-height: 1.25;
           flex: 1;
        }

        .page-chip-go {
           width: 24px;
           height: 24px;
           border-radius: 6px;
           background: rgba(255, 255, 255, 0.04);
           display: flex;
           align-items: center;
           justify-content: center;
           flex-shrink: 0;
           opacity: 0;
           transform: scale(0.8);
           transition: all 0.25s ease;
           color: var(--text-muted);
        }

        .page-chip:hover .page-chip-go {
           opacity: 1;
           transform: scale(1);
        }

        /* ═══ Admin card special — horizontal compact ═══ */
        .bento-card.admin-card .bento-inner {
           flex-direction: row;
           align-items: center;
           gap: 1.25rem;
           padding: 1.25rem 1.75rem;
        }

        .bento-card.admin-card .bento-icon-wrap {
           margin-bottom: 0;
        }

        .bento-card.admin-card .bento-text-wrap {
           flex: 1;
        }

        .bento-card.admin-card .bento-title {
           margin-bottom: 0.2rem;
        }

        .bento-card.admin-card .bento-desc {
           margin-bottom: 0;
        }

        .bento-card.admin-card .bento-action {
           margin-top: 0;
           margin-inline-start: auto;
        }

        .bento-card.admin-card:hover .bento-action {
           opacity: 1;
        }

        /* ═══ Glass Modal ═══ */
        .glass-modal-overlay {
           position: fixed;
           inset: 0;
           background: rgba(10, 14, 23, 0.6);
           backdrop-filter: blur(16px);
           -webkit-backdrop-filter: blur(16px);
           z-index: 999;
           display: flex;
           align-items: center;
           justify-content: center;
           padding: 2rem;
           animation: overlayFadeIn 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
           opacity: 0;
        }

        @keyframes overlayFadeIn {
           from { opacity: 0; }
           to { opacity: 1; }
        }

        .glass-modal-content {
           background: linear-gradient(145deg, rgba(30, 36, 48, 0.9), rgba(20, 25, 34, 0.95));
           border: 1px solid rgba(255, 255, 255, 0.1);
           box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.15);
           border-radius: 28px;
           width: 100%;
           max-width: 600px;
           padding: 2.5rem;
           position: relative;
           transform: scale(0.9) translateY(20px);
           animation: modalPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes modalPopIn {
           to { transform: scale(1) translateY(0); }
        }

        .glass-modal-close {
           position: absolute;
           top: 1.25rem;
           right: 1.25rem;
           width: 36px;
           height: 36px;
           border-radius: 50%;
           background: rgba(255, 255, 255, 0.05);
           border: 1px solid rgba(255, 255, 255, 0.1);
           display: flex;
           align-items: center;
           justify-content: center;
           cursor: pointer;
           color: var(--text-muted);
           font-size: 1.2rem;
           transition: all 0.25s ease;
           z-index: 10;
        }

        [dir="rtl"] .glass-modal-close {
           right: auto;
           left: 1.25rem;
        }

        .glass-modal-close:hover {
           background: rgba(239, 68, 68, 0.15);
           color: #ef4444;
           border-color: rgba(239, 68, 68, 0.3);
           transform: rotate(90deg);
        }

        .modal-header {
           display: flex;
           align-items: center;
           gap: 1rem;
           margin-bottom: 2rem;
           padding-bottom: 1.5rem;
           border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .modal-icon-wrap {
           width: 60px;
           height: 60px;
           border-radius: 18px;
           display: flex;
           align-items: center;
           justify-content: center;
           box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
        }

        .modal-title-box {
           flex: 1;
        }

        .modal-title {
           font-size: 1.75rem;
           font-weight: 800;
           color: var(--text-strong);
           margin-bottom: 0.25rem;
           line-height: 1.2;
        }

        .modal-desc {
           color: var(--text-muted);
           font-size: 0.95rem;
        }

        /* ═══ Responsive ═══ */
        @media (max-width: 900px) {
           .bento-grid {
              grid-template-columns: 1fr 1fr;
           }
           .bento-grid .bento-card:nth-child(3) { grid-column: 1 / -1; }
           .hero-title { font-size: 2rem; }
        }

        @media (max-width: 600px) {
           .bento-grid {
              grid-template-columns: 1fr;
           }
           .bento-grid .bento-card:nth-child(1),
           .bento-grid .bento-card:nth-child(2),
           .bento-grid .bento-card:nth-child(3),
           .bento-grid .bento-card:nth-child(4) {
              grid-column: 1;
           }
           .bento-card.admin-card .bento-inner {
              flex-direction: column;
              align-items: flex-start;
           }
           .bento-card.admin-card .bento-icon-wrap {
              margin-bottom: 0.75rem;
           }
           .bento-card.admin-card .bento-action {
              margin-inline-start: 0;
              margin-top: 0.75rem;
           }
           .bento-pages {
              grid-template-columns: 1fr;
           }
           .hero-title { font-size: 1.75rem; }
        }
      `}</style>

      {/* ═══ Hero Section ═══ */}
      <div className="hero-section">
        <div className="hero-badge">
          <Sparkles size={14} />
          GREEN HAND
        </div>
        <h1 className="hero-title">{t('app_title')}</h1>
        <p className="hero-subtitle">{t('portal_welcome')}</p>
      </div>

      {/* ═══ Bento Grid ═══ */}
      <div className="bento-grid">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = expandedGroup === group.id;
          const isSinglePage = group.directPath && group.pages.length === 1;
          const isAdmin = group.id === 'admin';
          const isHovered = hoveredGroup === group.id;

          const CardWrapper = isSinglePage ? Link : 'div';
          const wrapperProps = isSinglePage ? { to: group.directPath, style: { textDecoration: 'none', color: 'inherit' } } : {};

          return (
            <CardWrapper
              key={group.id}
              {...wrapperProps}
              className={`bento-card ${isAdmin ? 'admin-card direct-card' : ''}`}
              onClick={() => handleGroupClick(group)}
              onMouseEnter={() => setHoveredGroup(group.id)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {/* Glow orb */}
              <div className="bento-glow" style={{
                background: group.glowColor,
                top: isAdmin ? '50%' : '-20%',
                right: isAdmin ? '-10%' : '-15%',
                transform: `translate(0, ${isAdmin ? '-50%' : '0'})`
              }} />

              <div className="bento-inner">
                {/* Icon */}
                <div className="bento-icon-wrap" style={{
                  background: group.gradient,
                  boxShadow: isHovered ? `0 8px 25px ${group.glowColor}` : `0 4px 12px rgba(0,0,0,0.2)`,
                }}>
                  <GroupIcon size={24} color="#fff" strokeWidth={2.2} />
                </div>

                {isAdmin ? (
                  <>
                    <div className="bento-text-wrap">
                      <h2 className="bento-title">
                        {t(group.titleKey)}
                        <span className="bento-count" style={{ background: group.gradient }}>{group.pages.length}</span>
                      </h2>
                      <p className="bento-desc">{t(group.descKey)}</p>
                    </div>
                    <div className="bento-action" style={{ color: group.accentColor }}>
                      <ArrowUpRight size={18} className="bento-action-arrow" />
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="bento-title">
                      {t(group.titleKey)}
                      <span className="bento-count" style={{ background: group.gradient }}>{group.pages.length}</span>
                    </h2>
                    <p className="bento-desc">{t(group.descKey)}</p>
                    
                    <div className="bento-action" style={{ color: group.accentColor }}>
                      <span>{t('groups.open_hint') || 'اضغط للفتح'}</span>
                      <ChevronRight size={14} className="bento-action-arrow" />
                    </div>
                  </>
                )}
              </div>
            </CardWrapper>
          );
        })}
      </div>

      {/* ═══ Glass Modal Overlay ═══ */}
      {expandedGroup && (() => {
        const activeGroupData = visibleGroups.find(g => g.id === expandedGroup);
        if (!activeGroupData) return null;
        const ActiveGroupIcon = activeGroupData.icon;
        
        return (
          <div className="glass-modal-overlay" onClick={() => setExpandedGroup(null)}>
            <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="glass-modal-close" onClick={() => setExpandedGroup(null)}>✕</button>
              
              <div className="modal-header">
                <div className="modal-icon-wrap" style={{ background: activeGroupData.gradient }}>
                  <ActiveGroupIcon size={32} color="#fff" strokeWidth={2} />
                </div>
                <div className="modal-title-box">
                  <h2 className="modal-title" style={{
                    background: activeGroupData.gradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    {t(activeGroupData.titleKey)}
                  </h2>
                  <p className="modal-desc">{t(activeGroupData.descKey)}</p>
                </div>
              </div>

              <div className="bento-pages" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                {activeGroupData.pages.map((page) => {
                  const PageIcon = page.icon;
                  return (
                    <Link key={page.path} to={page.path} className="page-chip">
                      <div className="page-chip-icon" style={{
                        background: `${page.color}12`,
                        border: `1px solid ${page.color}25`,
                      }}>
                        <PageIcon size={20} color={page.color} />
                      </div>
                      <span className="page-chip-label" style={{ fontSize: '1.05rem' }}>{t(page.titleKey)}</span>
                      <div className="page-chip-go">
                        <ArrowUpRight size={18} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default HomePortal;
