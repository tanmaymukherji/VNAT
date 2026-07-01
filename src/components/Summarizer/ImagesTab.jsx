import React from 'react';

export default function ImagesTab({ images, currentLang }) {
  const t = (key) => {
    const LABELS = {
      en: { Images: 'Images', No_images_found: 'No images found' },
      hi: { Images: 'चित्र', No_images_found: 'कोई चित्र नहीं मिला' },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  if (!images || images.length === 0) {
    return <div className="text-center py-12 text-slate-400">{t('No_images_found')}</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {images.map((img, i) => (
        <div key={i} className="border rounded-lg overflow-hidden bg-slate-50">
          <img
            src={img.dataUrl}
            alt={img.name}
            loading="lazy"
            className="w-full h-32 object-cover"
          />
          <div className="px-2 py-1 text-[10px] text-slate-500 text-center break-words">{img.name}</div>
        </div>
      ))}
    </div>
  );
}