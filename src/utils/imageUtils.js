import { supabase } from '../supabaseClient';

export const compressImage = (file, maxWidth = 1000, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    // Don't compress non-images or SVGs
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas is empty'));
              return;
            }
            const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], newName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = (error) => reject(error);
    };
    
    reader.onerror = (error) => reject(error);
  });
};

export const normalizeImageUrl = (img) => {
  if (!img) return '';

  let rawUrl = '';
  let imgPath = '';

  if (typeof img === 'string') {
    rawUrl = img.trim();
  } else if (typeof img === 'object' && img !== null) {
    imgPath = (img.path || '').trim();
    rawUrl = (img.preview || img.url || img.name || '').trim();
  }

  if (!rawUrl && !imgPath) return '';

  // If it's a blob: or data: URL, return directly
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }

  // If it's an absolute HTTP/HTTPS URL
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    // Fix unencoded hash characters '#' in Supabase URL paths before query params
    // e.g. /product-images/24366A#1.jpg -> /product-images/24366A%231.jpg
    const [baseAndPath, queryStr] = rawUrl.split('?');
    const fixedPath = baseAndPath.replace(/#/g, '%23');
    return queryStr ? `${fixedPath}?${queryStr}` : fixedPath;
  }

  // Determine path from imgPath or rawUrl
  let path = imgPath || rawUrl;

  // Clean leading slashes
  if (path.startsWith('/')) path = path.slice(1);

  // If path doesn't start with product-images/ or trademarks/, prepend product-images/
  if (!path.startsWith('product-images/') && !path.startsWith('trademarks/')) {
    path = `product-images/${path}`;
  }

  // Encode hash characters in path for getPublicUrl
  const safePath = path.replace(/#/g, '%23');

  const publicUrl = supabase.storage.from('product_images').getPublicUrl(safePath).data.publicUrl;
  return publicUrl;
};
