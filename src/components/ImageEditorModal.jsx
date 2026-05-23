import React, { useRef, useEffect } from 'react';
import ImageEditor from '@toast-ui/react-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';
import { X, Check, ImagePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// اختياري: تخصيص الألوان لتبدو داكنة وأنيقة
const myTheme = {
  'common.bi.image': 'https://uicdn.toast.com/toastui/img/tui-image-editor-bi.png',
  'common.bisize.width': '0', // إخفاء اللوجو
  'common.bisize.height': '0',
  'common.backgroundImage': '#1a1a1a',
  'common.backgroundColor': '#1a1a1a',
  'common.border': '1px solid #333',
  'header.backgroundImage': 'none',
  'header.backgroundColor': 'transparent',
  'header.border': '0px',
  'loadButton.backgroundColor': '#fff',
  'loadButton.border': '1px solid #ddd',
  'loadButton.color': '#222',
  'loadButton.fontFamily': 'NotoSans, sans-serif',
  'loadButton.fontSize': '12px',
  'downloadButton.backgroundColor': '#10b981',
  'downloadButton.border': '1px solid #10b981',
  'downloadButton.color': '#fff',
  'downloadButton.fontFamily': 'NotoSans, sans-serif',
  'downloadButton.fontSize': '12px',
  'menu.normalIcon.color': '#8a8a8a',
  'menu.activeIcon.color': '#555555',
  'menu.disabledIcon.color': '#434343',
  'menu.hoverIcon.color': '#e9e9e9',
  'submenu.normalIcon.color': '#8a8a8a',
  'submenu.activeIcon.color': '#e9e9e9',
  'menu.iconSize.width': '24px',
  'menu.iconSize.height': '24px',
  'submenu.iconSize.width': '32px',
  'submenu.iconSize.height': '32px',
  'submenu.backgroundColor': '#1e1e1e',
  'submenu.partition.color': '#3c3c3c',
  'submenu.normalLabel.color': '#8a8a8a',
  'submenu.normalLabel.fontWeight': 'lighter',
  'submenu.activeLabel.color': '#fff',
  'submenu.activeLabel.fontWeight': 'lighter',
  'checkbox.border': '1px solid #ccc',
  'checkbox.backgroundColor': '#fff',
  'range.pointer.color': '#fff',
  'range.bar.color': '#666',
  'range.subbar.color': '#d1d1d1',
  'range.value.color': '#fff',
  'range.value.fontWeight': 'lighter',
  'range.value.fontSize': '11px',
  'range.value.border': '1px solid #353535',
  'range.value.backgroundColor': '#151515',
  'range.title.color': '#fff',
  'range.title.fontWeight': 'lighter',
  'colorpicker.button.border': '1px solid #1e1e1e',
  'colorpicker.title.color': '#fff'
};

const ImageEditorModal = ({ isOpen, imageFile, onSave, onCancel }) => {
  const { t } = useTranslation();
  const editorRef = useRef();

  const TuiImageEditor = ImageEditor.default || ImageEditor;

  if (!isOpen) return null;

  const handleSave = () => {
    if (editorRef.current) {
      const editorInstance = editorRef.current.getInstance();
      const dataUrl = editorInstance.toDataURL();
      
      // تحويل dataUrl إلى ملف
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], imageFile.name, { type: 'image/jpeg' });
          onSave(file);
        });
    }
  };

  const handleAddImage = (e) => {
    const file = e.target.files[0];
    if (file && editorRef.current) {
      const editorInstance = editorRef.current.getInstance();
      const imageUrl = URL.createObjectURL(file);
      editorInstance.addImageObject(imageUrl);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: '#1a1a1a', backdropFilter: 'blur(8px)',
    }}>
      {/* شريط علوي مخصص لأننا سنخفي الأزرار الافتراضية للمكتبة عبر CSS لاحقاً إذا لزم الأمر، لكننا نعتمد على أزرارها حالياً، أو يمكننا إضافة أزرارنا */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 2rem', background: '#111', borderBottom: '1px solid #333'
      }}>
        <h3 style={{ margin: 0, color: '#fff' }}>{t('image_editor.title') || 'محرر الصور الاحترافي'}</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'transparent', color: '#fff', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer'
            }}
          >
            <X size={18} /> إلغاء
          </button>
          
          <input type="file" id="overlay-upload" accept="image/*" onChange={handleAddImage} style={{ display: 'none' }} />
          <button 
            onClick={() => document.getElementById('overlay-upload').click()}
            style={{
              padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            <ImagePlus size={18} /> إضافة صورة
          </button>

          <button 
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            <Check size={18} /> حفظ التعديلات
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <TuiImageEditor
          ref={editorRef}
          includeUI={{
            loadImage: {
              path: URL.createObjectURL(imageFile),
              name: imageFile.name
            },
            theme: myTheme,
            menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
            initMenu: 'filter',
            uiSize: {
              width: '100%',
              height: '100%'
            },
            menuBarPosition: 'right'
          }}
          cssMaxHeight={typeof window !== 'undefined' ? window.innerHeight - 150 : 800}
          cssMaxWidth={typeof window !== 'undefined' ? window.innerWidth - 350 : 1000}
          selectionStyle={{
            cornerSize: 20,
            rotatingPointOffset: 70
          }}
          usageStatistics={false}
        />
      </div>

      {/* إخفاء أزرار Load و Download الخاصة بالمكتبة لأننا أضفنا أزرارنا الخاصة بالأعلى */}
      <style>{`
        .tui-image-editor-header-buttons { display: none !important; }
        .tui-image-editor-header-logo { display: none !important; }
        .tui-image-editor-container { background-color: transparent !important; }
        .tui-image-editor-canvas-container { margin: 0 auto !important; }
      `}</style>
    </div>
  );
};

export default ImageEditorModal;
