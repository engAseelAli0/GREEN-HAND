import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, ChevronDown, Check } from 'lucide-react';

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const languages = [
    { code: 'ar', label: 'العربية', flag: '🇾🇪' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
  ];

  const currentLanguage = languages.find(lang => lang.code === (i18n.language?.split('-')[0] || 'ar')) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = (code) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-outline"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.5rem 0.8rem',
          borderColor: isOpen ? 'var(--accent-color)' : 'rgba(212, 175, 55, 0.2)',
          color: 'var(--text-main)',
          fontSize: '0.9rem',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          minWidth: '120px',
          justifyContent: 'space-between',
          background: isOpen ? 'rgba(212, 175, 55, 0.05)' : 'transparent',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Languages size={18} style={{ color: 'var(--accent-color)', opacity: 0.8 }} />
          <span>{currentLanguage.flag} {currentLanguage.label}</span>
        </div>
        <ChevronDown 
          size={14} 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
            transition: 'transform 0.3s ease',
            opacity: 0.5
          }} 
        />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: i18n.language === 'ar' ? 0 : 'auto',
          left: i18n.language === 'ar' ? 'auto' : 0,
          backgroundColor: 'var(--surface-color)',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5), 0 0 0 1px rgba(212, 175, 55, 0.1)',
          zIndex: 1000,
          minWidth: '160px',
          overflow: 'hidden',
          animation: 'fadeInUp 0.2s ease-out'
        }}>
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {languages.map((lang) => {
            const isSelected = currentLanguage.code === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => toggleLanguage(lang.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                  color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                  cursor: 'pointer',
                  textAlign: i18n.language === 'ar' ? 'right' : 'left',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                  fontWeight: isSelected ? '600' : '400',
                  borderRight: (isSelected && i18n.language === 'ar') ? '3px solid var(--accent-color)' : 'none',
                  borderLeft: (isSelected && i18n.language !== 'ar') ? '3px solid var(--accent-color)' : 'none',
                }}
                onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{lang.flag}</span>
                  <span>{lang.label}</span>
                </div>
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
