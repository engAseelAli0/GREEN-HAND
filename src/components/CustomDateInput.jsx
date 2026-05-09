import React from 'react';
import { Calendar } from 'lucide-react';

export const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export const CustomDateInput = ({ label, value, onChange, min }) => {
  return (
    <div className="form-group">
      {label && <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input 
          type="text" 
          className="form-control" 
          value={formatDateForDisplay(value)} 
          placeholder="DD/MM/YYYY"
          readOnly
          style={{ cursor: 'pointer', backgroundColor: 'var(--bg-color)' }}
          onClick={(e) => {
             const picker = e.currentTarget.nextSibling;
             if (picker && picker.showPicker) picker.showPicker();
          }}
        />
        <input 
          type="date" 
          className="form-control"
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            opacity: 0, 
            cursor: 'pointer',
            padding: 0
          }} 
          value={value || ''} 
          min={min || ''}
          onChange={(e) => onChange(e.target.value)} 
          onClick={(e) => {
            if (e.target.showPicker) e.target.showPicker();
          }}
        />
        <div style={{ 
          position: 'absolute', 
          left: '12px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          pointerEvents: 'none',
          opacity: 0.7,
          color: 'var(--accent-color)',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Calendar size={18} />
        </div>
      </div>
    </div>
  );
};
