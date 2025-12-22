import type { APIRoute } from 'astro';
import { z } from 'zod';
import { generationProfiles } from '../../../../../db/schema';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json } from '../../../../lib/http';

const bodySchema = z.object({
    name: z.string().min(1),
    topic_preference: z.string().min(1),
    concurrency: z.number().int().positive(),
    timeout_ms: z.number().int().positive()
});

// GET /api/admin/profiles - List all profiles
export const GET: APIRoute = async ({ request, locals }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const db = getDb(locals);
        const rows = await db.select().from(generationProfiles);

        const profiles = rows.map(row => ({
            id: row.id,
            name: row.name,
            topic_preference: row.topicPreference,
            concurrency: row.concurrency,
            timeout_ms: row.timeoutMs,
            created_at: row.createdAt,
            updated_at: row.updatedAt
        }));

        return json({ profiles });
    } catch (err) {
        console.error('GET /api/admin/profiles failed', err);
        const message = err instanceof Error ? err.message : String(err);
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};

// POST /api/admin/profiles - Create a new profile
export const POST: APIRoute = async ({ request, locals }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return badRequest('Invalid body', parsed.error.flatten());

        const db = getDb(locals);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.insert(generationProfiles).values({
            id,
            name: parsed.data.name,
            topicPreference: parsed.data.topic_preference,
            concurrency: parsed.data.concurrency,
            timeoutMs: parsed.data.timeout_ms,
            createdAt: now,
            updatedAt: now
        });

        return json({ ok: true, id }, { status: 201 });
    } catch (err) {
        console.error('POST /api/admin/profiles failed', err);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('UNIQUE constraint failed')) {
            return badRequest('Profile name already exists');
        }
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};
