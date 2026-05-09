import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { 
  X, Save, Type, Square, Circle as CircleIcon, 
  Pencil, MousePointer2, Trash2, RotateCcw, 
  Undo2, Redo2, Layers, ImagePlus as AddImageIcon,
  Pipette, RotateCw, Sun, Contrast, ZoomIn, ZoomOut
} from 'lucide-react';

const ImageEditorModal = ({ isOpen, imageFile, onSave, onCancel }) => {
  const canvasRef = useRef(null);
  const fabricCanvas = useRef(null);
  const containerRef = useRef(null);
  const [activeTool, setActiveTool] = useState('select');
  const [color, setColor] = useState('#ef4444'); // Default red
  const [isLoaded, setIsLoaded] = useState(false);
  const overlayInputRef = useRef(null);
  
  // Undo/Redo & State Management (Using Refs to avoid closure bugs)
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isInternalChange = useRef(false);
  
  // Filters State
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!isOpen || !imageFile) return;

    // Initialize Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#000',
    });
    fabricCanvas.current = canvas;

    // Load Image
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      fabric.FabricImage.fromURL(url).then((img) => {
        // Calculate scaling to fit the screen
        const maxWidth = Math.min(window.innerWidth * 0.8, 1000);
        const maxHeight = window.innerHeight * 0.7;
        
        let scale = 1;
        if (img.width > maxWidth || img.height > maxHeight) {
          scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        }

        const width = img.width * scale;
        const height = img.height * scale;

        canvas.setDimensions({ width, height });
        
        img.set({
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
        });

        canvas.add(img);
        canvas.centerObject(img);
        canvas.sendObjectToBack(img);
        canvas.renderAll();
        setIsLoaded(true);
        
        // Initial history state
        const initialState = JSON.stringify(canvas.toJSON());
        historyRef.current = [initialState];
        historyIndexRef.current = 0;
        updateUndoRedoStatus();
      });
    };
    reader.readAsDataURL(imageFile);

    // Event Listeners for History
    const handleObjectsChange = () => {
      if (isInternalChange.current) return;
      const json = JSON.stringify(canvas.toJSON());
      
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current = [...newHistory, json];
      historyIndexRef.current = historyIndexRef.current + 1;
      updateUndoRedoStatus();
    };

    const updateUndoRedoStatus = () => {
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    };

    canvas.on('object:added', handleObjectsChange);
    canvas.on('object:modified', handleObjectsChange);
    canvas.on('object:removed', handleObjectsChange);
    canvas.on('path:created', handleObjectsChange);

    // Zoom Logic
    canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.01) zoom = 0.01;
      canvas.setZoom(zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Default Brush Settings
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.width = 4;
    canvas.freeDrawingBrush.color = color;

    // Cleanup
    return () => {
      canvas.dispose();
      fabricCanvas.current = null;
      setIsLoaded(false);
    };
  }, [isOpen, imageFile]); // eslint-disable-line

  // Handle Tool Changes
  useEffect(() => {
    if (!fabricCanvas.current) return;
    const canvas = fabricCanvas.current;

    canvas.isDrawingMode = activeTool === 'pencil';
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
    }

    // Cursor changes
    if (activeTool === 'select') {
      canvas.defaultCursor = 'default';
    } else {
      canvas.defaultCursor = 'crosshair';
    }
  }, [activeTool, color]);

  const addRect = () => {
    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      fill: 'transparent',
      stroke: color,
      strokeWidth: 4,
      width: 100,
      height: 100,
    });
    fabricCanvas.current.add(rect);
    fabricCanvas.current.setActiveObject(rect);
    setActiveTool('select');
  };

  const addCircle = () => {
    const circle = new fabric.Circle({
      left: 150,
      top: 150,
      fill: 'transparent',
      stroke: color,
      strokeWidth: 4,
      radius: 50,
    });
    fabricCanvas.current.add(circle);
    fabricCanvas.current.setActiveObject(circle);
    setActiveTool('select');
  };

  const addText = () => {
    const text = new fabric.IText('اكتب هنا...', {
      left: 200,
      top: 200,
      fontFamily: 'Tajawal',
      fontSize: 24,
      fill: color,
    });
    fabricCanvas.current.add(text);
    fabricCanvas.current.setActiveObject(text);
    setActiveTool('select');
  };

  const handleOverlayUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      fabric.FabricImage.fromURL(event.target.result).then((img) => {
        // Scale down overlay if too large
        const canvas = fabricCanvas.current;
        const maxOverlayDim = Math.min(canvas.width, canvas.height) * 0.5;
        
        let scale = 1;
        if (img.width > maxOverlayDim || img.height > maxOverlayDim) {
          scale = maxOverlayDim / Math.max(img.width, img.height);
        }

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: 50,
          top: 50,
          cornerColor: 'var(--accent-color)',
          cornerSize: 10,
          transparentCorners: false
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        setActiveTool('select');
      });
    };
    reader.readAsDataURL(file);
    if (overlayInputRef.current) overlayInputRef.current.value = '';
  };

  const deleteSelected = () => {
    const canvas = fabricCanvas.current;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
      canvas.remove(...activeObjects);
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  };

  const clearAll = () => {
    if (window.confirm('هل أنت متأكد من مسح جميع الإضافات والتعديلات؟')) {
      const canvas = fabricCanvas.current;
      const objects = canvas.getObjects();
      // Remove all objects EXCEPT the base image (which has selectable: false)
      const toRemove = objects.filter(obj => obj.selectable !== false);
      canvas.remove(...toRemove);
      canvas.renderAll();
    }
  };

  const handleSave = () => {
    const dataUrl = fabricCanvas.current.toDataURL({
      format: 'jpeg',
      quality: 0.9,
    });
    
    // Convert Data URL to Blob
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], imageFile.name, { type: 'image/jpeg' });
        onSave(file);
      });
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    
    const newIndex = historyIndexRef.current - 1;
    const state = historyRef.current[newIndex];
    
    isInternalChange.current = true;
    fabricCanvas.current.loadFromJSON(JSON.parse(state)).then(() => {
      fabricCanvas.current.renderAll();
      historyIndexRef.current = newIndex;
      setCanUndo(newIndex > 0);
      setCanRedo(true);
      isInternalChange.current = false;
    });
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    
    const newIndex = historyIndexRef.current + 1;
    const state = historyRef.current[newIndex];
    
    isInternalChange.current = true;
    fabricCanvas.current.loadFromJSON(JSON.parse(state)).then(() => {
      fabricCanvas.current.renderAll();
      historyIndexRef.current = newIndex;
      setCanUndo(true);
      setCanRedo(newIndex < historyRef.current.length - 1);
      isInternalChange.current = false;
    });
  };

  const rotateImage = () => {
    const canvas = fabricCanvas.current;
    const objects = canvas.getObjects();
    const bgImg = objects.find(obj => obj instanceof fabric.FabricImage && !obj.selectable);
    
    if (bgImg) {
      bgImg.angle = (bgImg.angle + 90) % 360;
      // Swap dimensions for rotation
      const oldW = canvas.width;
      const oldH = canvas.height;
      canvas.setDimensions({ width: oldH, height: oldW });
      canvas.centerObject(bgImg);
      canvas.renderAll();
      // Save state
      const json = JSON.stringify(canvas.toJSON());
      historyRef.current = [...historyRef.current.slice(0, historyIndexRef.current + 1), json];
      historyIndexRef.current++;
      setCanUndo(true);
    }
  };

  const applyFilters = (type, value) => {
    const canvas = fabricCanvas.current;
    const objects = canvas.getObjects();
    const bgImg = objects.find(obj => obj instanceof fabric.FabricImage && !obj.selectable);
    
    if (bgImg) {
      if (type === 'brightness') {
        setBrightness(value);
        bgImg.filters = bgImg.filters.filter(f => !(f instanceof fabric.filters.Brightness));
        if (value !== 0) bgImg.filters.push(new fabric.filters.Brightness({ brightness: value / 100 }));
      } else {
        setContrast(value);
        bgImg.filters = bgImg.filters.filter(f => !(f instanceof fabric.filters.Contrast));
        if (value !== 0) bgImg.filters.push(new fabric.filters.Contrast({ contrast: value / 100 }));
      }
      bgImg.applyFilters();
      canvas.renderAll();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '1200px', height: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--accent-color)', boxShadow: '0 0 40px rgba(212, 175, 55, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: '1px solid var(--border-color)',
          background: 'rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Layers size={20} className="text-gradient" />
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>محرر الصور</h3>
          </div>
          <button onClick={onCancel} className="btn-outline" style={{ padding: '0.5rem', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
          justifyContent: 'center', borderBottom: '1px solid var(--border-color)',
          background: 'var(--surface-highlight)'
        }}>
          <ToolBtn active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 size={18} />} label="تحديد" />
          <ToolBtn active={activeTool === 'pencil'} onClick={() => setActiveTool('pencil')} icon={<Pencil size={18} />} label="قلم" />
          <ToolBtn onClick={addRect} icon={<Square size={18} />} label="مربع" />
          <ToolBtn onClick={addCircle} icon={<CircleIcon size={18} />} label="دائرة" />
          <ToolBtn onClick={addText} icon={<Type size={18} />} label="نص" />
          <ToolBtn onClick={() => overlayInputRef.current?.click()} icon={<AddImageIcon size={18} />} label="إضافة صورة" />
          <ToolBtn onClick={rotateImage} icon={<RotateCw size={18} />} label="تدوير" />
          <ToolBtn active={showFilters} onClick={() => setShowFilters(!showFilters)} icon={<Sun size={18} />} label="الفلاتر" />
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem', alignSelf: 'center' }} />
          
          <ToolBtn onClick={undo} icon={<Undo2 size={18} />} label="تراجع" disabled={!canUndo} />
          <ToolBtn onClick={redo} icon={<Redo2 size={18} />} label="إعادة" disabled={!canRedo} />
          <input 
            type="file" 
            ref={overlayInputRef} 
            style={{ display: 'none' }} 
            accept="image/*" 
            onChange={handleOverlayUpload} 
          />
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem', alignSelf: 'center' }} />
          
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', padding: '0 0.5rem' }}>
            {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#ffffff', '#000000'].map(c => (
              <button 
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: c, border: color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer', transition: 'transform 0.2s'
                }}
                className={color === c ? 'scale-110' : ''}
              />
            ))}
            
            {/* Custom Color Picker */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>
              <input 
                type="color" 
                value={color} 
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: '32px', height: '32px', padding: 0, border: 'none',
                  borderRadius: '50%', cursor: 'pointer', overflow: 'hidden',
                  background: 'linear-gradient(45deg, red, yellow, green, cyan, blue, magenta, red)',
                  border: '2px solid rgba(255,255,255,0.3)'
                }}
                title="لون مخصص"
              />
              <Pipette size={14} style={{ position: 'absolute', pointerEvents: 'none', right: '9px', color: '#000', filter: 'drop-shadow(0 0 2px #fff)' }} />
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem', alignSelf: 'center' }} />
          
          <ToolBtn onClick={deleteSelected} icon={<Trash2 size={18} />} label="مسح العنصر" variant="danger" />
          <ToolBtn onClick={clearAll} icon={<RotateCcw size={18} />} label="مسح الكل" variant="danger" />
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div style={{
            padding: '1rem', background: 'var(--surface-color)', borderBottom: '1px solid var(--border-color)',
            display: 'flex', gap: '2rem', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Sun size={18} className="text-muted" />
              <span style={{ fontSize: '0.85rem' }}>السطوع:</span>
              <input type="range" min="-100" max="100" value={brightness} onChange={(e) => applyFilters('brightness', parseInt(e.target.value))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Contrast size={18} className="text-muted" />
              <span style={{ fontSize: '0.85rem' }}>التباين:</span>
              <input type="range" min="-100" max="100" value={contrast} onChange={(e) => applyFilters('contrast', parseInt(e.target.value))} />
            </div>
          </div>
        )}

        {/* Canvas Area */}
        <div ref={containerRef} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a', position: 'relative', overflow: 'auto'
        }}>
          {!isLoaded && <div className="text-muted">جاري تحميل المحرر...</div>}
          <canvas ref={canvasRef} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end',
          gap: '1rem', borderTop: '1px solid var(--border-color)',
          background: 'rgba(255, 255, 255, 0.05)'
        }}>
          <button onClick={onCancel} className="btn-outline" style={{ minWidth: '100px' }}>إلغاء</button>
          <button onClick={handleSave} className="btn-accent" style={{ minWidth: '140px', gap: '0.5rem' }}>
            <Save size={18} />
            حفظ التعديلات
          </button>
        </div>
      </div>
    </div>
  );
};

const ToolBtn = ({ active, onClick, icon, label, variant = 'normal', disabled }) => {
  const getStyle = () => {
    if (disabled) return { opacity: 0.3, cursor: 'not-allowed' };
    if (active) return { background: 'var(--accent-color)', color: '#fff', borderColor: 'var(--accent-color)' };
    if (variant === 'danger') return { color: '#f87171' };
    return { color: 'var(--text-main)' };
  };

  return (
    <button 
      onClick={onClick}
      title={label}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)',
        background: 'transparent', cursor: 'pointer', transition: 'all 0.2s',
        fontSize: '0.85rem', fontWeight: 500,
        ...getStyle()
      }}
      className={!disabled ? "hover:bg-white/5" : ""}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export default ImageEditorModal;
