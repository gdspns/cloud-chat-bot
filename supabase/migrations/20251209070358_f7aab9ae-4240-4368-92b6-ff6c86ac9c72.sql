-- Add user_id column to bot_activations table
ALTER TABLE public.bot_activations 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add is_admin_reply column to messages table (if not exists)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_admin_reply boolean DEFAULT false;