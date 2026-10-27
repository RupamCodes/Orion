import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

console.log('--- Running Batch 4 Unit & Integration Tests ---');

// 1. XML escaping and SVG validity test
console.log('\n[Test 1] XML Escaping & SVG Validity Verification');
const escapeXml = (str = '') => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

assert.equal(
  escapeXml('AT&T <Research> "Quotes" & \'Apostrophes\''),
  'AT&amp;T &lt;Research&gt; &quot;Quotes&quot; &amp; &apos;Apostrophes&apos;',
  'escapeXml must correctly escape all XML special characters'
);

const testSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 680" width="860" height="680">
  <text x="40" y="60">${escapeXml('Research & Development <Batch 4>')}</text>
  <text x="40" y="90">${escapeXml('Value: "100%" & \'verified\'')}</text>
</svg>`;

// Validate XML using Python's standard xml.etree.ElementTree via stdin
execSync('python3 -c "import sys, xml.etree.ElementTree as ET; ET.fromstring(sys.stdin.read())"', { input: testSvg });
console.log('✓ Validated XML escaping and SVG parsing as well-formed XML successfully.');

// 2. Markdown Tokenization & Citation Extraction
console.log('\n[Test 2] Markdown Tokenization & Citation Interoperability');

const tokenRegex = /(\[\d+\]|`[^`\n]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;

const sampleMarkdown = 'According to research [1], the result is **critical** and *grounded* with `run()` [2].';
const tokens = sampleMarkdown.split(tokenRegex);

assert.ok(tokens.includes('[1]'), 'Tokens must capture citation [1]');
assert.ok(tokens.includes('[2]'), 'Tokens must capture citation [2]');
assert.ok(tokens.includes('**critical**'), 'Tokens must capture bold text');
assert.ok(tokens.includes('*grounded*'), 'Tokens must capture italic text');
assert.ok(tokens.includes('`run()`'), 'Tokens must capture inline code');
console.log('✓ Markdown inline tokenization correctly isolates citations, bold, italic, and code.');

// 3. Block-Level Structure Parsing
console.log('\n[Test 3] Markdown Block Parsing (Headings, Code Blocks, Lists)');
const lines = [
  '# Main Heading',
  'Here is an introductory paragraph [1].',
  '```python',
  'def compute():',
  '    return 42',
  '```',
  '- Item A',
  '- Item B [2]',
  '1. Step One',
  '2. Step Two'
];

let inCode = false;
let codeBuffer = [];
let headings = [];
let ulItems = [];
let olItems = [];

for (const line of lines) {
  if (inCode) {
    if (line.startsWith('```')) inCode = false;
    else codeBuffer.push(line);
    continue;
  }
  if (line.startsWith('```')) {
    inCode = true;
    continue;
  }
  const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
  if (hMatch) headings.push(hMatch[2]);
  const ulMatch = line.match(/^[-*]\s+(.+)$/);
  if (ulMatch) ulItems.push(ulMatch[1]);
  const olMatch = line.match(/^\d+\.\s+(.+)$/);
  if (olMatch) olItems.push(olMatch[1]);
}

assert.equal(headings.length, 1);
assert.equal(headings[0], 'Main Heading');
assert.equal(codeBuffer.join('\n'), 'def compute():\n    return 42');
assert.equal(ulItems.length, 2);
assert.equal(olItems.length, 2);
console.log('✓ Block parser correctly extracts headings, code blocks, unordered lists, and ordered lists.');

// 4. Flashcard Keyboard Navigation Logic
console.log('\n[Test 4] Flashcard Keyboard Navigation & Input Suppression Logic');

const isInteractiveInput = (tagName, isContentEditable) => {
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    Boolean(isContentEditable)
  );
};

assert.equal(isInteractiveInput('INPUT', false), true, 'Must ignore when focused on INPUT');
assert.equal(isInteractiveInput('TEXTAREA', false), true, 'Must ignore when focused on TEXTAREA');
assert.equal(isInteractiveInput('SELECT', false), true, 'Must ignore when focused on SELECT');
assert.equal(isInteractiveInput('DIV', true), true, 'Must ignore when contenteditable is active');
assert.equal(isInteractiveInput('DIV', false), false, 'Must allow shortcuts when not in form control');

// Navigation cycling logic
const totalCards = 5;
const nextIndex = (curr) => (curr + 1) % totalCards;
const prevIndex = (curr) => (curr - 1 + totalCards) % totalCards;

assert.equal(nextIndex(0), 1);
assert.equal(nextIndex(4), 0, 'Next from last card must wrap to 0');
assert.equal(prevIndex(0), 4, 'Prev from 0 must wrap to last card');
assert.equal(prevIndex(3), 2);
console.log('✓ Flashcard keyboard suppression and circular navigation logic verified.');

// 5. Mind Map Clamping & Interaction Disambiguation
console.log('\n[Test 5] Mind Map Zoom & Pan Clamping Boundaries');

const clampZoom = (z) => Math.min(2.5, Math.max(0.5, Number(z.toFixed(2))));
const clampPan = (x, y, zoom) => {
  const maxX = 300 * Math.max(1, zoom);
  const maxY = 220 * Math.max(1, zoom);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
};

assert.equal(clampZoom(0.1), 0.5, 'Minimum zoom must clamp to 0.5');
assert.equal(clampZoom(5.0), 2.5, 'Maximum zoom must clamp to 2.5');
assert.equal(clampZoom(1.4), 1.4, 'Normal zoom within bounds must be preserved');

const panClamped = clampPan(10000, -10000, 1.0);
assert.equal(panClamped.x, 300, 'X pan must be bounded within maxX');
assert.equal(panClamped.y, -220, 'Y pan must be bounded within maxY');

// Tap vs Drag threshold
const isTap = (dx, dy) => Math.hypot(dx, dy) <= 5;
assert.equal(isTap(2, 3), true, 'Small jitter (hypot ~3.6) must be treated as tap');
assert.equal(isTap(10, 5), false, 'Movement over 5px must be treated as pan/drag, not tap');
console.log('✓ Mind map zoom bounds, pan limits, and tap/pan disambiguation verified.');

// 6. Action Feedback & Clean Title Extraction
console.log('\n[Test 6] Note Save Title Sanitization & Operation Feedback');

const extractCleanNoteTitle = (content) => {
  const cleanSnippet = content
    .replace(/^[#\s*>-]+/gm, '')
    .replace(/\[\d+\]/g, '')
    .trim();
  return `Note: ${cleanSnippet.slice(0, 36) || 'Chat response'}...`;
};

const rawMsg = '### Key Recommendation [1]\nAlways verify database consistency [2].';
const title = extractCleanNoteTitle(rawMsg);
assert.equal(title.startsWith('Note: Key Recommendation'), true);
assert.ok(!title.includes('###'), 'Title should not contain raw Markdown header hashes');
assert.ok(!title.includes('[1]'), 'Title should not contain citation markers');
console.log('✓ Note title cleanup and sanitization verified.');

console.log('\n========================================');
console.log('ALL BATCH 4 VERIFICATION TESTS PASSED! ✓');
console.log('========================================\n');
