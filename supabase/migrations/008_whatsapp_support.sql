-- Add whatsapp to message_source enum
ALTER TYPE message_source ADD VALUE 'whatsapp';

-- Add send_whatsapp to automation_action enum
ALTER TYPE automation_action ADD VALUE 'send_whatsapp';
