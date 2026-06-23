import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownTable } from '../src/spellcheck.js';

test('parses markdown table output from table OCR', () => {
  const table = parseMarkdownTable('| Name | Count |\n| --- | --- |\n| A | 12 |\n| B | 9 |');
  assert.deepEqual(table.rows, [['Name', 'Count'], ['A', '12'], ['B', '9']]);
  assert.equal(table.colCount, 2);
});

test('parses tab and multi-space aligned OCR rows', () => {
  const table = parseMarkdownTable('Village\tWomen\tMen\nChoknar  18  12\nTotal  18  12');
  assert.deepEqual(table.rows, [
    ['Village', 'Women', 'Men'],
    ['Choknar', '18', '12'],
    ['Total', '18', '12'],
  ]);
});

test('does not turn ordinary prose into a table', () => {
  assert.equal(parseMarkdownTable('One ordinary line\nAnother ordinary line'), null);
});
