-- Migration: Add version column to tasks table for optimistic locking
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
