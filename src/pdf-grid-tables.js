const CONSTRUCT_PATH = 91;
const TOLERANCE = 2.2;

function near(a, b, tolerance = TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

function between(value, a, b, tolerance = TOLERANCE) {
  return value >= Math.min(a, b) - tolerance && value <= Math.max(a, b) + tolerance;
}

function rangesOverlap(a0, a1, b0, b1, tolerance = TOLERANCE) {
  return Math.min(Math.max(a0, a1), Math.max(b0, b1)) >= Math.max(Math.min(a0, a1), Math.min(b0, b1)) - tolerance;
}

function axisSegment(from, to) {
  if (!from || !to) return null;
  if (near(from.y, to.y) && Math.abs(from.x - to.x) >= 20) {
    return { axis: 'h', x0: Math.min(from.x, to.x), x1: Math.max(from.x, to.x), y0: (from.y + to.y) / 2, y1: (from.y + to.y) / 2 };
  }
  if (near(from.x, to.x) && Math.abs(from.y - to.y) >= 20) {
    return { axis: 'v', x0: (from.x + to.x) / 2, x1: (from.x + to.x) / 2, y0: Math.min(from.y, to.y), y1: Math.max(from.y, to.y) };
  }
  return null;
}

export function extractGridSegments(operatorList) {
  const segments = [];
  for (let index = 0; index < (operatorList?.fnArray?.length || 0); index++) {
    if (operatorList.fnArray[index] !== CONSTRUCT_PATH) continue;
    const rawValues = operatorList.argsArray[index]?.[1] || [];
    const values = Array.from(rawValues[0] || rawValues);
    let cursor = 0;
    let current = null;
    let start = null;
    while (cursor < values.length) {
      const command = values[cursor++];
      if (command === 0 || command === 1) {
        const point = { x: values[cursor++], y: values[cursor++] };
        if (command === 0) {
          current = point;
          start = point;
        } else {
          const segment = axisSegment(current, point);
          if (segment) segments.push(segment);
          current = point;
        }
      } else if (command === 2) {
        cursor += 4;
        current = { x: values[cursor++], y: values[cursor++] };
      } else if (command === 3) {
        cursor += 2;
        current = { x: values[cursor++], y: values[cursor++] };
      } else if (command === 4) {
        const segment = axisSegment(current, start);
        if (segment) segments.push(segment);
        current = start;
      } else {
        break;
      }
    }
  }
  return segments;
}

function connected(a, b) {
  if (a.axis !== b.axis) {
    const horizontal = a.axis === 'h' ? a : b;
    const vertical = a.axis === 'v' ? a : b;
    return between(vertical.x0, horizontal.x0, horizontal.x1) && between(horizontal.y0, vertical.y0, vertical.y1);
  }
  if (a.axis === 'h') return near(a.y0, b.y0) && rangesOverlap(a.x0, a.x1, b.x0, b.x1);
  return near(a.x0, b.x0) && rangesOverlap(a.y0, a.y1, b.y0, b.y1);
}

function clusterValues(values, tolerance = 3) {
  const clusters = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const cluster = clusters.find((entry) => Math.abs(entry.value - value) <= tolerance);
    if (cluster) {
      cluster.values.push(value);
      cluster.value = cluster.values.reduce((sum, item) => sum + item, 0) / cluster.values.length;
    } else {
      clusters.push({ value, values: [value] });
    }
  }
  return clusters.map((entry) => entry.value).sort((a, b) => a - b);
}

function componentIndexes(segments) {
  const parent = segments.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      if (connected(segments[a], segments[b])) union(a, b);
    }
  }
  const groups = new Map();
  segments.forEach((segment, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(segment);
  });
  return [...groups.values()];
}

function textItemCenter(item) {
  const x0 = item.transform?.[4] || 0;
  const baseline = item.transform?.[5] || 0;
  const height = Math.max(1, item.height || Math.abs(item.transform?.[3] || 0));
  return { x: x0 + Math.max(1, item.width || 0) / 2, y: baseline + height / 2, baseline, x0 };
}

function cellText(items) {
  const sorted = [...items].sort((a, b) => {
    const aa = textItemCenter(a);
    const bb = textItemCenter(b);
    return bb.baseline - aa.baseline || aa.x0 - bb.x0;
  });
  const lines = [];
  for (const item of sorted) {
    const position = textItemCenter(item);
    let line = lines.find((entry) => Math.abs(entry.baseline - position.baseline) <= Math.max(2, (item.height || 8) * 0.45));
    if (!line) {
      line = { baseline: position.baseline, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  return lines
    .sort((a, b) => b.baseline - a.baseline)
    .map((line) => line.items.sort((a, b) => textItemCenter(a).x0 - textItemCenter(b).x0).map((item) => String(item.str || '').trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

function sameBoundaries(a, b) {
  return a.length === b.length && a.every((value, index) => near(value, b[index], 3));
}

function componentGrids(component) {
  const horizontal = component.filter((segment) => segment.axis === 'h');
  const vertical = component.filter((segment) => segment.axis === 'v');
  const ys = clusterValues(horizontal.map((segment) => segment.y0)).sort((a, b) => b - a);
  const bands = [];
  for (let index = 0; index < ys.length - 1; index++) {
    const middle = (ys[index] + ys[index + 1]) / 2;
    const xs = clusterValues(vertical.filter((segment) => between(middle, segment.y0, segment.y1, 1)).map((segment) => segment.x0));
    if (xs.length >= 2) bands.push({ index, xs });
  }
  const grids = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const start = current[0].index;
    const end = current.at(-1).index;
    grids.push({ xs: current[0].xs, ys: ys.slice(start, end + 2) });
    current = [];
  };
  for (const band of bands) {
    if (current.length && (band.index !== current.at(-1).index + 1 || !sameBoundaries(band.xs, current[0].xs))) flush();
    current.push(band);
  }
  flush();
  return grids;
}

export function detectPdfGridTables(items = [], operatorList, pageHeight) {
  const segments = extractGridSegments(operatorList);
  const components = componentIndexes(segments);
  const tables = [];

  for (const component of components) {
    const horizontal = component.filter((segment) => segment.axis === 'h');
    const vertical = component.filter((segment) => segment.axis === 'v');
    if (horizontal.length < 2 || vertical.length < 2) continue;
    for (const grid of componentGrids(component)) {
      const { xs, ys } = grid;
      if (xs.length < 2 || ys.length < 2 || (xs.length - 1) * (ys.length - 1) < 2) continue;

      const minX = xs[0];
      const maxX = xs.at(-1);
      const minY = ys.at(-1);
      const maxY = ys[0];
      const contained = items.filter((item) => {
        const center = textItemCenter(item);
        return between(center.x, minX, maxX, 3) && between(center.y, minY, maxY, 3);
      });
      if (!contained.length) continue;

      const rows = Array.from({ length: ys.length - 1 }, () => Array.from({ length: xs.length - 1 }, () => []));
      for (const item of contained) {
        const center = textItemCenter(item);
        const column = xs.findIndex((_, index) => index < xs.length - 1 && between(center.x, xs[index], xs[index + 1], 2));
        const row = ys.findIndex((top, index) => index < ys.length - 1 && between(center.y, ys[index + 1], top, 2));
        if (row >= 0 && column >= 0) rows[row][column].push(item);
      }
      const textRows = rows.map((row) => row.map(cellText));
      const nonEmptyCells = textRows.flat().filter(Boolean).length;
      if (nonEmptyCells < 2) continue;
      tables.push({
        type: 'table',
        rows: textRows,
        colCount: xs.length - 1,
        text: textRows.map((row) => row.join('\t')).join('\n'),
        bbox: { x0: minX, y0: pageHeight - maxY, x1: maxX, y1: pageHeight - minY },
        pdfBounds: { minX, minY, maxX, maxY },
        sortY: maxY,
        source: 'pdf_text',
      });
    }
  }
  return tables.sort((a, b) => b.sortY - a.sortY || a.pdfBounds.minX - b.pdfBounds.minX);
}

export function itemInsidePdfTable(item, table) {
  const center = textItemCenter(item);
  const bounds = table.pdfBounds;
  return !!bounds && between(center.x, bounds.minX, bounds.maxX, 3) && between(center.y, bounds.minY, bounds.maxY, 3);
}
