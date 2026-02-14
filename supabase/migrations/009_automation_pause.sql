-- Add automation_paused toggle to conversations
-- This allows staff to pause automated replies when taking over a thread
ALTER TABLE conversations 
ADD COLUMN automation_paused BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN conversations.automation_paused IS 'Whether automated AI replies are paused for this thread (e.g. human takeover)';
