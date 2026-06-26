import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, ImageRun } from 'docx';
import { utils, write } from 'xlsx';
import { saveAs } from 'file-saver';

const BRAND_BLUE = '1e3a5f';

const NEEDS_COLUMNS = ['Need', 'Category', 'Priority', 'Source', 'Suggested Action', 'Timeline', 'Responsible Party', 'Budget Estimate', 'Status', 'Remarks'];

function buildNeedsTable(needs) {
  const headerRow = new TableRow({
    children: NEEDS_COLUMNS.map(col => new TableCell({
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

    const needsData = [NEEDS_COLUMNS];
    for (const n of d.needs || []) {
      needsData.push([
        n.need || '', n.category || '', n.priority || '',
        n.source || '', n.suggested_action || '', n.timeline || '',
        n.responsible_party || '', n.budget_estimate || '', n.status || '', n.remarks || '',
      ]);
    }
    const wsNeeds = utils.aoa_to_sheet(needsData);
    wsNeeds['!cols'] = [50, 22, 10, 30, 35, 15, 22, 15, 12, 35];
    utils.book_append_sheet(wb, wsNeeds, 'Needs');

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

    const sumData = [
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
    const wsSum = utils.aoa_to_sheet(sumData);
    wsSum['!cols'] = [25, 100];
    utils.book_append_sheet(wb, wsSum, 'Summary');

    if (imageDataUrls && imageDataUrls.length > 0) {
      const imgRows = [[currentLang === 'hi' ? 'चित्र फ़ाइलें' : 'Image Files']];
      imageDataUrls.forEach(img => imgRows.push([img.name]));
      const wsImg = utils.aoa_to_sheet(imgRows);
      wsImg['!cols'] = [50];
      utils.book_append_sheet(wb, wsImg, 'Images');
    }

    const name = (d.village_name || 'village_report').replace(/[\\/:*?"<>|]/g, '_');
    const filename = name + '_report.xlsx';

    // Validate workbook has sheets before writing
    if (wb.SheetNames.length === 0) {
      throw new Error('Workbook has no sheets');
    }
    console.log('[XLSX] Generating with', wb.SheetNames.length, 'sheets:', wb.SheetNames.join(', '));

    // Write xlsx as binary string, convert to Uint8Array, then Blob
    const binStr = write(wb, { bookType: 'xlsx', type: 'binary' });
    console.log('[XLSX] Binary string length:', binStr.length);

    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Download using file-saver (same approach as DOCX export)
    saveAs(blob, filename);
  } catch (err) {
    console.error('[XLSX] Export error:', err);
    throw err;
  }
}