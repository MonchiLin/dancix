import type { APIRoute } from 'astro';
import { eq, inArray } from 'drizzle-orm';
import { TaskQueue } from '../../../../../lib/tasks/TaskQueue';
import { articles, highlights, tasks } from '../../../../../../db/schema';
import { requireAdmin } from '../../../../../lib/admin';
import { getDb } from '../../../../../lib/db';
import { badRequest, json, notFound } from '../../../../../lib/http';

export const POST: APIRoute = async ({ request, locals, params }) => {
	const denied = requireAdmin(request, locals);
	if (denied) return denied;

	try {
		const taskId = params.id;
		if (!taskId) return badRequest('Missing task id');

		const db = getDb(locals);
		const taskRows = await db
			.select({ id: tasks.id, taskDate: tasks.taskDate })
			.from(tasks)
			.where(eq(tasks.id, taskId))
			.limit(1);
		const targetTask = taskRows[0];
		if (!targetTask) return notFound();

		const articleRows = await db
			.select({ id: articles.id })
			.from(articles)
			.where(eq(articles.generationTaskId, taskId));
		const articleIds = articleRows.map((r) => r.id);

		if (articleIds.length > 0) {
			const CHUNK = 50;
			for (let i = 0; i < articleIds.length; i += CHUNK) {
				const chunk = articleIds.slice(i, i + CHUNK);
				await db.delete(highlights).where(inArray(highlights.articleId, chunk));
			}
			await db.delete(articles).where(eq(articles.generationTaskId, taskId));
		}

		await db.delete(tasks).where(eq(tasks.id, taskId));

		// 如果删除了一个任务（可能是 queued 或 running），尝试从队列中启动下一个
		// 这样队列不会因为前一个任务被删而卡死
		const taskDate = targetTask.taskDate;
		const queue = new TaskQueue(db);
		locals.runtime.ctx.waitUntil(queue.processQueue(taskDate, locals.runtime.env));

		return json({ ok: true });
	} catch (err) {
		console.error('POST /api/admin/tasks/[id]/delete failed', err);
		const message = err instanceof Error ? err.message : String(err);
		return json({ ok: false, error: 'internal_error', message }, { status: 500 });
	}
};
