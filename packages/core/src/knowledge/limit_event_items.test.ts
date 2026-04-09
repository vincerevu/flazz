import test from 'node:test';
import assert from 'node:assert';
import { limitEventItems, MAX_EVENT_ITEMS } from './limit_event_items.js';

test('limitEventItems', async (t) => {
    await t.test('should return all items and truncated false when items length is less than max', () => {
        const items = ['a', 'b', 'c'];
        const max = 5;
        const result = limitEventItems(items, max);
        assert.deepStrictEqual(result.items, ['a', 'b', 'c']);
        assert.strictEqual(result.truncated, false);
    });

    await t.test('should return all items and truncated false when items length is equal to max', () => {
        const items = ['a', 'b', 'c'];
        const max = 3;
        const result = limitEventItems(items, max);
        assert.deepStrictEqual(result.items, ['a', 'b', 'c']);
        assert.strictEqual(result.truncated, false);
    });

    await t.test('should return truncated items and truncated true when items length is greater than max', () => {
        const items = ['a', 'b', 'c', 'd', 'e'];
        const max = 3;
        const result = limitEventItems(items, max);
        assert.deepStrictEqual(result.items, ['a', 'b', 'c']);
        assert.strictEqual(result.truncated, true);
    });

    await t.test('should use MAX_EVENT_ITEMS as default max', () => {
        const items = Array.from({ length: MAX_EVENT_ITEMS + 1 }, (_, i) => i.toString());
        const result = limitEventItems(items);
        assert.strictEqual(result.items.length, MAX_EVENT_ITEMS);
        assert.strictEqual(result.truncated, true);
    });

    await t.test('should return empty items and truncated false when input items is empty', () => {
        const items: string[] = [];
        const result = limitEventItems(items);
        assert.deepStrictEqual(result.items, []);
        assert.strictEqual(result.truncated, false);
    });

    await t.test('should handle max = 0 correctly', () => {
        const items = ['a', 'b', 'c'];
        const max = 0;
        const result = limitEventItems(items, max);
        assert.deepStrictEqual(result.items, []);
        assert.strictEqual(result.truncated, true);
    });
});
