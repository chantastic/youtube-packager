/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('upsert and collect an event', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const events = await t.query(api.events.collect);
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({ name: 'TestConf', eventType: 'conference', year: 2026 });
});

test('create with titleFormat', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, {
		name: 'TestConf',
		year: 2026,
		titleFormat: '{title} - {event_name} {year}'
	});
	const events = await t.query(api.events.collect);
	expect(events[0].titleFormat).toBe('{title} - {event_name} {year}');
});

test('create with edition title', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, {
		name: 'MCP Night',
		editionTitle: 'Auth for Agents',
		year: 2026
	});
	const events = await t.query(api.events.collect);
	expect(events[0]).toMatchObject({
		name: 'MCP Night',
		editionTitle: 'Auth for Agents',
		year: 2026
	});
});

test('create with YouTube playlist ID', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, {
		name: 'TestConf',
		year: 2026,
		youtubePlaylistId: 'PL123'
	});
	const events = await t.query(api.events.collect);
	expect(events[0].youtubePlaylistId).toBe('PL123');
});

test('create with event type', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, {
		name: 'Customer Chats',
		eventType: 'interviews',
		year: 2026
	});
	const events = await t.query(api.events.collect);
	expect(events[0]).toMatchObject({
		name: 'Customer Chats',
		eventType: 'interviews',
		year: 2026
	});
});

test('create without titleFormat stores undefined', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const events = await t.query(api.events.collect);
	expect(events[0].titleFormat).toBeUndefined();
});

test('upsert updates event fields', async () => {
	const t = convexTest(schema, modules);
	const event = await t.mutation(api.events.upsert, { name: 'OldName', year: 2025 });
	await t.mutation(api.events.upsert, {
		id: event!._id,
		name: 'NewName',
		editionTitle: 'New Edition',
		eventType: 'interviews',
		year: 2026,
		titleFormat: '{title} | {event_name}',
		youtubePlaylistId: 'PL456'
	});
	const events = await t.query(api.events.collect);
	expect(events[0]).toMatchObject({
		name: 'NewName',
		editionTitle: 'New Edition',
		eventType: 'interviews',
		year: 2026,
		titleFormat: '{title} | {event_name}',
		youtubePlaylistId: 'PL456'
	});
});

test('find returns one event by id', async () => {
	const t = convexTest(schema, modules);
	const event = await t.mutation(api.events.upsert, { name: 'Lookup', year: 2026 });
	const foundEvent = await t.query(api.events.find, { id: event!._id });
	expect(foundEvent).toMatchObject({ name: 'Lookup', year: 2026 });
});

test('destroy deletes the event', async () => {
	const t = convexTest(schema, modules);
	const event = await t.mutation(api.events.upsert, { name: 'ToDelete', year: 2026 });
	await t.mutation(api.events.destroy, { id: event!._id });
	const events = await t.query(api.events.collect);
	expect(events).toHaveLength(0);
});

test('collect returns multiple events in order', async () => {
	const t = convexTest(schema, modules);
	await t.mutation(api.events.upsert, { name: 'First', year: 2025 });
	await t.mutation(api.events.upsert, { name: 'Second', year: 2026 });
	const events = await t.query(api.events.collect);
	expect(events).toHaveLength(2);
	expect(events[0].name).toBe('First');
	expect(events[1].name).toBe('Second');
});
