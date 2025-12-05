-- 添加端口控制字段
ALTER TABLE public.bot_activations 
ADD COLUMN IF NOT EXISTS web_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS app_enabled boolean DEFAULT true;