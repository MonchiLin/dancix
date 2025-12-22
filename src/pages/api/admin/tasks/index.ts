import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { tasks, generationProfiles } from '../../../../../db/schema';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json } from '../../../../lib/http';

// GET /api/admin/tasks?task_date=YYYY-MM-DD - List tasks for a date
export const GET: APIRoute = async ({ request, locals, url }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const taskDate = url.searchParams.get('task_date');
        if (!taskDate) return badRequest('Missing task_date parameter');

        const db = getDb(locals);

        // Get all tasks for this date with profile names
        const taskRows = await db
            .select({
                id: tasks.id,
                task_date: tasks.taskDate,
                type: tasks.type,
                trigger_source: tasks.triggerSource,
                status: tasks.status,
                profile_id: tasks.profileId,
                result_json: tasks.resultJson,
                error_message: tasks.errorMessage,
                error_context_json: tasks.errorContextJson,
                created_at: tasks.createdAt,
                started_at: tasks.startedAt,
                finished_at: tasks.finishedAt,
                published_at: tasks.publishedAt,
                profileName: generationProfiles.name
            })
            .from(tasks)
            .leftJoin(generationProfiles, eq(tasks.profileId, generationProfiles.id))
            .where(eq(tasks.taskDate, taskDate));

        return json({ tasks: taskRows });
    } catch (err) {
        console.error('GET /api/admin/tasks failed', err);
        const message = err instanceof Error ? err.message : String(err);
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};
