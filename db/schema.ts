import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const generationProfiles = sqliteTable(
	'generation_profiles',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		topicPreference: text('topic_preference').notNull(),
		concurrency: integer('concurrency').notNull(),
		timeoutMs: integer('timeout_ms').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		uniqueIndex('uq_generation_profiles_name').on(table.name),
		index('idx_generation_profiles_topic_preference').on(table.topicPreference),
		check('chk_generation_profiles_concurrency_gt0', sql`${table.concurrency} > 0`),
		check('chk_generation_profiles_timeout_ms_gt0', sql`${table.timeoutMs} > 0`)
	]
);

// 每个 profile 的每日任务状态（queued/running/succeeded/failed/canceled）。
export const tasks = sqliteTable(
	'tasks',
	{
		id: text('id').primaryKey(),
		taskDate: text('task_date').notNull(), // 业务日期：YYYY-MM-DD（Asia/Shanghai）
		type: text('type', { enum: ['article_generation'] }).notNull(),
		triggerSource: text('trigger_source', { enum: ['manual', 'cron'] })
			.notNull()
			.default('manual'),
		status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'] }).notNull(),
		profileId: text('profile_id')
			.notNull()
			.references(() => generationProfiles.id),
		resultJson: text('result_json'),
		errorMessage: text('error_message'),
		errorContextJson: text('error_context_json'),
		version: integer('version').notNull().default(0), // For optimistic locking
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		startedAt: text('started_at'),
		finishedAt: text('finished_at'),
		publishedAt: text('published_at')
	},
	(table) => [
		index('idx_tasks_task_date').on(table.taskDate),
		index('idx_tasks_type').on(table.type),
		index('idx_tasks_status').on(table.status),
		index('idx_tasks_profile_id').on(table.profileId),
		index('idx_tasks_published_at').on(table.publishedAt),
		check('chk_tasks_type_enum', sql`${table.type} IN ('article_generation')`),
		check('chk_tasks_trigger_source_enum', sql`${table.triggerSource} IN ('manual', 'cron')`),
		check('chk_tasks_status_enum', sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'canceled')`),
		check('chk_tasks_result_json_valid', sql`${table.resultJson} IS NULL OR json_valid(${table.resultJson})`),
		check(
			'chk_tasks_error_context_json_valid',
			sql`${table.errorContextJson} IS NULL OR json_valid(${table.errorContextJson})`
		),
		check('chk_tasks_published_only_for_article_generation', sql`${table.type} = 'article_generation' OR ${table.publishedAt} IS NULL`)
	]
);

// 每日词表来源（NEW/REVIEW），用于生成流水线。
export const dailyWords = sqliteTable(
	'daily_words',
	{
		date: text('date').primaryKey(), // 业务日期：YYYY-MM-DD（Asia/Shanghai）
		newWordsJson: text('new_words_json').notNull(),
		reviewWordsJson: text('review_words_json').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		check('chk_daily_words_new_words_json_valid', sql`json_valid(${table.newWordsJson})`),
		check('chk_daily_words_review_words_json_valid', sql`json_valid(${table.reviewWordsJson})`)
	]
);

export const words = sqliteTable(
	'words',
	{
		word: text('word').primaryKey(),
		masteryStatus: text('mastery_status', { enum: ['unknown', 'familiar', 'mastered'] })
			.notNull()
			.default('unknown'),
		origin: text('origin', { enum: ['shanbay', 'article', 'manual'] }).notNull(),
		originRef: text('origin_ref'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('idx_words_mastery_status').on(table.masteryStatus),
		index('idx_words_origin').on(table.origin),
		check('chk_words_mastery_status_enum', sql`${table.masteryStatus} IN ('unknown', 'familiar', 'mastered')`),
		check('chk_words_origin_enum', sql`${table.origin} IN ('shanbay', 'article', 'manual')`)
	]
);

// 每词 FSRS 卡片状态，用于到期选择与扇贝同步。
export const wordLearningRecords = sqliteTable(
	'word_learning_records',
	{
		word: text('word')
			.primaryKey()
			.references(() => words.word),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		lastShanbaySyncDate: text('last_shanbay_sync_date'),
		dueAt: text('due_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		stability: real('stability').notNull().default(0),
		difficulty: real('difficulty').notNull().default(0),
		elapsedDays: integer('elapsed_days').notNull().default(0),
		scheduledDays: integer('scheduled_days').notNull().default(0),
		learningSteps: integer('learning_steps').notNull().default(0),
		reps: integer('reps').notNull().default(0),
		lapses: integer('lapses').notNull().default(0),
		state: text('state', { enum: ['new', 'learning', 'review', 'relearning'] })
			.notNull()
			.default('new'),
		lastReviewAt: text('last_review_at'),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('idx_word_learning_records_due_at').on(table.dueAt),
		check('chk_word_learning_records_state_enum', sql`${table.state} IN ('new', 'learning', 'review', 'relearning')`),
		check('chk_word_learning_records_elapsed_days_gte0', sql`${table.elapsedDays} >= 0`),
		check('chk_word_learning_records_scheduled_days_gte0', sql`${table.scheduledDays} >= 0`),
		check('chk_word_learning_records_learning_steps_gte0', sql`${table.learningSteps} >= 0`),
		check('chk_word_learning_records_reps_gte0', sql`${table.reps} >= 0`),
		check('chk_word_learning_records_lapses_gte0', sql`${table.lapses} >= 0`)
	]
);


// 生成任务的发布产物（content_json 必须为合法 JSON）。
export const articles = sqliteTable(
	'articles',
	{
		id: text('id').primaryKey(),
		generationTaskId: text('generation_task_id')
			.notNull()
			.references(() => tasks.id),

		model: text('model').notNull(),
		variant: integer('variant').notNull(),
		title: text('title').notNull(),
		contentJson: text('content_json').notNull(),
		status: text('status', { enum: ['draft', 'published'] }).notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		publishedAt: text('published_at')
	},
	(table) => [
		uniqueIndex('uq_articles_unique').on(table.generationTaskId, table.model),
		index('idx_articles_generation_task_id').on(table.generationTaskId),
		index('idx_articles_status').on(table.status),
		index('idx_articles_published').on(table.publishedAt),
		check('chk_articles_status_enum', sql`${table.status} IN ('draft', 'published')`),
		check('chk_articles_content_json_valid', sql`json_valid(${table.contentJson})`)
	]
);

// web-highlighter 选区与笔记；通过 deleted_at 软删。
export const highlights = sqliteTable(
	'highlights',
	{
		id: text('id').primaryKey(),
		articleId: text('article_id')
			.notNull()
			.references(() => articles.id),
		actor: text('actor').notNull(),
		startMetaJson: text('start_meta_json').notNull(),
		endMetaJson: text('end_meta_json').notNull(),
		text: text('text').notNull(),
		note: text('note'),
		styleJson: text('style_json'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		deletedAt: text('deleted_at')
	},
	(table) => [
		index('idx_highlights_article_id').on(table.articleId),
		index('idx_highlights_actor').on(table.actor),
		index('idx_highlights_article_actor').on(table.articleId, table.actor),
		check('chk_highlights_start_meta_json_valid', sql`json_valid(${table.startMetaJson})`),
		check('chk_highlights_end_meta_json_valid', sql`json_valid(${table.endMetaJson})`),
		check('chk_highlights_style_json_valid', sql`${table.styleJson} IS NULL OR json_valid(${table.styleJson})`)
	]
);
