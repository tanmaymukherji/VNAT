import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, ImageRun } from 'docx';
import { utils, write } from 'xlsx';
import { saveAs } from 'file-saver';

const BRAND_BLUE = '1e3a5f';

function buildNeedsTable(needs) {
  const headerRow = new TableRow({
    children: ['Need', 'Category', 'Priority', 'Source', 'Suggested Action', 'Timeline', 'Responsible Party', 'Budget Estimate', 'Status', 'Remarks'].map(col => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, color: 'ffffff', size: 18 })] })],
      shading: { fill: BRAND_BLUE, type: 'clear' },
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    })),
  });

  const dataRows = needs.map((n, i) => {
    const bg = i % 2 === 0 ? 'ffffff' : 'f8fafc';
    const vals = [
      (n.need || '').slice(0, 200),
      n.category || '',
      n.priority || '',
      (n.source || '').slice(0, 200),
      (n.suggested_action || '').slice(0, 200),
      (n.timeline || '').slice(0, 200),
      (n.responsible_party || '').slice(0, 200),
      (n.budget_estimate || '').slice(0, 200),
      n.status || '',
      (n.remarks || '').slice(0, 200),
    ];
    return new TableRow({
      children: vals.map((val, vi) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: val, size: 17 })] })],
        shading: { fill: bg, type: 'clear' },
        margins: { top: 40, bottom: 40, left: 60, right: 60 },
      })),
    });
  });

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

async function downscaleImage(dataUrl, maxWidth = 500) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function headingStyle(text, level) {
  return new Paragraph({
    text,
    heading: level || HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 100 },
  });
}

export async function downloadReportDocx(analysisResult, imageDataUrls, currentLang = 'en') {
  const d = analysisResult;
  if (!d) throw new Error('No analysis result');

  const imageParagraphs = [];
  if (imageDataUrls && imageDataUrls.length > 0) {
    for (const img of imageDataUrls) {
      try {
        const scaled = await downscaleImage(img.dataUrl, 500);
        if (!scaled) continue;
        const imgData = scaled.split(',')[1];
        const imgBuffer = new Uint8Array(atob(imgData).split('').map(c => c.charCodeAt(0)));
        imageParagraphs.push(
          new Paragraph({
            children: [new ImageRun({ data: imgBuffer, transformation: { width: 300, height: 200 }, type: 'jpg' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: img.name, size: 16, color: '64748b' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      } catch {}
    }
  }

  const contextParagraphs = (d.context || '').split('\n\n').filter(Boolean).map(p => para(p));
  const findingsParagraphs = (d.key_findings || []).map(f => new Paragraph({
    children: [new TextRun({ text: '• ' + f, size: 20 })],
    spacing: { after: 60 },
  }));

  const titleText = d.village_name
    ? `${currentLang === 'hi' ? 'गाँव रिपोर्ट' : 'Village Report'} — ${d.village_name}`
    : (currentLang === 'hi' ? 'गाँव रिपोर्ट' : 'Village Report');

  const labels = {
    villageDetails: currentLang === 'hi' ? 'गाँव विवरण' : 'Village Details',
    villageName: currentLang === 'hi' ? 'गाँव का नाम' : 'Village Name',
    districtState: currentLang === 'hi' ? 'ज़िला / राज्य' : 'District / State',
    population: currentLang === 'hi' ? 'आबादी' : 'Population',
    languages: currentLang === 'hi' ? 'भाषाएँ' : 'Languages',
    villageContext: currentLang === 'hi' ? 'गाँव संदर्भ' : 'Village Context',
    needsLabel: currentLang === 'hi' ? 'ज़रूरतें' : 'Needs Emerging',
    keyFindings: currentLang === 'hi' ? 'मुख्य निष्कर्ष' : 'Key Findings',
    imagesLabel: currentLang === 'hi' ? 'चित्र' : 'Images',
  };

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: titleText, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        headingStyle(labels.villageDetails),
        para(`${labels.villageName}: ${d.village_name || '-'}`),
        para(`${labels.districtState}: ${d.district_state || '-'}`),
        para(`${labels.population}: ${d.population || '-'}`),
        para(`${labels.languages}: ${(d.languages_detected || ['English']).join(', ')}`),
        new Paragraph({ children: [], spacing: { after: 160 } }),
        headingStyle(labels.villageContext),
        ...contextParagraphs,
        new Paragraph({ children: [], spacing: { after: 160 } }),
        headingStyle(labels.needsLabel),
        buildNeedsTable(d.needs || []),
        ...(d.key_findings?.length > 0 ? [
          new Paragraph({ children: [], spacing: { after: 160 } }),
          headingStyle(labels.keyFindings),
          ...findingsParagraphs,
        ] : []),
        ...(imageParagraphs.length > 0 ? [
          new Paragraph({ children: [], spacing: { after: 160 } }),
          headingStyle(labels.imagesLabel),
          ...imageParagraphs,
        ] : []),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const name = (d.village_name || 'village_report').replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, name + '_report.docx');
}

export function downloadReportXlsx(analysisResult, imageDataUrls, currentLang = 'en') {
  const d = analysisResult;
  if (!d) { console.error('[XLSX] No analysis result'); throw new Error('No analysis result'); }

  try {
    const wb = utils.book_new();
    const encCell = utils.encode_cell;
    const encRange = utils.encode_range;

    // Build Needs sheet manually using direct cell assignment
    const wsNeeds = {};
    const needsCols = ['Need', 'Category', 'Priority', 'Source', 'Suggested Action', 'Timeline', 'Responsible Party', 'Budget Estimate', 'Status', 'Remarks'];
    const needs = d.needs || [];
    const numNeedsRows = 1 + needs.length;
    const numNeedsCols = needsCols.length;

    for (let c = 0; c < numNeedsCols; c++) {
      wsNeeds[encCell({ r: 0, c })] = { v: needsCols[c], t: 's' };
    }
    for (let r = 0; r < needs.length; r++) {
      const n = needs[r];
      const vals = [
        n.need || '', n.category || '', n.priority || '',
        n.source || '', n.suggested_action || '', n.timeline || '',
        n.responsible_party || '', n.budget_estimate || '', n.status || '', n.remarks || '',
      ];
      for (let c = 0; c < vals.length; c++) {
        wsNeeds[encCell({ r: r + 1, c })] = { v: vals[c], t: typeof vals[c] === 'number' ? 'n' : 's' };
      }
    }
    wsNeeds['!ref'] = encRange({ s: { r: 0, c: 0 }, e: { r: numNeedsRows - 1, c: numNeedsCols - 1 } });
    wsNeeds['!cols'] = needsCols.map(() => ({ wch: 20 }));
    utils.book_append_sheet(wb, wsNeeds, 'Needs');

    // Build Summary sheet
    const labels = {
      villageDetails: currentLang === 'hi' ? 'गाँव विवरण' : 'Village Details',
      villageName: currentLang === 'hi' ? 'गाँव का नाम' : 'Village Name',
      districtState: currentLang === 'hi' ? 'ज़िला / राज्य' : 'District / State',
      population: currentLang === 'hi' ? 'आबादी' : 'Population',
      languages: currentLang === 'hi' ? 'भाषाएँ' : 'Languages',
      villageContext: currentLang === 'hi' ? 'गाँव संदर्भ' : 'Village Context',
      keyFindings: currentLang === 'hi' ? 'मुख्य निष्कर्ष' : 'Key Findings',
      imagesLabel: currentLang === 'hi' ? 'चित्र' : 'Images',
    };

    const sumRows = [
      [labels.villageDetails, ''],
      [labels.villageName, d.village_name || ''],
      [labels.districtState, d.district_state || ''],
      [labels.population, d.population || ''],
      [labels.languages, (d.languages_detected || []).join(', ')],
      ['', ''],
      [labels.villageContext, ''],
      ...(d.context || '').split('\n\n').filter(Boolean).map(p => [p]),
      ['', ''],
      [labels.keyFindings, ''],
      ...(d.key_findings || []).map(f => [f]),
      ['', ''],
      [labels.imagesLabel + ' (' + (imageDataUrls || []).length + ')', (imageDataUrls || []).map(i => i.name).join(', ') || 'None'],
    ];

    const wsSum = {};
    for (let r = 0; r < sumRows.length; r++) {
      const row = sumRows[r];
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val === undefined || val === null) continue;
        wsSum[encCell({ r, c })] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
      }
    }
    wsSum['!ref'] = encRange({ s: { r: 0, c: 0 }, e: { r: sumRows.length - 1, c: 1 } });
    wsSum['!cols'] = [{ wch: 25 }, { wch: 100 }];
    utils.book_append_sheet(wb, wsSum, 'Summary');

    // Images sheet
    if (imageDataUrls && imageDataUrls.length > 0) {
      const wsImg = {};
      const imgHeader = currentLang === 'hi' ? 'चित्र फ़ाइलें' : 'Image Files';
      wsImg[encCell({ r: 0, c: 0 })] = { v: imgHeader, t: 's' };
      for (let r = 0; r < imageDataUrls.length; r++) {
        wsImg[encCell({ r: r + 1, c: 0 })] = { v: imageDataUrls[r].name, t: 's' };
      }
      wsImg['!ref'] = encRange({ s: { r: 0, c: 0 }, e: { r: imageDataUrls.length, c: 0 } });
      wsImg['!cols'] = [{ wch: 50 }];
      utils.book_append_sheet(wb, wsImg, 'Images');
    }

    // Write and download
    const name = (d.village_name || 'village_report').replace(/[\\/:*?"<>|]/g, '_');
    const filename = name + '_report.xlsx';
    console.log('[XLSX] Sheets:', wb.SheetNames);

    const binStr = write(wb, { bookType: 'xlsx', type: 'binary' });
    console.log('[XLSX] Binary size:', binStr.length);

    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
  } catch (err) {
    console.error('[XLSX] Export error:', err);
    throw err;
  }
}