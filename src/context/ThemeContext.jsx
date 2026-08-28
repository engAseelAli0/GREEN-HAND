/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const hexToRgb = (hex) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const darkenColor = (hex, percent) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.min(255, Math.round(rgb.r * (1 - percent))));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g * (1 - percent))));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b * (1 - percent))));
  const hexStr = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  return `#${hexStr}`;
};

export const ThemeProvider = ({ children }) => {
  // Check if theme is saved in localStorage, default to 'dark'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'dark';
  });

  // Check if accent color is saved in localStorage, default to Brand Gold (#d4af37)
  const [accentColor, setAccentColorState] = useState(() => {
    const saved = localStorage.getItem('app-accent-color');
    if (!saved) return '#d4af37';
    return saved.startsWith('#') ? saved : `#${saved}`;
  });

  const setAccentColor = (newColor) => {
    if (!newColor) {
      setAccentColorState('#d4af37');
      return;
    }
    const formatted = String(newColor).trim().startsWith('#') ? String(newColor).trim() : `#${String(newColor).trim()}`;
    setAccentColorState(formatted);
  };

  useEffect(() => {
    // Apply theme to html element
    document.documentElement.setAttribute('data-theme', theme);
    // Save to localStorage
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Apply accent color to document root custom property
    document.documentElement.style.setProperty('--accent-color', accentColor);
    
    // Apply hover variation
    const hoverColor = darkenColor(accentColor, 0.15);
    document.documentElement.style.setProperty('--accent-hover', hoverColor);
    
    // Set border focus same as accent color
    document.documentElement.style.setProperty('--border-focus', accentColor);
    
    // Set matching shadow-gold with opacity depending on the theme
    const rgb = hexToRgb(accentColor);
    if (rgb) {
      document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      const alpha = theme === 'dark' ? 0.2 : 0.1;
      document.documentElement.style.setProperty('--shadow-gold', `0 4px 14px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    }

    // Save to localStorage
    localStorage.setItem('app-accent-color', accentColor);
  }, [accentColor, theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
