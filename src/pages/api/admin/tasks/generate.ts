import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json } from '../../../../lib/http';

import { TaskQueue } from '../../../../lib/tasks/TaskQueue';

const bodySchema = z.object({
	task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = requireAdmin(request, locals);
	if (denied) return denied;

	try {
		const parsed = bodySchema.safeParse(await request.json());
		if (!parsed.success) return badRequest('Invalid body', parsed.error.flatten());

		const db = getDb(locals);
		const taskDate = parsed.data.task_date;

		const queue = new TaskQueue(db);
		const tasks = await queue.enqueue(taskDate, 'manual');

		// Queue processing is handled by Cron Worker (every 5 minutes)
		// to avoid Pages Functions IoContext timeout on long-running LLM calls

		return json({ ok: true, task_date: taskDate, tasks }, { status: 201 });
	} catch (err) {
		console.error('POST /api/admin/tasks/generate failed', err);
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('No daily words found') || message.includes('No generation profile found')) {
			return badRequest(message);
		}
		return json({ ok: false, error: 'internal_error', message }, { status: 500 });
	}
};
