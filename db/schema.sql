PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS highlights;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS word_learning_records;
DROP TABLE IF EXISTS words;
DROP TABLE IF EXISTS daily_words;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS generation_profiles;

PRAGMA foreign_keys=ON;

CREATE TABLE generation_profiles (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	topic_preference text NOT NULL,
	model_setting_json text NOT NULL,
	concurrency integer NOT NULL,
	timeout_ms integer NOT NULL,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT chk_generation_profiles_model_setting_json_valid CHECK(json_valid(model_setting_json)),
	CONSTRAINT chk_generation_profiles_concurrency_gt0 CHECK(concurrency > 0),
	CONSTRAINT chk_generation_profiles_timeout_ms_gt0 CHECK(timeout_ms > 0)
);
CREATE UNIQUE INDEX uq_generation_profiles_name ON generation_profiles (name);
CREATE INDEX idx_generation_profiles_topic_preference ON generation_profiles (topic_preference);

CREATE TABLE tasks (
	id text PRIMARY KEY NOT NULL,
	task_date text NOT NULL,
	type text NOT NULL,
	trigger_source text DEFAULT 'manual' NOT NULL,
	status text NOT NULL,
	profile_id text NOT NULL,
	result_json text,
	error_message text,
	error_context_json text,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	started_at text,
	finished_at text,
	published_at text,
	FOREIGN KEY (profile_id) REFERENCES generation_profiles(id) ON UPDATE no action ON DELETE no action,
	CONSTRAINT chk_tasks_type_enum CHECK(type IN ('article_generation')),
	CONSTRAINT "chk_tasks_trigger_source_enum" CHECK ("tasks"."trigger_source" IN ('manual', 'cron')),
	CONSTRAINT chk_tasks_status_enum CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
	CONSTRAINT chk_tasks_result_json_valid CHECK(result_json IS NULL OR json_valid(result_json)),
	CONSTRAINT chk_tasks_error_context_json_valid CHECK(error_context_json IS NULL OR json_valid(error_context_json)),
	CONSTRAINT chk_tasks_published_only_for_article_generation CHECK(type = 'article_generation' OR published_at IS NULL)
);
CREATE INDEX idx_tasks_task_date ON tasks (task_date);
CREATE INDEX idx_tasks_type ON tasks (type);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_profile_id ON tasks (profile_id);
CREATE INDEX idx_tasks_published_at ON tasks (published_at);

CREATE TABLE daily_words (
	date text PRIMARY KEY NOT NULL,
	new_words_json text NOT NULL,
	review_words_json text NOT NULL,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT chk_daily_words_new_words_json_valid CHECK(json_valid(new_words_json)),
	CONSTRAINT chk_daily_words_review_words_json_valid CHECK(json_valid(review_words_json))
);

CREATE TABLE words (
	word text PRIMARY KEY NOT NULL,
	mastery_status text DEFAULT 'unknown' NOT NULL,
	origin text NOT NULL,
	origin_ref text,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT chk_words_mastery_status_enum CHECK(mastery_status IN ('unknown', 'familiar', 'mastered')),
	CONSTRAINT chk_words_origin_enum CHECK(origin IN ('shanbay', 'article', 'manual'))
);
CREATE INDEX idx_words_mastery_status ON words (mastery_status);
CREATE INDEX idx_words_origin ON words (origin);

CREATE TABLE word_learning_records (
	word text PRIMARY KEY NOT NULL,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	last_shanbay_sync_date text,
	due_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	stability real DEFAULT 0 NOT NULL,
	difficulty real DEFAULT 0 NOT NULL,
	elapsed_days integer DEFAULT 0 NOT NULL,
	scheduled_days integer DEFAULT 0 NOT NULL,
	learning_steps integer DEFAULT 0 NOT NULL,
	reps integer DEFAULT 0 NOT NULL,
	lapses integer DEFAULT 0 NOT NULL,
	state text DEFAULT 'new' NOT NULL,
	last_review_at text,
	updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (word) REFERENCES words(word) ON UPDATE no action ON DELETE no action,
	CONSTRAINT chk_word_learning_records_state_enum CHECK(state IN ('new', 'learning', 'review', 'relearning')),
	CONSTRAINT chk_word_learning_records_elapsed_days_gte0 CHECK(elapsed_days >= 0),
	CONSTRAINT chk_word_learning_records_scheduled_days_gte0 CHECK(scheduled_days >= 0),
	CONSTRAINT chk_word_learning_records_learning_steps_gte0 CHECK(learning_steps >= 0),
	CONSTRAINT chk_word_learning_records_reps_gte0 CHECK(reps >= 0),
	CONSTRAINT chk_word_learning_records_lapses_gte0 CHECK(lapses >= 0)
);
CREATE INDEX idx_word_learning_records_due_at ON word_learning_records (due_at);



CREATE TABLE articles (
	id text PRIMARY KEY NOT NULL,
	generation_task_id text NOT NULL,

	model text NOT NULL,
	variant integer NOT NULL,
	title text NOT NULL,
	content_json text NOT NULL,
	status text NOT NULL,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	published_at text,
	FOREIGN KEY (generation_task_id) REFERENCES tasks(id) ON UPDATE no action ON DELETE no action,
	CONSTRAINT chk_articles_status_enum CHECK(status IN ('draft', 'published')),
	CONSTRAINT chk_articles_variant_gte1 CHECK(variant >= 1),
	CONSTRAINT chk_articles_content_json_valid CHECK(json_valid(content_json))
);
CREATE UNIQUE INDEX uq_articles_unique ON articles (generation_task_id, model, variant);
CREATE INDEX idx_articles_generation_task_id ON articles (generation_task_id);
CREATE INDEX idx_articles_status ON articles (status);
CREATE INDEX idx_articles_published ON articles (published_at);

CREATE TABLE highlights (
	id text PRIMARY KEY NOT NULL,
	article_id text NOT NULL,
	actor text NOT NULL,
	start_meta_json text NOT NULL,
	end_meta_json text NOT NULL,
	text text NOT NULL,
	note text,
	style_json text,
	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	deleted_at text,
	FOREIGN KEY (article_id) REFERENCES articles(id) ON UPDATE no action ON DELETE no action,
	CONSTRAINT chk_highlights_start_meta_json_valid CHECK(json_valid(start_meta_json)),
	CONSTRAINT chk_highlights_end_meta_json_valid CHECK(json_valid(end_meta_json)),
	CONSTRAINT chk_highlights_style_json_valid CHECK(style_json IS NULL OR json_valid(style_json))
);

CREATE INDEX idx_highlights_article_id ON highlights (article_id);
CREATE INDEX idx_highlights_actor ON highlights (actor);
CREATE INDEX idx_highlights_article_actor ON highlights (article_id, actor);
