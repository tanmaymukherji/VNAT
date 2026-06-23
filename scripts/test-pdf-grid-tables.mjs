import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPdfGridTables, extractGridSegments, itemInsidePdfTable } from '../src/pdf-grid-tables.js';

function path(points) {
  const values = [];
  points.forEach(([x, y], index) => values.push(index === 0 ? 0 : 1, x, y));
  return values;
}

function text(str, x, y) {
  return { str, transform: [1, 0, 0, 10, x, y], width: str.length * 5, height: 10 };
}

test('extracts a PDF vector grid and assigns text to stable cells', () => {
  const paths = [
    path([[10, 100], [210, 100]]), path([[10, 60], [210, 60]]), path([[10, 20], [210, 20]]),
    path([[10, 20], [10, 100]]), path([[110, 20], [110, 100]]), path([[210, 20], [210, 100]]),
  ];
  const operatorList = {
    fnArray: paths.map(() => 91),
    argsArray: paths.map((values) => [null, [Float32Array.from(values)]]),
  };
  assert.equal(extractGridSegments(operatorList).length, 6);

  const items = [text('Name', 20, 75), text('Count', 130, 75), text('A', 20, 35), text('12', 130, 35)];
  const tables = detectPdfGridTables(items, operatorList, 120);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, [['Name', 'Count'], ['A', '12']]);
  assert.equal(tables[0].text, 'Name\tCount\nA\t12');
  assert.equal(itemInsidePdfTable(items[0], tables[0]), true);
});
