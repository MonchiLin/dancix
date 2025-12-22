import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { generationProfiles } from '../../../../../db/schema';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json, notFound } from '../../../../lib/http';

const patchSchema = z.object({
    name: z.string().min(1).optional(),
    topic_preference: z.string().min(1).optional(),
    concurrency: z.number().int().positive().optional(),
    timeout_ms: z.number().int().positive().optional()
});

// GET /api/admin/profiles/[id] - Get a single profile
export const GET: APIRoute = async ({ request, locals, params }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const profileId = params.id;
        if (!profileId) return badRequest('Missing profile id');

        const db = getDb(locals);
        const rows = await db.select().from(generationProfiles).where(eq(generationProfiles.id, profileId)).limit(1);
        const row = rows[0];
        if (!row) return notFound();

        return json({
            id: row.id,
            name: row.name,
            topic_preference: row.topicPreference,
            concurrency: row.concurrency,
            timeout_ms: row.timeoutMs,
            created_at: row.createdAt,
            updated_at: row.updatedAt
        });
    } catch (err) {
        console.error('GET /api/admin/profiles/[id] failed', err);
        const message = err instanceof Error ? err.message : String(err);
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};

// PATCH /api/admin/profiles/[id] - Update a profile
export const PATCH: APIRoute = async ({ request, locals, params }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const profileId = params.id;
        if (!profileId) return badRequest('Missing profile id');

        const parsed = patchSchema.safeParse(await request.json());
        if (!parsed.success) return badRequest('Invalid body', parsed.error.flatten());

        const db = getDb(locals);

        // Check exists
        const existing = await db.select({ id: generationProfiles.id }).from(generationProfiles).where(eq(generationProfiles.id, profileId)).limit(1);
        if (existing.length === 0) return notFound();

        const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (parsed.data.name !== undefined) patch.name = parsed.data.name;
        if (parsed.data.topic_preference !== undefined) patch.topicPreference = parsed.data.topic_preference;
        if (parsed.data.concurrency !== undefined) patch.concurrency = parsed.data.concurrency;
        if (parsed.data.timeout_ms !== undefined) patch.timeoutMs = parsed.data.timeout_ms;

        await db.update(generationProfiles).set(patch).where(eq(generationProfiles.id, profileId));

        return json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/admin/profiles/[id] failed', err);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('UNIQUE constraint failed')) {
            return badRequest('Profile name already exists');
        }
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};

// DELETE /api/admin/profiles/[id] - Delete a profile
export const DELETE: APIRoute = async ({ request, locals, params }) => {
    const denied = requireAdmin(request, locals);
    if (denied) return denied;

    try {
        const profileId = params.id;
        if (!profileId) return badRequest('Missing profile id');

        const db = getDb(locals);

        // Check exists
        const existing = await db.select({ id: generationProfiles.id }).from(generationProfiles).where(eq(generationProfiles.id, profileId)).limit(1);
        if (existing.length === 0) return notFound();

        await db.delete(generationProfiles).where(eq(generationProfiles.id, profileId));

        return json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/admin/profiles/[id] failed', err);
        const message = err instanceof Error ? err.message : String(err);
        // Foreign key constraint would prevent deletion if tasks reference this profile
        if (message.includes('FOREIGN KEY constraint failed')) {
            return badRequest('Cannot delete profile: it is referenced by existing tasks');
        }
        return json({ ok: false, error: 'internal_error', message }, { status: 500 });
    }
};
