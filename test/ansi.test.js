const test = require('node:test');
const assert = require('node:assert/strict');
const { stripAnsi, stringWidth, padRight, truncate } = require('../src/utils/ansi');

test('stripAnsi removes all terminal styling and color sequences', () => {
  const colored = '\x1b[31m\x1b[1mError:\x1b[0m file not found';
  assert.equal(stripAnsi(colored), 'Error: file not found');
  assert.equal(stripAnsi(null), '');
});

test('stringWidth accurately counts ASCII, wide characters, and emojis', () => {
  assert.equal(stringWidth('hello'), 5);
  assert.equal(stringWidth('🚀'), 2);
  assert.equal(stringWidth('●'), 1);
  assert.equal(stringWidth('\x1b[32mhello\x1b[0m'), 5);
  assert.equal(stringWidth('🚀 AGY'), 6);
});

test('padRight pads strictly to visual terminal columns', () => {
  const padded = padRight('test', 10);
  assert.equal(stringWidth(padded), 10);
  assert.equal(padded, 'test      ');

  const colored = '\x1b[34mtest\x1b[0m';
  const paddedColored = padRight(colored, 8);
  assert.equal(stringWidth(paddedColored), 8);
});

test('truncate shortens string with ellipsis when exceeding limit', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('very long profile name that needs shortening', 12), 'very long p…');
});
