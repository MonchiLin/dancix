import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json } from '../../../../lib/http';

import { fetchAndStoreDailyWords } from '../../../../lib/words/dailyWords';

const bodySchema = z.object({
	task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = requireAdmin(request, locals);
	if (denied) return denied;

	try {
		const raw = await request.text();
		if (!raw.trim()) return badRequest('请求体为空');
		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch (err) {
			return badRequest('请求体不是合法 JSON', { message: err instanceof Error ? err.message : String(err) });
		}

		const parsed = bodySchema.safeParse(body);
		if (!parsed.success) return badRequest('Invalid request body', parsed.error.flatten());

		const db = getDb(locals);
		const taskDate = parsed.data.task_date;
		const result = await fetchAndStoreDailyWords(db, {
			taskDate,
			shanbayCookie: locals.runtime.env.SHANBAY_COOKIE
		});

		return json(
			{
				ok: true,
				task_date: result.taskDate,
				new_count: result.newCount,
				review_count: result.reviewCount
			},
			{ status: 201 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ ok: false, error: 'internal_error', message }, { status: 500 });
	}
};
