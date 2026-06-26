import React, { useState, useEffect, useCallback, useRef, createRef } from 'react';
import SummarizePane from './SummarizePane';
import { generateDocxBlob } from '../../docx';
import { writeDocxToFolder } from '../../storage';
import SmartTextarea from './SmartTextarea';

function parseParagraphs(project) {
  const html = project?.content || '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const result = [];
  let index = 0;

  const allEls = Array.from(div.body?.childNodes || div.childNodes).filter(
    n => n.nodeType === 1 && (n.tagName === 'P' || n.tagName === 'TABLE')
  );
  for (const el of allEls) {
    if (el.tagName === 'P') {
      const text = el.innerText.trim();
      if (text) {
        result.push({
          id: `p_${index}`,
          index,
          page: parseInt(el.getAttribute('data-page'), 10) || 1,
          filename: el.getAttribute('data-filename') || '',
          source: el.getAttribute('data-source') || undefined,
          sourceId: el.getAttribute('data-source-id') || undefined,
          sourcePage: parseInt(el.getAttribute('data-source-page'), 10) || undefined,
          text,
        });
        index++;
      }
    } else if (el.tagName === 'TABLE') {
      const rows = [];
      el.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => cells.push(td.innerText.trim()));
        rows.push(cells);
      });
      if (rows.length > 0) {
        const tableText = rows.map(r => r.join('\t')).join('\n');
        result.push({
          id: `p_${index}`,
          index,
          page: parseInt(el.getAttribute('data-page'), 10) || 1,
          filename: el.getAttribute('data-filename') || '',
          source: el.getAttribute('data-source') || 'pdf_text',
          sourceId: el.getAttribute('data-source-id') || undefined,
          sourcePage: parseInt(el.getAttribute('data-source-page'), 10) || undefined,
          type: 'table',
          rows,
          colCount: rows[0]?.length || 0,
          text: tableText,
        });
        index++;
      }
    }
  }

  const paraField = project?.paragraphsArray || project?.paragraphs;
  if (result.length === 0 && Array.isArray(paraField) && paraField.length > 0) {
    for (const p of paraField) {
      const entry = {
        id: p.id || `p_${index}`,
        index,
        page: p.page || 1,
        filename: p.filename || '',
        source: p.source || undefined,
        sourceId: p.sourceId || undefined,
        sourcePage: p.sourcePage || undefined,
        text: p.text,
      };
      if (p.type === 'table' && p.rows && p.rows.length > 0) {
        entry.type = 'table';
        entry.rows = p.rows.map(r => [...r]);
        entry.colCount = p.colCount || p.rows[0].length;
      }
      result.push(entry);
      index++;
    }
  }

  if (result.length === 0) {
    const lines = html.split(/\n\s*\n/);
    lines.forEach((line) => {
      const text = line.replace(/<[^>]*>/g, '').trim();
      if (text) result.push({ id: `p_${index}`, index, page: 1, text });
      index++;
    });
  }

  return result;
}

function getTableRows(para, originals) {
  const raw = originals && originals[para.index] !== undefined ? originals[para.index] : (para.text || '');
  return raw.split('\n').map(l => l.split('\t'));
}

function TableGroup({ rows, onCellChange, readOnly, className }) {
  return (
    <div className={className + ' overflow-x-auto'}>
      <table className="w-full border-collapse border border-gray-400 text-sm">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-gray-400 p-1 min-w-[60px] align-top">
                  {readOnly ? (
                    <span className="block whitespace-pre-wrap min-h-[1.2em]">{cell}</span>
                  ) : (
                    <textarea
                      value={cell}
                      onChange={(e) => onCellChange(ri, ci, e.target.value)}
                      className="w-full bg-transparent resize-none outline-none border-none p-0 m-0 text-sm font-sans leading-snug"
                      rows={Math.max(1, (cell || '').split('\n').length)}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageGroup({ pageNum, paragraphs, originals, onTextChange, textareaRefs }) {
  const filename = paragraphs[0]?.filename || '';
  return (
    <div className="mb-6">
      <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 flex items-center gap-3 shadow-sm">
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">PAGE {pageNum}</span>
        <span className="text-xs text-blue-700 font-medium">{paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''}</span>
        {filename && (
          <span className="text-xs text-blue-500 ml-auto truncate max-w-[200px]" title={filename}>{filename}</span>
        )}
      </div>
      {paragraphs.map((p) => {
        const text = originals[p.index] !== undefined ? originals[p.index] : p.text;
        const rows = Math.max(2, text.split('\n').length, Math.ceil(text.length / 55));
        if (!textareaRefs.current[p.index]) textareaRefs.current[p.index] = createRef();
        const isTable = p.type === 'table';
        return (
          <div key={p.id || p.index} data-para-index={p.index} className="mb-2 ml-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] text-gray-400 font-mono">{isTable ? '⊞' : '¶'}{p.index + 1}</span>
              <span className="text-[11px] text-gray-400">p.{pageNum}</span>
              {isTable && <span className="text-[10px] text-indigo-500 font-medium">Table</span>}
            </div>
            {isTable ? (
              <TableGroup
                rows={getTableRows(p, originals)}
                onCellChange={(ri, ci, val) => {
                  const r = getTableRows(p, originals);
                  r[ri][ci] = val;
                  const joined = r.map(row => row.join('\t')).join('\n');
                  onTextChange(p.index, joined);
                }}
                readOnly={false}
                className="bg-white border border-gray-300 rounded"
              />
            ) : (
              <SmartTextarea
                ref={textareaRefs.current[p.index]}
                value={text}
                onChange={(newText) => onTextChange(p.index, newText)}
                className="w-full p-3 border text-sm resize-y min-h-[3.5rem] font-sans leading-relaxed whitespace-pre-wrap rounded bg-white border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                rows={rows}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function UnifiedEditor({ project, images, paragraphs: origParagraphs, onSave, loading, analysisResult, onAnalysisResult, onLog }) {
  const [paragraphs, setParagraphs] = useState([]);
  const [originals, setOriginals] = useState({});
  const [editedTexts, setEditedTexts] = useState({});
  const [hasEdits, setHasEdits] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const textareaRefs = useRef({});
  const leftScrollRef = useRef(null);

  useEffect(() => {
    if (project) {
      const parsed = parseParagraphs(project);
      setParagraphs(parsed);
      const origs = {};
      for (const p of parsed) {
        origs[p.index] = p.text;
      }
      setOriginals(origs);
      setEditedTexts({});
      setHasEdits(false);
    }
  }, [project]);

  const pages = React.useMemo(() => {
    const map = {};
    for (const p of paragraphs) {
      const pg = p.page || 1;
      if (!map[pg]) map[pg] = [];
      map[pg].push(p);
    }
    return Object.entries(map)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([page, paras]) => ({ page: parseInt(page), paragraphs: paras }));
  }, [paragraphs]);

  const updateText = useCallback((index, text) => {
    setEditedTexts(prev => ({ ...prev, [index]: text }));
    setHasEdits(true);
  }, []);

  const handleSaveEdits = useCallback(async () => {
    const kept = [];
    const oldToNew = {};
    for (const p of paragraphs) {
      const text = editedTexts[p.index] !== undefined ? editedTexts[p.index] : originals[p.index] || p.text;
      if ((text || '').trim().length > 0) {
        oldToNew[p.index] = kept.length;
        kept.push({
          ...p,
          text,
          ...(p.type === 'table' ? {
            rows: getTableRows(p, editedTexts[p.index] !== undefined ? editedTexts : originals),
            colCount: Math.max(0, ...getTableRows(p, editedTexts[p.index] !== undefined ? editedTexts : originals).map(row => row.length)),
          } : {}),
        });
      }
    }
    const html = kept.map(p => {
      const sourceAttrs = `${p.source ? ` data-source="${p.source}"` : ''}` +
        `${p.sourceId ? ` data-source-id="${p.sourceId}"` : ''}` +
        `${p.sourcePage ? ` data-source-page="${p.sourcePage}"` : ''}`;
      if (p.type === 'table' && p.rows && p.rows.length > 0) {
        const rowsHtml = p.rows.map(r => '<tr>' + r.map(c => '<td>' + (c || '') + '</td>').join('') + '</tr>').join('');
        return `<table data-page="${p.page}" data-filename="${p.filename || ''}" data-type="table"${sourceAttrs}>${rowsHtml}</table>`;
      }
      return `<p data-page="${p.page}" data-filename="${p.filename || ''}"${sourceAttrs}>${p.text}</p>`;
    }).join('\n');

    await onSave(html, {});
    setHasEdits(false);
    setEditedTexts({});
  }, [paragraphs, originals, editedTexts, onSave]);

  const handleRevert = useCallback(() => {
    setEditedTexts({});
    setHasEdits(false);
  }, []);

  const handleExportDocx = useCallback(async () => {
    if (!project) return;
    setIsExporting(true);
    try {
      const exportData = paragraphs.map(p => ({
        page: p.page,
        text: editedTexts[p.index] !== undefined ? editedTexts[p.index] : originals[p.index] !== undefined ? originals[p.index] : p.text,
        type: p.type,
        rows: p.type === 'table' ? getTableRows(p, editedTexts[p.index] !== undefined ? editedTexts : originals) : undefined,
        colCount: p.colCount,
      }));

      const blob = await generateDocxBlob(exportData);
      const filename = `${(project.name || 'village').replace(/[\\/:*?"<>|]/g, '_')}.docx`;
      await writeDocxToFolder(project.id, blob, filename);
      alert(`Exported: ${filename}`);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  }, [project, paragraphs, originals, editedTexts]);

  return (
    <div className="h-full flex">
      <div className="w-1/2 border-r border-gray-300 flex flex-col">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 text-sm font-medium text-gray-700 flex items-center justify-between">
          <span>Document Editor</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEdits}
              disabled={!hasEdits || loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Edits'}
            </button>
            {hasEdits && (
              <button
                onClick={handleRevert}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-3 py-1 rounded"
              >
                Revert
              </button>
            )}
            <button
              onClick={handleExportDocx}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export DOCX'}
            </button>
          </div>
        </div>
        <div ref={leftScrollRef} className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {pages.map(({ page, paragraphs: pageParas }) => (
            <PageGroup
              key={page}
              pageNum={page}
              paragraphs={pageParas}
              originals={{ ...originals, ...editedTexts }}
              onTextChange={updateText}
              textareaRefs={textareaRefs}
            />
          ))}
          {pages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg">No paragraphs</p>
              <p className="text-sm mt-2">Import or scan a document to get started.</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col">
        <SummarizePane
          project={{
            ...project,
            paragraphsArray: paragraphs.map(p => ({
              ...p,
              text: editedTexts[p.index] !== undefined ? editedTexts[p.index] : originals[p.index] !== undefined ? originals[p.index] : p.text,
            })),
          }}
          analysisResult={analysisResult}
          onAnalysisResult={onAnalysisResult}
          onLog={onLog}
        />
      </div>
    </div>
  );
}