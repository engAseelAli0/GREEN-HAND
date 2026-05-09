import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-outline"
      style={{
        width: '42px',
        height: '42px',
        padding: 0,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: 'var(--border-color)',
        color: theme === 'dark' ? 'var(--accent-color)' : '#f59e0b',
        backgroundColor: 'var(--surface-color)',
        transition: 'all var(--transition-normal)',
        boxShadow: theme === 'dark' ? 'none' : '0 0 15px rgba(245, 158, 11, 0.2)',
      }}
      title={theme === 'dark' ? t('switch_light') : t('switch_dark')}
    >
      {theme === 'dark' ? (
        <Sun size={20} className="fade-in" />
      ) : (
        <Moon size={20} className="fade-in" color="#475569" />
      )}
    </button>
  );
};

export default ThemeToggle;
