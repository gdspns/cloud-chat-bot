-- 创建激活码表来持久化存储管理员生成的激活码
CREATE TABLE IF NOT EXISTS public.activation_codes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE,
    expire_at timestamp with time zone,
    is_used boolean DEFAULT false,
    used_by_bot_id uuid REFERENCES public.bot_activations(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
CREATE POLICY "Admins can manage all codes" ON public.activation_codes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read codes" ON public.activation_codes FOR SELECT USING (true);

-- 创建试用记录表，用于跟踪机器人令牌的试用使用情况（即使删除重新添加也保留记录）
CREATE TABLE IF NOT EXISTS public.bot_trial_records (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_token text NOT NULL UNIQUE,
    messages_used integer DEFAULT 0,
    is_blocked boolean DEFAULT false,
    was_authorized boolean DEFAULT false,
    last_authorized_expire_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.bot_trial_records ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
CREATE POLICY "Admins can manage trial records" ON public.bot_trial_records FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read trial records" ON public.bot_trial_records FOR SELECT USING (true);
CREATE POLICY "Anyone can insert trial records" ON public.bot_trial_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update trial records" ON public.bot_trial_records FOR UPDATE USING (true);