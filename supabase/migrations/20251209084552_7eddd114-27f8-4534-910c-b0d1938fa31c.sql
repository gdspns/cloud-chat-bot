-- Create table to store disabled users
CREATE TABLE public.disabled_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    disabled_at timestamp with time zone NOT NULL DEFAULT now(),
    disabled_by uuid,
    reason text
);

-- Enable RLS
ALTER TABLE public.disabled_users ENABLE ROW LEVEL SECURITY;

-- Admins can manage disabled users
CREATE POLICY "Admins can manage disabled users"
ON public.disabled_users
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can check if they are disabled
CREATE POLICY "Users can check their own disabled status"
ON public.disabled_users
FOR SELECT
USING (auth.uid() = user_id);