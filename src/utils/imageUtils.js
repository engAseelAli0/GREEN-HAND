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
  // Provide a fallback property if preview or url are missing
  const url = typeof img === 'string' ? img : (img.preview || img.url || img.name);
  if (!url) return '';
  
  // If the string already looks like a valid absolute URL or data URI, return it
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  
  // Construct the correct Supabase public URL
  // Defaulting to "product-images/" folder inside the "product_images" bucket as used in uploads
  const path = img.path || `product-images/${url}`;
  return supabase.storage.from('product_images').getPublicUrl(path).data.publicUrl;
};
