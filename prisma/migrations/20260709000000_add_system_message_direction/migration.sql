-- Add SYSTEM value to MessageDirection enum
ALTER TYPE "MessageDirection" ADD VALUE IF NOT EXISTS 'SYSTEM';
