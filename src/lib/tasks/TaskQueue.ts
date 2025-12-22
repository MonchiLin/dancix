import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../../db/schema';
import { articles, dailyWords, generationProfiles, tasks } from '../../../db/schema';
import { generateDailyNewsWithWordSelection, type CandidateWord } from '../llm/openaiCompatible';

type Db = DrizzleD1Database<typeof schema>;

type EnvWithModel = {
    LLM_API_KEY: string;
    LLM_BASE_URL: string;
    LLM_MODEL_DEFAULT: string;
    [key: string]: unknown;
};

function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
async function getUsedWordsToday(db: Db, taskDate: string): Promise<Set<string>> {
    const todaysTasks = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.taskDate, taskDate));

    if (todaysTasks.length === 0) return new Set();

    const taskIds = todaysTasks.map((t) => t.id);
    const usedWords = new Set<string>();
    const taskArticles = await db
        .select({ contentJson: articles.contentJson })
        .from(articles)
        .where(inArray(articles.generationTaskId, taskIds));

    for (const article of taskArticles) {
        try {
            const content = JSON.parse(article.contentJson);
            const selected = content?.input_words?.selected;
            if (Array.isArray(selected)) {
                for (const word of selected) {
                    if (typeof word === 'string') usedWords.add(word);
                }
            }
        } catch {
            // ignore
        }
    }

    return usedWords;
}

/**
 * Build candidate words for article generation.
 * New words are prioritized over review words.
 */
function buildCandidateWords(
    newWords: string[],
    reviewWords: string[],
    usedWords: Set<string>
): CandidateWord[] {
    const allWords = uniqueStrings([...newWords, ...reviewWords]).filter((w) => !usedWords.has(w));
    if (allWords.length === 0) return [];

    const newWordSet = new Set(newWords);
    const candidates: CandidateWord[] = [];

    for (const word of allWords) {
        const type = newWordSet.has(word) ? 'new' : 'review';
        candidates.push({ word, type });
    }

    // Sort: new words first, then review words
    candidates.sort((a, b) => {
        if (a.type === 'new' && b.type !== 'new') return -1;
        if (a.type !== 'new' && b.type === 'new') return 1;
        return 0;
    });

    return candidates;
}


/**
 * Reliable Task Queue with optimistic locking
 */
export class TaskQueue {
    constructor(private db: Db) { }

    /**
     * Enqueue a new task for each profile
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual') {
        const profiles = await this.db.select().from(generationProfiles);
        if (profiles.length === 0) {
            throw new Error('No generation profile found');
        }

        const dailyRow = await this.db
            .select()
            .from(dailyWords)
            .where(eq(dailyWords.date, taskDate))
            .limit(1);
        if (dailyRow.length === 0) {
            throw new Error('No daily words found');
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];
        for (const profile of profiles) {
            const taskId = crypto.randomUUID();
            await this.db.insert(tasks).values({
                id: taskId,
                taskDate,
                type: 'article_generation',
                triggerSource,
                status: 'queued',
                profileId: profile.id,
                version: 0
            });
            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * Atomically claim a queued task using optimistic locking
     * Returns the claimed task or null if none available
     */
    async claimTask(taskDate: string): Promise<typeof tasks.$inferSelect | null> {
        // First, find a candidate task
        const candidates = await this.db
            .select()
            .from(tasks)
            .where(and(
                eq(tasks.taskDate, taskDate),
                eq(tasks.status, 'queued')
            ))
            .orderBy(tasks.createdAt)
            .limit(1);

        if (candidates.length === 0) return null;

        const candidate = candidates[0];
        const now = new Date().toISOString();

        // Attempt to claim with optimistic lock (check version hasn't changed)
        const result = await this.db
            .update(tasks)
            .set({
                status: 'running',
                startedAt: now,
                version: sql`${tasks.version} + 1`
            })
            .where(and(
                eq(tasks.id, candidate.id),
                eq(tasks.status, 'queued'),
                eq(tasks.version, candidate.version)
            ));

        // Check if we actually updated (rowsAffected not directly available in drizzle-d1)
        // Re-query to verify
        const updated = await this.db
            .select()
            .from(tasks)
            .where(and(
                eq(tasks.id, candidate.id),
                eq(tasks.status, 'running')
            ))
            .limit(1);

        if (updated.length === 0) {
            // Someone else claimed it, try again
            return this.claimTask(taskDate);
        }

        return updated[0];
    }

    /**
     * Mark task as succeeded
     */
    async complete(taskId: string, resultJson: string) {
        const now = new Date().toISOString();
        await this.db
            .update(tasks)
            .set({
                status: 'succeeded',
                resultJson,
                finishedAt: now,
                publishedAt: now
            })
            .where(eq(tasks.id, taskId));
    }

    /**
     * Mark task as failed
     */
    async fail(taskId: string, errorMessage: string, errorContext: Record<string, unknown>) {
        await this.db
            .update(tasks)
            .set({
                status: 'failed',
                errorMessage,
                errorContextJson: JSON.stringify(errorContext),
                finishedAt: new Date().toISOString()
            })
            .where(eq(tasks.id, taskId));
    }

    /**
     * Process the queue - claim and execute tasks one by one
     */
    async processQueue(taskDate: string, env: EnvWithModel) {
        console.log(`[TaskQueue] Starting queue processing for ${taskDate}`);

        while (true) {
            // Claim next task
            const task = await this.claimTask(taskDate);
            if (!task) {
                console.log(`[TaskQueue] No more tasks to process for ${taskDate}`);
                break;
            }

            console.log(`[TaskQueue] Processing task ${task.id}`);

            try {
                await this.executeTask(env, task);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }

    /**
     * Execute a single task
     */
    private async executeTask(env: EnvWithModel, task: typeof tasks.$inferSelect) {
        const profile = await this.db
            .select()
            .from(generationProfiles)
            .where(eq(generationProfiles.id, task.profileId))
            .limit(1)
            .then(rows => rows[0]);

        if (!profile) {
            throw new Error(`Profile not found: ${task.profileId}`);
        }

        const dailyRow = await this.db
            .select()
            .from(dailyWords)
            .where(eq(dailyWords.date, task.taskDate))
            .limit(1)
            .then(rows => rows[0]);

        if (!dailyRow) {
            throw new Error('No daily words found');
        }

        const dailyNew = dailyRow.newWordsJson ? JSON.parse(dailyRow.newWordsJson) : [];
        const dailyReview = dailyRow.reviewWordsJson ? JSON.parse(dailyRow.reviewWordsJson) : [];
        const newWords = uniqueStrings(Array.isArray(dailyNew) ? dailyNew : []);
        const reviewWords = uniqueStrings(Array.isArray(dailyReview) ? dailyReview : []);

        if (newWords.length + reviewWords.length === 0) {
            throw new Error('Daily words record is empty');
        }

        const usedWords = await getUsedWordsToday(this.db, task.taskDate);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) {
            throw new Error('All words have been used today');
        }

        const model = env.LLM_MODEL_DEFAULT;
        if (!model) {
            throw new Error('LLM_MODEL_DEFAULT environment variable is required');
        }

        console.log(`[Task ${task.id}] Starting LLM generation with model: ${model}`);

        const output = await generateDailyNewsWithWordSelection({
            env,
            model,
            currentDate: task.taskDate,
            topicPreference: profile.topicPreference,
            candidateWords: candidates
        });

        const articleId = crypto.randomUUID();
        const contentData = {
            schema: 'daily_news_v2',
            task_date: task.taskDate,
            topic_preference: profile.topicPreference,
            input_words: {
                new: newWords,
                review: reviewWords,
                candidates: candidates.map((c) => c.word),
                selected: output.selectedWords
            },
            word_usage_check: output.output.word_usage_check,
            result: output.output
        };

        const finishedAt = new Date().toISOString();
        const resultData = {
            new_count: newWords.length,
            review_count: reviewWords.length,
            candidate_count: candidates.length,
            selected_words: output.selectedWords,
            generated: { model, article_id: articleId },
            usage: output.usage ?? null
        };

        // Insert article and update task
        await this.db.batch([
            this.db.insert(articles).values({
                id: articleId,
                generationTaskId: task.id,
                model,
                variant: 1,
                title: output.output.title,
                contentJson: JSON.stringify(contentData),
                status: 'published',
                publishedAt: finishedAt
            }),
            this.db
                .update(tasks)
                .set({
                    status: 'succeeded',
                    resultJson: JSON.stringify(resultData),
                    finishedAt,
                    publishedAt: finishedAt
                })
                .where(eq(tasks.id, task.id))
        ]);

        console.log(`[Task ${task.id}] Completed successfully`);
    }
}
