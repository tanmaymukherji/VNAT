import React, { useEffect, useRef, useState } from 'react';
import { initPdfJs } from '../../pdf-utils';

export default function PdfPageCanvas({ file, pageNumber, rotation = 0, selectionMode = false, onZoneSelected, onRendered }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [layout, setLayout] = useState({ width: 1, height: 1, textItems: [] });
  const [selection, setSelection] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    let loadingTask = null;
    (async () => {
      const pdfjs = await initPdfJs();
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const document = await loadingTask.promise;
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1, rotation });
      const displayWidth = Math.max(320, containerRef.current?.clientWidth || base.width);
      const cssScale = Math.min(1.25, displayWidth / base.width);
      const renderScale = Math.max(2, cssScale * 2);
      const viewport = page.getViewport({ scale: renderScale, rotation });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const content = await page.getTextContent();
      const factor = cssScale / renderScale;
      const textItems = content.items.map((item, index) => {
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(transform[2], transform[3]);
        return {
          id: index,
          text: item.str,
          left: transform[4] * factor,
          top: (transform[5] - fontHeight) * factor,
          fontSize: fontHeight * factor,
        };
      });
      const width = viewport.width * factor;
      const height = viewport.height * factor;
      setLayout({ width, height, textItems });
      if (onRendered) onRendered(canvas.toDataURL('image/png'));
      page.cleanup();
    })().catch((error) => console.error('PDF page preview failed:', error));
    return () => {
      cancelled = true;
      if (loadingTask) loadingTask.destroy().catch(() => {});
    };
  }, [file, pageNumber, rotation, onRendered]);

  useEffect(() => {
    if (!selectionMode) setSelection(null);
  }, [selectionMode]);

  const point = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      sx: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      sy: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      x: Math.max(0, Math.min(canvasRef.current.width, (event.clientX - rect.left) * canvasRef.current.width / rect.width)),
      y: Math.max(0, Math.min(canvasRef.current.height, (event.clientY - rect.top) * canvasRef.current.height / rect.height)),
    };
  };

  const onPointerDown = (event) => {
    if (!selectionMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    dragRef.current = start;
    setSelection({ x0: start.sx, y0: start.sy, x1: start.sx, y1: start.sy });
  };
  const onPointerMove = (event) => {
    if (!selectionMode || !dragRef.current) return;
    const current = point(event);
    setSelection({ x0: dragRef.current.sx, y0: dragRef.current.sy, x1: current.sx, y1: current.sy });
  };
  const onPointerUp = (event) => {
    if (!selectionMode || !dragRef.current) return;
    const end = point(event);
    const start = dragRef.current;
    dragRef.current = null;
    const bbox = { x0: Math.min(start.x, end.x), y0: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), y1: Math.max(start.y, end.y) };
    if (bbox.x1 - bbox.x0 >= 8 && bbox.y1 - bbox.y0 >= 8 && onZoneSelected) {
      onZoneSelected({ bbox, imageData: canvasRef.current.toDataURL('image/png') });
    }
  };

  const box = selection ? {
    left: Math.min(selection.x0, selection.x1),
    top: Math.min(selection.y0, selection.y1),
    width: Math.abs(selection.x1 - selection.x0),
    height: Math.abs(selection.y1 - selection.y0),
  } : null;

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-gray-800 p-2">
      <div className="relative mx-auto bg-white shadow" style={{ width: layout.width, height: layout.height }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div className={`absolute inset-0 ${selectionMode ? 'pointer-events-none' : 'select-text'}`}>
          {layout.textItems.map((item) => (
            <span key={item.id} className="absolute whitespace-pre text-transparent" style={{ left: item.left, top: item.top, fontSize: item.fontSize, lineHeight: 1 }}>
              {item.text}
            </span>
          ))}
        </div>
        <div
          className={`absolute inset-0 ${selectionMode ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {box && <div className="absolute border-2 border-cyan-500 bg-cyan-300/20" style={box} />}
        </div>
      </div>
    </div>
  );
}
