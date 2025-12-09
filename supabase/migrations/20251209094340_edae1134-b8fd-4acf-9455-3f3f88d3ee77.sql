-- 添加策略允许用户认领游客机器人（将 user_id 从 null 更新为自己的 id）
CREATE POLICY "Users can claim guest bots"
ON public.bot_activations
FOR UPDATE
USING (user_id IS NULL)
WITH CHECK (auth.uid() = user_id);

-- 添加策略允许用户更新自己的机器人
CREATE POLICY "Users can update own bots"
ON public.bot_activations
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);