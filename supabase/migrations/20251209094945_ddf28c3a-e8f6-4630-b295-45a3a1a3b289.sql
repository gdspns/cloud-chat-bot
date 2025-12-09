-- 删除旧的策略
DROP POLICY IF EXISTS "Users can claim guest bots" ON public.bot_activations;
DROP POLICY IF EXISTS "Users can update own bots" ON public.bot_activations;

-- 创建允许用户认领游客机器人的 PERMISSIVE 策略
CREATE POLICY "Users can claim guest bots"
ON public.bot_activations
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (user_id IS NULL)
WITH CHECK (auth.uid() = user_id);

-- 创建允许用户更新自己机器人的 PERMISSIVE 策略
CREATE POLICY "Users can update own bots"
ON public.bot_activations
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);