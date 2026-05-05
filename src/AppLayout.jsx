import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Edit3, Printer, Truck, Factory, Barcode, FileSpreadsheet, Package, ChevronDown } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

const NAV_PAGES = [
  { path: '/entry', label: 'أوامر الإنتاج وتوثيق الطلبيات', icon: Edit3, color: 'var(--accent-color)' },
  { path: '/export', label: 'مستندات وفواتير التصدير', icon: Printer, color: '#60a5fa' },
  { path: '/admin', label: 'لوحة الإدارة والإعدادات', icon: Settings, color: '#a78bfa' },
  { path: '/receiving', label: 'استلام البضائع والفرز', icon: Truck, color: '#4ade80' },
  { path: '/factory-portal', label: 'بوابة المصنع', icon: Factory, color: '#d4af37' },
  { path: '/barcodes', label: 'دفعات الباركود (Batches)', icon: Barcode, color: '#fb923c' },
  { path: '/reports', label: 'التقارير والإحصائيات', icon: Printer, color: '#ec4899' },
  { path: '/shipping-invoice', label: 'فاتورة الشحن', icon: FileSpreadsheet, color: '#06b6d4' },
  { path: '/packing-list', label: 'بوليصة التعبئة (Packing List)', icon: Package, color: '#10b981' },
];

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNavDropdown, setShowNavDropdown] = useState(false);
  const navDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navDropdownRef.current && !navDropdownRef.current.contains(e.target)) {
        setShowNavDropdown(false);
      }
    };
    if (showNavDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNavDropdown]);

  // Close dropdown on route change
  useEffect(() => {
    setShowNavDropdown(false);
  }, [location.pathname]);

  return (
    <div className="app-container">
      <header className="glass-panel hide-on-print" style={{ margin: '1rem 2rem', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            background: 'var(--accent-color)', 
            color: 'white', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-gold)'
          }}>
            <Edit3 size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }} className="text-gradient">
              نظام إدارة الطلبيات
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              إدخال وتتبع بيانات المنتجات والمصانع
            </p>
          </div>
        </div>

        <nav className="no-print" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {location.pathname !== '/' && (
            <>
              {/* Go To... Dropdown */}
              <div ref={navDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowNavDropdown(prev => !prev)}
                  className="btn btn-outline"
                  style={{
                    display: 'flex', gap: '0.5rem', alignItems: 'center',
                    borderColor: 'rgba(212, 175, 55, 0.3)', color: 'var(--text-muted)',
                    padding: '0.5rem 1rem', fontSize: '0.9rem',
                    transition: 'all 0.2s',
                    borderWidth: showNavDropdown ? '2px' : '1px',
                    borderColor: showNavDropdown ? 'var(--accent-color)' : 'rgba(212, 175, 55, 0.3)',
                    color: showNavDropdown ? 'var(--accent-color)' : 'var(--text-muted)',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>📌</span>
                  الذهاب إلى...
                  <ChevronDown size={15} style={{ 
                    transform: showNavDropdown ? 'rotate(180deg)' : 'rotate(0deg)', 
                    transition: 'transform 0.2s', 
                    opacity: 0.7 
                  }} />
                </button>
                {showNavDropdown && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, left: 'auto',
                    width: '300px',
                    backgroundColor: 'var(--surface-color)',
                    border: '2px solid var(--accent-color)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                    zIndex: 9999, overflow: 'hidden',
                    animation: 'fadeIn 0.15s ease'
                  }}>
                    <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--surface-highlight)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                      انتقل سريعاً إلى:
                    </div>
                    {NAV_PAGES.map((page) => {
                      const Icon = page.icon;
                      const isActive = location.pathname === page.path;
                      return (
                        <div
                          key={page.path}
                          onClick={() => {
                            navigate(page.path);
                            setShowNavDropdown(false);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.7rem',
                            padding: '0.65rem 1rem', cursor: 'pointer',
                            transition: 'background-color 0.15s',
                            backgroundColor: isActive ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                            borderRight: isActive ? '3px solid var(--accent-color)' : '3px solid transparent',
                            opacity: isActive ? 0.6 : 1,
                            pointerEvents: isActive ? 'none' : 'auto'
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            backgroundColor: `${page.color}15`,
                            border: `1px solid ${page.color}30`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Icon size={16} color={page.color} />
                          </div>
                          <span style={{ 
                            fontSize: '0.88rem', fontWeight: isActive ? 'bold' : '500', 
                            color: isActive ? 'var(--accent-color)' : 'var(--text-main)' 
                          }}>
                            {page.label}
                            {isActive && <span style={{ fontSize: '0.75rem', marginRight: '0.4rem', opacity: 0.7 }}>(أنت هنا)</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Home Button */}
              <Link 
                to="/" 
                className="btn btn-outline"
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
              >
                <span style={{ fontSize: '1.2rem' }}>🏠</span>
                عودة للرئيسية
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="main-content fade-in">
        <Outlet />
      </main>

      <Toaster 
        containerClassName="hide-on-print"
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--surface-highlight)',
            color: 'var(--text-main)',
            border: '1px solid var(--accent-color)',
            fontFamily: 'Tajawal, sans-serif',
            boxShadow: 'var(--shadow-gold)'
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: 'var(--surface-color)',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: 'var(--surface-color)',
            },
            style: {
              border: '1px solid #ef4444'
            }
          },
        }}
      />
    </div>
  );
};

export default AppLayout;
