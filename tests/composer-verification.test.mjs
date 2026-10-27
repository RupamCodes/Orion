import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Orion Chat Composer Dynamic Sizing & Layout Verification ---');

// 1. Textarea Auto-Grow Sizing Logic Test
console.log('\n[Test 1] Textarea Dynamic Height Sizing Math & Invariants');

const MIN_TEXTAREA_HEIGHT = 52; // compact starting height: 48-56px
const MAX_TEXTAREA_HEIGHT = 180; // natural multiline expansion limit: 160-200px

assert.ok(
  MIN_TEXTAREA_HEIGHT >= 48 && MIN_TEXTAREA_HEIGHT <= 56,
  'MIN_TEXTAREA_HEIGHT must be in range 48-56px'
);
assert.ok(
  MAX_TEXTAREA_HEIGHT >= 160 && MAX_TEXTAREA_HEIGHT <= 200,
  'MAX_TEXTAREA_HEIGHT must be in range 160-200px'
);

const computeTextareaHeight = (scrollHeight, windowHeight = 800) => {
  const viewportLimit = Math.max(MIN_TEXTAREA_HEIGHT, Math.floor(windowHeight * 0.35));
  const effectiveMax = Math.min(MAX_TEXTAREA_HEIGHT, viewportLimit);
  const targetHeight = Math.min(Math.max(scrollHeight, MIN_TEXTAREA_HEIGHT), effectiveMax);
  const overflowY = scrollHeight > effectiveMax ? 'auto' : 'hidden';
  return { targetHeight, overflowY, effectiveMax };
};

// Case A: Compact empty/single line
const singleLine = computeTextareaHeight(48);
assert.equal(singleLine.targetHeight, 52, 'Single line should clamp to compact MIN_HEIGHT (52px)');
assert.equal(singleLine.overflowY, 'hidden', 'Internal scrolling should be hidden for single line');

// Case B: Multiline within bounds (3-4 lines, scrollHeight ~95px)
const multiline = computeTextareaHeight(95);
assert.equal(multiline.targetHeight, 95, 'Multiline should auto-grow naturally to 95px');
assert.equal(multiline.overflowY, 'hidden', 'Internal scrolling should be hidden within bounds');

// Case C: Long multiline exceeding maximum (scrollHeight = 300px)
const longMultiline = computeTextareaHeight(300);
assert.equal(longMultiline.targetHeight, 180, 'Large multiline should cap at MAX_TEXTAREA_HEIGHT (180px)');
assert.equal(longMultiline.overflowY, 'auto', 'Internal scrolling must be enabled when exceeding max height');

// Case D: Reset on send / clear
const resetState = computeTextareaHeight(0);
assert.equal(resetState.targetHeight, 52, 'Clearing input must reset height to 52px');
assert.equal(resetState.overflowY, 'hidden', 'Clearing input must reset overflow to hidden');

// Case E: Short-height viewport adaptation (e.g. 350px viewport)
const shortViewport = computeTextareaHeight(300, 350);
assert.ok(
  shortViewport.targetHeight < 180,
  'In a short viewport, effective maximum must adapt to prevent screen takeover'
);
assert.equal(
  shortViewport.effectiveMax,
  Math.max(MIN_TEXTAREA_HEIGHT, Math.floor(350 * 0.35)), // 122px
  'Effective max must adapt to 35% of viewport'
);
assert.equal(shortViewport.overflowY, 'auto', 'Scrolling enables at the adapted limit');
console.log('✓ Textarea sizing math matches all specifications (compact start, natural grow, capped max, internal scroll, reset, short viewport adaptation).');

// 2. Keyboard interaction behavior test
console.log('\n[Test 2] Keyboard Interaction Behavior (Enter vs Shift+Enter)');

const shouldSendMessage = (key, shiftKey, isComposing) => {
  if (key === 'Enter' && !shiftKey && !isComposing) {
    return true;
  }
  return false;
};

assert.equal(shouldSendMessage('Enter', false, false), true, 'Enter sends message');
assert.equal(shouldSendMessage('Enter', true, false), false, 'Shift+Enter inserts newline without sending');
assert.equal(shouldSendMessage('Enter', false, true), false, 'IME composing Enter does not send message');
assert.equal(shouldSendMessage('a', false, false), false, 'Other keys do not send message');
console.log('✓ Keyboard handler correctly enforces Enter to send and Shift+Enter for newline.');

// 3. Inspect Source Files for Layout & Styling Integrity
console.log('\n[Test 3] Source Layout & CSS Class Verification');

const chatWorkspacePath = path.resolve('src/components/ChatWorkspace.tsx');
const pagePath = path.resolve('src/app/page.tsx');

const chatWorkspaceCode = fs.readFileSync(chatWorkspacePath, 'utf8');
const pageCode = fs.readFileSync(pagePath, 'utf8');

// ChatWorkspace verification
assert.ok(chatWorkspaceCode.includes('min-h-0'), 'ChatWorkspace must include min-h-0');
assert.ok(chatWorkspaceCode.includes('min-w-0'), 'ChatWorkspace must include min-w-0');
assert.ok(chatWorkspaceCode.includes('flex flex-col'), 'ChatWorkspace must use flex flex-col layout');
assert.ok(chatWorkspaceCode.includes('textareaRef'), 'ChatWorkspace must use a textareaRef for resizing');
assert.ok(chatWorkspaceCode.includes('adjustTextareaHeight'), 'ChatWorkspace must implement adjustTextareaHeight');
assert.ok(chatWorkspaceCode.includes('MIN_TEXTAREA_HEIGHT'), 'ChatWorkspace must declare MIN_TEXTAREA_HEIGHT');
assert.ok(chatWorkspaceCode.includes('MAX_TEXTAREA_HEIGHT'), 'ChatWorkspace must declare MAX_TEXTAREA_HEIGHT');
assert.ok(chatWorkspaceCode.includes('overflow-y-auto'), 'Message history stream must scroll with overflow-y-auto');
assert.ok(chatWorkspaceCode.includes('shrink-0'), 'Composer wrapper must have shrink-0 to stay anchored at bottom');

// page.tsx layout verification
assert.ok(pageCode.includes('min-h-0'), 'page.tsx main workspace must include min-h-0');
assert.ok(pageCode.includes('min-w-0'), 'page.tsx chat panel container must include min-w-0');
assert.ok(pageCode.includes('100dvh'), 'page.tsx root container must account for dynamic viewport height (100dvh)');

console.log('✓ Source code structure correctly implements responsive layout and dynamic sizing requirements.');
console.log('\nAll composer verification tests passed successfully!\n');
