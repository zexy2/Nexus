-- Initialize Nexus Database
-- Enable pgvector extension for semantic search

CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes for better performance
-- These will be created automatically by Drizzle migrations
-- This file is for initial setup only

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus;
