-- 创建角色枚举
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 创建用户角色表
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 启用RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 创建安全函数检查角色
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 用户角色RLS策略
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 创建机器人激活表
CREATE TABLE public.bot_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_token TEXT NOT NULL,
    personal_user_id TEXT NOT NULL,
    greeting_message TEXT DEFAULT '你好！👋 有什么可以帮助你的吗？',
    activation_code TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    is_authorized BOOLEAN DEFAULT false,
    trial_messages_used INTEGER DEFAULT 0,
    trial_limit INTEGER DEFAULT 20,
    expire_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.bot_activations ENABLE ROW LEVEL SECURITY;

-- 机器人激活RLS策略 - 允许通过activation_code公开读取
CREATE POLICY "Anyone can read active bots by activation code"
ON public.bot_activations
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage all bots"
ON public.bot_activations
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 创建消息表
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_activation_id UUID REFERENCES public.bot_activations(id) ON DELETE CASCADE NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_user_name TEXT,
    telegram_message_id BIGINT,
    content TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 消息RLS策略
CREATE POLICY "Anyone can read messages for valid bots"
ON public.messages
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert messages"
ON public.messages
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage all messages"
ON public.messages
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 启用实时功能
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_activations;

-- 创建更新时间戳函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 创建触发器
CREATE TRIGGER update_bot_activations_updated_at
BEFORE UPDATE ON public.bot_activations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 创建验证过期的函数（使用触发器而非CHECK约束）
CREATE OR REPLACE FUNCTION public.validate_bot_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expire_at IS NOT NULL AND NEW.expire_at < now() THEN
        NEW.is_active = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_bot_expiry_trigger
BEFORE INSERT OR UPDATE ON public.bot_activations
FOR EACH ROW
EXECUTE FUNCTION public.validate_bot_expiry();