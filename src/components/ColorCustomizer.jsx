import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const ColorCustomizer = () => {
  const { t, i18n } = useTranslation();
  const { accentColor, setAccentColor } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  const PRESETS = [
    { hex: '#d4af37', name: 'Gold' },
    { hex: '#10b981', name: 'Emerald' },
    { hex: '#3b82f6', name: 'Blue' },
    { hex: '#8b5cf6', name: 'Purple' },
    { hex: '#f43f5e', name: 'Rose' },
    { hex: '#f59e0b', name: 'Amber' }
  ];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isRtl = i18n.language === 'ar';

  return (
    <div ref={popoverRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="btn btn-outline"
        style={{
          width: '42px',
          height: '42px',
          padding: 0,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: isOpen ? 'var(--accent-color)' : 'var(--border-color)',
          color: 'var(--accent-color)',
          backgroundColor: 'var(--surface-color)',
          transition: 'all var(--transition-normal)',
          boxShadow: isOpen ? 'var(--shadow-gold)' : 'none',
        }}
        title={t('customize_colors')}
      >
        <Palette size={20} style={{ transition: 'transform 0.3s ease', transform: isOpen ? 'rotate(15deg) scale(1.1)' : 'rotate(0)' }} />
      </button>

      {isOpen && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: isRtl ? 0 : 'auto',
            left: isRtl ? 'auto' : 0,
            padding: '1rem',
            width: '240px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            backgroundColor: 'var(--surface-color)',
            borderColor: 'var(--border-color)',
            animation: 'fadeInUpColor 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: 'var(--shadow-lg), 0 0 0 1px var(--border-color)',
          }}
        >
          <style>{`
            @keyframes fadeInUpColor {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-strong)' }}>
              {t('customize_colors')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('preset_colors')}
            </span>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', padding: '0.2rem 0' }}>
              {PRESETS.map((color) => {
                const isActive = accentColor.toLowerCase() === color.hex.toLowerCase();
                return (
                  <button
                    key={color.hex}
                    onClick={() => setAccentColor(color.hex)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: color.hex,
                      border: isActive ? '2px solid var(--text-strong)' : '1px solid rgba(255,255,255,0.2)',
                      boxShadow: isActive ? `0 0 12px ${color.hex}80` : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isActive ? 'scale(1.2)' : 'scale(1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}
                    title={color.name}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.transform = 'scale(1.1)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    {isActive && <Check size={14} color="#fff" style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('custom_color')}</span>
              <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    left: '-5px',
                    width: '38px',
                    height: '38px',
                    cursor: 'pointer',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    background: 'transparent'
                  }}
                />
              </div>
            </div>
            {accentColor.toLowerCase() !== '#d4af37' && (
              <button
                onClick={() => setAccentColor('#d4af37')}
                className="btn-text"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  transition: 'color var(--transition-fast)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                {t('reset_to_default')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorCustomizer;
