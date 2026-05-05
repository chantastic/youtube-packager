/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('create and list an event', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });
	const events = await t.query(api.events.list);
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({ name: 'TestConf', year: 2026 });
});

test('create with titleFormat', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.create, {
		name: 'TestConf',
		year: 2026,
		titleFormat: '{title} - {event_name} {year}'
	});
	const events = await t.query(api.events.list);
	expect(events[0].titleFormat).toBe('{title} - {event_name} {year}');
});

test('create without titleFormat stores undefined', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });
	const events = await t.query(api.events.list);
	expect(events[0].titleFormat).toBeUndefined();
});

test('update event fields', async () => {
	const t = convexTest(schema, modules);
	const id = await t.mutation(api.events.create, { name: 'OldName', year: 2025 });
	await t.mutation(api.events.update, {
		id,
		name: 'NewName',
		year: 2026,
		titleFormat: '{title} | {event_name}'
	});
	const events = await t.query(api.events.list);
	expect(events[0]).toMatchObject({
		name: 'NewName',
		year: 2026,
		titleFormat: '{title} | {event_name}'
	});
});

test('remove deletes the event', async () => {
	const t = convexTest(schema, modules);
	const id = await t.mutation(api.events.create, { name: 'ToDelete', year: 2026 });
	await t.mutation(api.events.remove, { id });
	const events = await t.query(api.events.list);
	expect(events).toHaveLength(0);
});

test('list returns multiple events in order', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.create, { name: 'First', year: 2025 });
	await t.mutation(api.events.create, { name: 'Second', year: 2026 });
	const events = await t.query(api.events.list);
	expect(events).toHaveLength(2);
	expect(events[0].name).toBe('First');
	expect(events[1].name).toBe('Second');
});
