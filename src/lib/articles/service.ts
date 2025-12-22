import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../../../db/schema";
import { articles, tasks } from "../../../db/schema";

export async function getArticleWithDetails(
    db: DrizzleD1Database<typeof schema>,
    id: string,
) {
    const rows = await db
        .select()
        .from(articles)
        .innerJoin(tasks, eq(articles.generationTaskId, tasks.id))
        .where(
            and(
                eq(articles.id, id),
                eq(articles.status, "published"),
                isNotNull(tasks.publishedAt),
            ),
        )
        .limit(1);

    return rows[0] ?? null;
}

export async function getPublishedTasks(db: DrizzleD1Database<typeof schema>) {
    return await db
        .select({ taskDate: tasks.taskDate })
        .from(tasks)
        .where(
            and(eq(tasks.type, "article_generation"), isNotNull(tasks.publishedAt)),
        )
        .orderBy(desc(tasks.taskDate));
}
