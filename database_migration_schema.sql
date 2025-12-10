-- =====================================================
-- TG电报机器人双向聊天 - 数据库迁移脚本（Schema部分）
-- 生成时间: 2025-12-10
-- 目标: 外部Supabase项目
-- =====================================================

-- =====================================================
-- 1. 创建枚举类型
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- =====================================================
-- 2. 创建用户角色表
-- =====================================================
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    role public.app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. 创建角色检查函数（Security Definer）
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- =====================================================
-- 4. 创建激活码表
-- =====================================================
CREATE TABLE public.activation_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    used_by_bot_id UUID,
    is_used BOOLEAN DEFAULT false,
    expire_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. 创建机器人激活表
-- =====================================================
CREATE TABLE public.bot_activations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    personal_user_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    is_authorized BOOLEAN DEFAULT false,
    trial_messages_used INTEGER DEFAULT 0,
    trial_limit INTEGER DEFAULT 20,
    expire_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    web_enabled BOOLEAN DEFAULT true,
    app_enabled BOOLEAN DEFAULT true,
    user_id UUID,
    greeting_message TEXT DEFAULT '你好！👋 有什么可以帮助你的吗？',
    activation_code TEXT NOT NULL,
    bot_token TEXT NOT NULL
);

ALTER TABLE public.bot_activations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. 创建试用记录表
-- =====================================================
CREATE TABLE public.bot_trial_records (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    messages_used INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    is_blocked BOOLEAN DEFAULT false,
    was_authorized BOOLEAN DEFAULT false,
    last_authorized_expire_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.bot_trial_records ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. 创建消息表
-- =====================================================
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_activation_id UUID NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_message_id BIGINT,
    telegram_user_name TEXT,
    content TEXT NOT NULL,
    direction TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_admin_reply BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 启用Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_activations;

-- =====================================================
-- 8. 创建禁用用户表
-- =====================================================
CREATE TABLE public.disabled_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    disabled_by UUID,
    reason TEXT,
    disabled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.disabled_users ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. 创建触发器函数
-- =====================================================

-- 更新updated_at列的函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 验证机器人过期的函数
CREATE OR REPLACE FUNCTION public.validate_bot_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.expire_at IS NOT NULL AND NEW.expire_at < now() THEN
        NEW.is_active = false;
    END IF;
    RETURN NEW;
END;
$$;

-- =====================================================
-- 10. 创建触发器
-- =====================================================

-- bot_activations的updated_at触发器
CREATE TRIGGER update_bot_activations_updated_at
BEFORE UPDATE ON public.bot_activations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- bot_trial_records的updated_at触发器
CREATE TRIGGER update_bot_trial_records_updated_at
BEFORE UPDATE ON public.bot_trial_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- bot_activations的过期验证触发器
CREATE TRIGGER validate_bot_expiry_trigger
BEFORE INSERT OR UPDATE ON public.bot_activations
FOR EACH ROW
EXECUTE FUNCTION public.validate_bot_expiry();

-- =====================================================
-- 11. 创建RLS策略 - user_roles表
-- =====================================================
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- =====================================================
-- 12. 创建RLS策略 - activation_codes表
-- =====================================================
CREATE POLICY "Admins can manage all codes"
ON public.activation_codes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read codes"
ON public.activation_codes
FOR SELECT
USING (true);

-- =====================================================
-- 13. 创建RLS策略 - bot_activations表
-- =====================================================
CREATE POLICY "Admins can manage all bots"
ON public.bot_activations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read active bots by activation code"
ON public.bot_activations
FOR SELECT
USING (true);

CREATE POLICY "Users can claim guest bots"
ON public.bot_activations
FOR UPDATE
USING (user_id IS NULL)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bots"
ON public.bot_activations
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 14. 创建RLS策略 - bot_trial_records表
-- =====================================================
CREATE POLICY "Admins can manage trial records"
ON public.bot_trial_records
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert trial records"
ON public.bot_trial_records
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can read trial records"
ON public.bot_trial_records
FOR SELECT
USING (true);

CREATE POLICY "Anyone can update trial records"
ON public.bot_trial_records
FOR UPDATE
USING (true);

-- =====================================================
-- 15. 创建RLS策略 - messages表
-- =====================================================
CREATE POLICY "Admins can manage all messages"
ON public.messages
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert messages"
ON public.messages
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can read messages for valid bots"
ON public.messages
FOR SELECT
USING (true);

-- =====================================================
-- 16. 创建RLS策略 - disabled_users表
-- =====================================================
CREATE POLICY "Admins can manage disabled users"
ON public.disabled_users
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can check their own disabled status"
ON public.disabled_users
FOR SELECT
USING (auth.uid() = user_id);

-- =====================================================
-- 完成Schema迁移
-- =====================================================
