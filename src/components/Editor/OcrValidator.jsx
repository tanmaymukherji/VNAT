import React, { useState, useRef, useCallback, useEffect } from 'react';
import SmartTextarea from './SmartTextarea';
import SuggestionButton, { ReScanButton, TableRescanButton } from './SuggestionButton';
import { readImage, readSourceDocument } from '../../storage';
import { reOcrRegionDetailed } from '../../spellcheck';
import PdfPageCanvas from './PdfPageCanvas';

function ZoomableImage({ src, alt, focusBox, selectionMode = false, onZoneSelected }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [dims, setDims] = useState({ cw: 1, ch: 1, iw: 1, ih: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPanStart, setDragPanStart] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState(null);
  const selectionStartRef = useRef(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth) {
      setDims((prev) => ({ ...prev, iw: img.naturalWidth, ih: img.naturalHeight }));
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const sz = entry.contentBoxSize?.[0] || {};
        const cw = sz.inlineSize || entry.contentRect.width;
        const ch = sz.blockSize || entry.contentRect.height;
        if (cw && ch) {
          setDims((prev) => ({ ...prev, cw, ch }));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.naturalWidth && img.naturalHeight) {
      setDims((prev) => ({ ...prev, iw: img.naturalWidth, ih: img.naturalHeight }));
      setLoaded(true);
    }
  }, []);

  const fitZoom = dims.cw > 0 && dims.iw > 0
    ? Math.min(dims.cw / dims.iw, dims.ch / dims.ih, 1)
    : 1;

  const clampPan = useCallback((x, y, z) => {
    const zf = z || zoom;
    const effectiveW = dims.iw * zf;
    const effectiveH = dims.ih * zf;
    const maxX = Math.max(0, (effectiveW - dims.cw) / 2);
    const maxY = Math.max(0, (effectiveH - dims.ch) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [dims, zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left - dims.cw / 2;
      const my = e.clientY - rect.top - dims.ch / 2;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const newZoom = Math.max(fitZoom * 0.5, Math.min(5, zoom * factor));
      const scale = newZoom / zoom;
      const newPan = clampPan(
        pan.x * scale + mx * (1 - scale),
        pan.y * scale + my * (1 - scale),
        newZoom
      );
      setZoom(newZoom);
      setPan(newPan);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, pan, dims, fitZoom, clampPan]);

  useEffect(() => {
    if (loaded) {
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [loaded, dims.cw, dims.ch, dims.iw, dims.ih]);

  useEffect(() => {
    if (!loaded || !focusBox || dims.cw <= 0 || dims.iw <= 0) return;

    const bx = (focusBox.x0 + focusBox.x1) / 2;
    const by = (focusBox.y0 + focusBox.y1) / 2;
    const bw = focusBox.x1 - focusBox.x0;
    const bh = focusBox.y1 - focusBox.y0;

    const zoomForW = (dims.cw * 0.6) / bw;
    const zoomForH = (dims.ch * 0.6) / bh;
    const newZoom = Math.max(fitZoom * 0.5, Math.min(5, Math.min(zoomForW, zoomForH)));

    const newPanX = -(bx - dims.iw / 2) * newZoom;
    const newPanY = -(by - dims.ih / 2) * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [focusBox, loaded, dims, fitZoom]);

  const handleMouseDown = useCallback((e) => {
    if (selectionMode) {
      const rect = containerRef.current.getBoundingClientRect();
      const imageLeft = dims.cw / 2 + pan.x - dims.iw * zoom / 2;
      const imageTop = dims.ch / 2 + pan.y - dims.ih * zoom / 2;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const x = Math.max(0, Math.min(dims.iw, (sx - imageLeft) / zoom));
      const y = Math.max(0, Math.min(dims.ih, (sy - imageTop) / zoom));
      selectionStartRef.current = { x, y, sx, sy };
      setSelection({ x0: sx, y0: sy, x1: sx, y1: sy });
      return;
    }
    if (zoom > fitZoom * 1.05) {
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragPanStart({ x: pan.x, y: pan.y });
    }
  }, [selectionMode, dims, pan, zoom, fitZoom]);

  const handleMouseMove = useCallback((e) => {
    if (selectionMode && selectionStartRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setSelection((previous) => ({ ...previous, x1: e.clientX - rect.left, y1: e.clientY - rect.top }));
      return;
    }
    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan(clampPan(dragPanStart.x + dx, dragPanStart.y + dy, zoom));
    }
  }, [selectionMode, dragging, dragStart, dragPanStart, zoom, clampPan]);

  const handleMouseUp = useCallback((e) => {
    setDragging(false);
    if (!selectionMode || !selectionStartRef.current) return;
    const start = selectionStartRef.current;
    selectionStartRef.current = null;
    const rect = containerRef.current.getBoundingClientRect();
    const imageLeft = dims.cw / 2 + pan.x - dims.iw * zoom / 2;
    const imageTop = dims.ch / 2 + pan.y - dims.ih * zoom / 2;
    const end = {
      x: Math.max(0, Math.min(dims.iw, (e.clientX - rect.left - imageLeft) / zoom)),
      y: Math.max(0, Math.min(dims.ih, (e.clientY - rect.top - imageTop) / zoom)),
    };
    const bbox = { x0: Math.min(start.x, end.x), y0: Math.min(start.y, end.y), x1: Math.max(start.x, end.x), y1: Math.max(start.y, end.y) };
    if (bbox.x1 - bbox.x0 >= 8 && bbox.y1 - bbox.y0 >= 8 && onZoneSelected) onZoneSelected({ bbox, imageData: src });
  }, [selectionMode, dims, pan, zoom, onZoneSelected, src]);

  const zoomIn = useCallback(() => {
    const z = Math.min(5, zoom * 1.25);
    setZoom(z);
    setPan(clampPan(pan.x, pan.y, z));
  }, [zoom, pan, clampPan]);

  const zoomOut = useCallback(() => {
    const z = Math.max(fitZoom * 0.5, zoom / 1.25);
    setZoom(z);
    setPan(clampPan(pan.x, pan.y, z));
  }, [zoom, pan, fitZoom, clampPan]);

  const resetView = useCallback(() => {
    setZoom(fitZoom);
    setPan({ x: 0, y: 0 });
  }, [fitZoom]);

  const isZoomed = zoom > fitZoom * 1.05;

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-gray-900 flex items-center justify-center relative select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: selectionMode ? 'crosshair' : isZoomed ? (dragging ? 'grabbing' : 'grab') : 'default' }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={onImgLoad}
        className="max-w-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      draggable={false}
      />
      {selection && selectionMode && (
        <div className="absolute border-2 border-cyan-400 bg-cyan-300/20 pointer-events-none" style={{
          left: Math.min(selection.x0, selection.x1),
          top: Math.min(selection.y0, selection.y1),
          width: Math.abs(selection.x1 - selection.x0),
          height: Math.abs(selection.y1 - selection.y0),
        }} />
      )}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-lg px-2 py-1">
        <button
          onClick={zoomOut}
          className="text-white hover:text-gray-300 px-2 py-0.5 text-sm font-bold leading-none"
          title="Zoom out"
        >−</button>
        <span className="text-white text-xs font-mono min-w-[4ch] text-center">
          {Math.round(zoom / fitZoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="text-white hover:text-gray-300 px-2 py-0.5 text-sm font-bold leading-none"
          title="Zoom in"
        >+</button>
        <span className="text-gray-500 mx-1">|</span>
        <button
          onClick={resetView}
          className="text-white hover:text-gray-300 px-2 py-0.5 text-xs"
          title="Fit to screen"
        >⟲ Fit</button>
      </div>
    </div>
  );
}

export default function OcrValidator({ projectId, images, sources = [], paragraphs, onSaveParagraphs }) {
  console.log('[OcrValidator] RENDER', {
    projectId,
    paragraphsCount: paragraphs?.length,
    paragraphsSample: paragraphs?.slice(0, 2).map(p => ({ i: p.index, t: p.text?.substring(0, 30) })),
  });
  const pages = [...new Set(paragraphs.map((p) => p.page))].sort((a, b) => a - b);

  const [currentPage, setCurrentPage] = useState(pages.length > 0 ? pages[0] : 1);
  const [edited, setEdited] = useState({});
  const [paragraphOverrides, setParagraphOverrides] = useState({});
  const [focusBbox, setFocusBbox] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [displayImageUrl, setDisplayImageUrl] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pageRotation, setPageRotation] = useState(0);
  const [zoneTarget, setZoneTarget] = useState(null);
  const [zoneMode, setZoneMode] = useState('text');
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneResult, setZoneResult] = useState(null);
  const [zoneError, setZoneError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const textareaRefs = useRef({});
  const imageUrlRef = useRef(null);
  const rotatedImageUrlRef = useRef(null);
  const pdfUrlRef = useRef(null);

  const pageParagraphs = paragraphs.filter((p) => p.page === currentPage);
  const sourceParagraph = pageParagraphs.find(p => p.sourceId) || null;
  const pdfSource = sourceParagraph
    ? sources.find(source => source.id === sourceParagraph.sourceId && source.type === 'pdf')
    : null;
  const showSelectablePdf = !!pdfSource && sourceParagraph?.source === 'pdf_text';
  const sourcePage = sourceParagraph?.sourcePage || currentPage;

  // Load image when page changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Revoke previous URL
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
      setImageUrl(null);

      if (!projectId || !currentPage || showSelectablePdf) return;
      setPreviewLoading(true);
      const file = await readImage(projectId, currentPage);
      if (cancelled) return;
      if (file) {
        const url = URL.createObjectURL(file);
        imageUrlRef.current = url;
        setImageUrl(url);
      }
      setPreviewLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, currentPage, showSelectablePdf]);

  useEffect(() => {
    let cancelled = false;
    if (rotatedImageUrlRef.current) {
      URL.revokeObjectURL(rotatedImageUrlRef.current);
      rotatedImageUrlRef.current = null;
    }
    if (!imageUrl || pageRotation === 0) {
      setDisplayImageUrl(imageUrl);
      return undefined;
    }
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const swap = pageRotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? image.naturalHeight : image.naturalWidth;
      canvas.height = swap ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext('2d');
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(pageRotation * Math.PI / 180);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        rotatedImageUrlRef.current = url;
        setDisplayImageUrl(url);
      }, 'image/png');
    };
    image.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl, pageRotation]);

  // Native PDF preview keeps text selectable and avoids raster snapshots.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      setPdfUrl(null);
      setPdfFile(null);

      if (!projectId || !showSelectablePdf || !pdfSource) return;
      setPreviewLoading(true);
      const file = await readSourceDocument(projectId, pdfSource.storageName || pdfSource.id);
      if (cancelled) return;
      if (file) {
        const url = URL.createObjectURL(file);
        pdfUrlRef.current = url;
        setPdfUrl(url);
        setPdfFile(file);
      }
      setPreviewLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, showSelectablePdf, pdfSource?.id, pdfSource?.storageName]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      if (rotatedImageUrlRef.current) {
        URL.revokeObjectURL(rotatedImageUrlRef.current);
        rotatedImageUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPageRotation(0);
    setZoneTarget(null);
    setZoneResult(null);
    setZoneError('');
  }, [currentPage]);

  // Reset to first page if pages change
  useEffect(() => {
    if (pages.length > 0 && !pages.includes(currentPage)) {
      setCurrentPage(pages[0]);
    }
  }, [pages]);

  const updateText = (index, newText) => {
    setEdited((prev) => ({ ...prev, [index]: newText }));
  };

  const updateTableCell = (para, ri, ci, val) => {
    const raw = edited[para.index] !== undefined
      ? edited[para.index]
      : (paragraphOverrides[para.index]?.text || para.text || '');
    const rows = raw ? raw.split('\n').map(l => l.split('\t')) : [];
    if (rows[ri]) rows[ri][ci] = val;
    const joined = rows.map(r => r.join('\t')).join('\n');
    setEdited((prev) => ({ ...prev, [para.index]: joined }));
  };

  const getTableRows = (para) => {
    const raw = edited[para.index] !== undefined
      ? edited[para.index]
      : (paragraphOverrides[para.index]?.text || para.text || '');
    return raw.split('\n').map(l => l.split('\t'));
  };

  const applyTableRescan = (para, table) => {
    setParagraphOverrides((prev) => ({ ...prev, [para.index]: { ...para, ...table } }));
    setEdited((prev) => ({ ...prev, [para.index]: table.text }));
  };

  const getText = (para) => edited[para.index] !== undefined
    ? edited[para.index]
    : (paragraphOverrides[para.index]?.text ?? para.text);

  const startZoneRescan = (para, mode) => {
    setZoneTarget(para.index);
    setZoneMode(mode || (para.type === 'table' ? 'table' : 'text'));
    setZoneResult(null);
    setZoneError('');
  };

  const handleZoneSelected = useCallback(async ({ bbox, imageData }) => {
    if (zoneTarget == null || !imageData) return;
    setZoneLoading(true);
    setZoneError('');
    setZoneResult(null);
    try {
      const result = await reOcrRegionDetailed(imageData, bbox, { tableMode: zoneMode, padding: 0 });
      setZoneResult({ ...result, bbox });
    } catch (error) {
      setZoneError(error?.message || 'Zone re-scan failed.');
    } finally {
      setZoneLoading(false);
    }
  }, [zoneTarget, zoneMode]);

  const applyZoneResult = () => {
    if (zoneTarget == null || !zoneResult) return;
    const para = paragraphs.find((entry) => entry.index === zoneTarget);
    if (!para) return;
    if (zoneMode === 'table') {
      const fallbackRows = zoneResult.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const cells = line.split(/\t|\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
        return cells.length ? cells : [''];
      });
      const rows = zoneResult.table?.rows || fallbackRows;
      const colCount = Math.max(1, ...rows.map((row) => row.length));
      const normalized = rows.map((row) => Array.from({ length: colCount }, (_, index) => row[index] || ''));
      applyTableRescan(para, {
        ...zoneResult.table,
        type: 'table',
        rows: normalized,
        colCount,
        text: normalized.map((row) => row.join('\t')).join('\n'),
        bbox: zoneResult.bbox,
      });
    } else {
      setParagraphOverrides((previous) => ({
        ...previous,
        [para.index]: { ...para, type: undefined, rows: undefined, colCount: undefined, cells: undefined, text: zoneResult.text, bbox: zoneResult.bbox },
      }));
      setEdited((previous) => ({ ...previous, [para.index]: zoneResult.text }));
    }
    setZoneTarget(null);
    setZoneResult(null);
  };

  const handleSave = async () => {
    console.log('[OcrValidator] handleSave START', {
      paragraphsCount: paragraphs.length,
      paragraphsSample: paragraphs.slice(0, 2).map(p => ({ i: p.index, t: p.text })),
      editedKeys: Object.keys(edited),
      editedSample: Object.entries(edited).slice(0, 2),
    });
    const updated = paragraphs.map((p) => {
      const override = paragraphOverrides[p.index];
      const entry = { ...p, ...(override || {}), text: edited[p.index] !== undefined ? edited[p.index] : (override?.text || p.text) };
      if (entry.type === 'table' && (edited[p.index] !== undefined || override)) {
        const rows = entry.text.split('\n').map(l => l.split('\t'));
        entry.rows = rows;
        entry.colCount = Math.max(0, ...rows.map((row) => row.length));
      }
      return entry;
    });
    console.log('[OcrValidator] handleSave UPDATED', {
      count: updated.length,
      sample: updated.slice(0, 2).map(p => ({ i: p.index, t: p.text })),
    });
    const success = await onSaveParagraphs(updated);
    if (success) {
      setEdited({});
      setParagraphOverrides({});
    }
  };

  const hasEdits = Object.keys(edited).length > 0 || Object.keys(paragraphOverrides).length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Page selector */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Page:</span>
        {pages.map((pg) => (
          <button
            key={pg}
            onClick={() => setCurrentPage(pg)}
            className={`px-3 py-1 rounded text-xs font-medium ${
              currentPage === pg
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-200 border border-gray-300'
            }`}
          >
            {pg}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setPageRotation((value) => (value + 270) % 360)} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-200" title="Rotate page left">↶</button>
            <button onClick={() => setPageRotation((value) => (value + 90) % 360)} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-200" title="Rotate page right">↷</button>
            {pageRotation !== 0 && <span className="text-[10px] text-cyan-700">{pageRotation}°</span>}
          </div>
          <span className="text-xs text-gray-500">
            {pageParagraphs.length} paragraph{pageParagraphs.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSave}
            disabled={!hasEdits}
            className={`text-xs px-3 py-1 rounded ${
              hasEdits
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Save OCR Corrections
          </button>
        </div>
      </div>

      {zoneTarget != null && (
        <div className="bg-cyan-50 border-b border-cyan-200 px-4 py-2 flex items-center gap-3 text-xs text-cyan-900">
          <span className="font-medium">Draw a rectangle on the left for ¶{zoneTarget + 1}</span>
          <button onClick={() => setZoneMode('text')} className={`px-2 py-1 rounded ${zoneMode === 'text' ? 'bg-cyan-700 text-white' : 'bg-white border border-cyan-300'}`}>Text / handwriting</button>
          <button onClick={() => setZoneMode('table')} className={`px-2 py-1 rounded ${zoneMode === 'table' ? 'bg-cyan-700 text-white' : 'bg-white border border-cyan-300'}`}>Table</button>
          {zoneLoading && <span className="animate-pulse">Scanning selected zone…</span>}
          {zoneError && <span className="text-red-700">{zoneError}</span>}
          <button onClick={() => { setZoneTarget(null); setZoneResult(null); setZoneError(''); }} className="ml-auto text-gray-600 hover:text-gray-900">Cancel</button>
        </div>
      )}

      {/* Split panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: selectable PDF for native text, image for OCR sources */}
        <div className="w-1/2 border-r border-gray-300">
          {showSelectablePdf && pdfUrl && pdfFile ? (
            <div className="h-full flex flex-col bg-gray-800">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 text-xs text-gray-300">
                <span className="truncate" title={pdfSource.filename}>{pdfSource.filename} · page {sourcePage}</span>
                <a
                  href={`${pdfUrl}#page=${sourcePage}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 hover:text-indigo-200 ml-3 whitespace-nowrap"
                >
                  Open PDF
                </a>
              </div>
              <div className="flex-1 min-h-0">
                <PdfPageCanvas
                  key={`${pdfSource.id}-${sourcePage}`}
                  file={pdfFile}
                  pageNumber={sourcePage}
                  rotation={pageRotation}
                  selectionMode={zoneTarget != null}
                  onZoneSelected={handleZoneSelected}
                />
              </div>
            </div>
          ) : displayImageUrl ? (
            <ZoomableImage
              src={displayImageUrl}
              alt={`Page ${currentPage}`}
              focusBox={focusBbox}
              selectionMode={zoneTarget != null}
              onZoneSelected={handleZoneSelected}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm bg-gray-800">
              {previewLoading
                ? 'Loading source...'
                : showSelectablePdf
                  ? 'Original PDF is unavailable for this project.'
                  : projectId ? 'No image available' : 'No source available'}
            </div>
          )}
        </div>

        {/* Right: OCR text */}
        <div className="w-1/2 overflow-y-auto p-4 bg-gray-50">
          {pageParagraphs.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg">No paragraphs on this page</p>
            </div>
          ) : (
            pageParagraphs.map((p, idx) => {
              const text = getText(p);
              const rows = Math.max(2, text.split('\n').length, Math.ceil(text.length / 60));
              const isEdited = edited[p.index] !== undefined && edited[p.index] !== p.text;
              if (!textareaRefs.current[p.index]) textareaRefs.current[p.index] = React.createRef();
              const effectiveParagraph = paragraphOverrides[p.index] || p;
              const effectiveTable = effectiveParagraph.type === 'table' ? effectiveParagraph : null;
              const isTable = !!effectiveTable;
              return (
                <div key={p.index} className="mb-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    {!isTable && <SuggestionButton textareaRef={textareaRefs.current[p.index]} />}
                    {!isTable && pageRotation === 0 && <ReScanButton
                      textareaRef={textareaRefs.current[p.index]}
                      imageData={displayImageUrl}
                      lines={p.lines}
                      onFocusImage={setFocusBbox}
                      paraIndex={idx}
                      totalParas={pageParagraphs.length}
                      disabled={p.source === 'pdf_text'}
                    />}
                    {isTable && p.source !== 'pdf_text' && pageRotation === 0 && <TableRescanButton
                      imageData={displayImageUrl}
                      bbox={effectiveTable.bbox || p.bbox}
                      disabled={p.source === 'pdf_text'}
                      onFocusImage={setFocusBbox}
                      onApply={(table) => applyTableRescan(p, table)}
                    />}
                    <button
                      type="button"
                      onClick={() => startZoneRescan(effectiveParagraph, isTable ? 'table' : 'text')}
                      className="text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 hover:bg-cyan-200"
                      title="Draw the exact source area to re-scan into this paragraph"
                    >
                      Select zone
                    </button>
                    <span className="text-[11px] text-gray-400 font-mono">{isTable ? '⊞' : '¶'}{p.index + 1}</span>
                    {isTable && <span className="text-[10px] text-indigo-500 font-medium">Table</span>}
                    {isEdited && <span className="text-[11px] text-amber-600 font-medium">edited</span>}
                  </div>
                  {isTable ? (
                    <div className="overflow-x-auto bg-white border border-gray-300 rounded">
                      <table className="w-full border-collapse border border-gray-400 text-sm">
                        <tbody>
                          {getTableRows(p).map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci} className="border border-gray-400 p-1 min-w-[60px] align-top">
                                  <textarea
                                    value={cell}
                                    onChange={(e) => updateTableCell(p, ri, ci, e.target.value)}
                                    className="w-full bg-transparent resize-none outline-none border-none p-0 m-0 text-sm font-sans leading-snug"
                                    rows={Math.max(1, (cell || '').split('\n').length)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <SmartTextarea
                      ref={textareaRefs.current[p.index]}
                      value={text}
                      onChange={(newText) => updateText(p.index, newText)}
                      className={`w-full p-3 rounded border text-sm resize-y min-h-[3.5rem] font-sans leading-relaxed whitespace-pre-wrap focus:outline-none ${
                        isEdited
                          ? 'bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                          : 'bg-white border-gray-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400'
                      }`}
                      rows={rows}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {zoneResult && (
        <div className="fixed inset-0 z-[9999] bg-black/45 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <span className="font-medium text-gray-800">Zone re-scan preview</span>
              <span className="text-xs text-gray-500">{zoneMode === 'table' ? 'Table mode' : 'Text / handwriting mode'}</span>
              {zoneResult.orientation ? <span className="text-xs text-cyan-700">orientation corrected {zoneResult.orientation}°</span> : null}
            </div>
            <div className="p-4 overflow-auto">
              {zoneMode === 'table' && zoneResult.table ? (
                <table className="w-full border-collapse text-sm">
                  <tbody>{zoneResult.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className="border border-gray-300 p-2 align-top whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody>
                </table>
              ) : (
                <textarea readOnly value={zoneResult.text} className="w-full min-h-[280px] border border-gray-300 rounded p-3 text-sm whitespace-pre-wrap" />
              )}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setZoneResult(null)} className="px-3 py-1.5 text-sm rounded border border-gray-300">Draw again</button>
              <button onClick={applyZoneResult} className="px-3 py-1.5 text-sm rounded bg-cyan-700 text-white hover:bg-cyan-800">Apply to paragraph</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
