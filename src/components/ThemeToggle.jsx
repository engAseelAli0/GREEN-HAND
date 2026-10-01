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
        color: theme === 'dark' ? 'var(--accent-color)' : 'var(--text-muted)',
        backgroundColor: 'var(--surface-color)',
        transition: 'all var(--transition-normal)',
        boxShadow: theme === 'dark' ? 'none' : 'var(--shadow-sm)',
      }}
      title={theme === 'dark' ? t('switch_light') : t('switch_dark')}
    >
      {theme === 'dark' ? (
        <Sun size={20} className="fade-in" />
      ) : (
        <Moon size={20} className="fade-in" />
      )}
    </button>
  );
};

export default ThemeToggle;
