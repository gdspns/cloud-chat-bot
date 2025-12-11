import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin-only actions that require role verification
const ADMIN_ACTIONS = [
  'create',
  'admin-authorize',
  'admin-send-message',
  'list-codes',
  'list-all-messages',
  'generate-codes',
  'toggle-user-disabled',
  'list-disabled-users',
  'list-users',
  'list',
  'admin-delete', // 管理员删除
  'toggle',
  'extend',
  'toggle-port',
  'cleanup-expired-trials',
];

// Helper function to verify admin role
async function verifyAdminRole(req: Request, supabase: any): Promise<{ isAdmin: boolean; userId: string | null; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { isAdmin: false, userId: null, error: '未提供认证信息' };
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Verify the JWT and get user
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return { isAdmin: false, userId: null, error: '无效的认证令牌' };
  }

  // Check if user has admin role using the has_role function
  const { data: hasRole, error: roleError } = await supabase.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin'
  });

  if (roleError) {
    console.error('Role check error:', roleError);
    return { isAdmin: false, userId: user.id, error: '角色验证失败' };
  }

  return { isAdmin: hasRole === true, userId: user.id };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();
    console.log('Manage bot action:', action, params);

    // Check if this action requires admin role
    if (ADMIN_ACTIONS.includes(action)) {
      const { isAdmin, userId, error } = await verifyAdminRole(req, supabase);
      
      if (!isAdmin) {
        console.log('Admin verification failed:', { userId, error });
        return new Response(JSON.stringify({ 
          ok: false, 
          error: error || '您没有管理员权限执行此操作' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('Admin verified:', userId);
    }

    switch (action) {
      // 管理员创建授权
      case 'create': {
        const { botToken, personalUserId, greetingMessage, expireAt } = params;
        
        // Generate unique activation code
        const activationCode = crypto.randomUUID().substring(0, 8);
        
        const { data, error } = await supabase
          .from('bot_activations')
          .insert({
            bot_token: botToken,
            personal_user_id: personalUserId,
            greeting_message: greetingMessage || '你好！👋 有什么可以帮助你的吗？',
            activation_code: activationCode,
            expire_at: expireAt,
            is_active: false,
            is_authorized: false,
          })
          .select()
          .single();

        if (error) {
          console.error('Create error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 用户添加机器人（前端使用 add，兼容 create-trial）
      case 'add':
      case 'create-trial': {
        const { botToken, personalUserId, greetingMessage, userId } = params;
        
        // 检查试用记录 - 该令牌的历史使用情况
        const { data: trialRecord } = await supabase
          .from('bot_trial_records')
          .select('*')
          .eq('bot_token', botToken)
          .maybeSingle();

        // 检查是否已存在于bot_activations
        const { data: existing } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('bot_token', botToken)
          .maybeSingle();

        if (existing) {
          // 已存在则返回现有数据
          return new Response(JSON.stringify({ ok: true, data: existing, existed: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // 如果之前有试用记录且已授权过的机器人被删除重新添加，恢复授权状态
        if (trialRecord && trialRecord.was_authorized) {
          const activationCode = 'restored-' + crypto.randomUUID().substring(0, 8);
          
          const { data, error } = await supabase
            .from('bot_activations')
            .insert({
              bot_token: botToken,
              personal_user_id: personalUserId,
              greeting_message: greetingMessage || '你好！👋 有什么可以帮助你的吗？',
              activation_code: activationCode,
              is_active: true,
              is_authorized: true,
              expire_at: trialRecord.last_authorized_expire_at,
              trial_limit: 20,
              trial_messages_used: 0,
              user_id: userId || null,
            })
            .select()
            .single();

          if (error) {
            console.error('Restore bot error:', error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // 设置webhook - 使用bot token作为路径
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${botToken}`;
          await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          });

          return new Response(JSON.stringify({ ok: true, data, restored: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // 检查是否被封禁（试用完成但未激活）
        if (trialRecord && trialRecord.is_blocked) {
          // 创建一个试用完成的记录
          const activationCode = 'trial-' + crypto.randomUUID().substring(0, 8);
          
          const { data, error } = await supabase
            .from('bot_activations')
            .insert({
              bot_token: botToken,
              personal_user_id: personalUserId,
              greeting_message: greetingMessage || '你好！👋 有什么可以帮助你的吗？',
              activation_code: activationCode,
              is_active: false,
              is_authorized: false,
              trial_limit: 20,
              trial_messages_used: 20, // 直接设置为试用上限
              user_id: userId || null,
            })
            .select()
            .single();

          if (error) {
            console.error('Create blocked bot error:', error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ ok: true, data, blocked: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // 创建新的试用机器人
        const activationCode = 'trial-' + crypto.randomUUID().substring(0, 8);
        const trialMessagesUsed = trialRecord ? trialRecord.messages_used : 0;
        
        const { data, error } = await supabase
          .from('bot_activations')
          .insert({
            bot_token: botToken,
            personal_user_id: personalUserId,
            greeting_message: greetingMessage || '你好！👋 有什么可以帮助你的吗？',
            activation_code: activationCode,
            is_active: true,
            is_authorized: false,
            trial_limit: 20,
            trial_messages_used: trialMessagesUsed,
            user_id: userId || null,
          })
          .select()
          .single();

        if (error) {
          console.error('Create trial bot error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 创建或更新试用记录
        if (!trialRecord) {
          await supabase
            .from('bot_trial_records')
            .insert({
              bot_token: botToken,
              messages_used: 0,
              is_blocked: false,
            });
        }

        // 设置webhook - 使用bot token作为路径
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${botToken}`;
        await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        });

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 批量生成激活码
      case 'generate-codes': {
        const { count, expireAt } = params;
        
        const codes: string[] = [];
        const insertData = [];
        
        for (let i = 0; i < count; i++) {
          const code = crypto.randomUUID().substring(0, 8).toUpperCase();
          codes.push(code);
          insertData.push({
            code,
            expire_at: expireAt,
            is_used: false,
          });
        }

        const { error } = await supabase
          .from('activation_codes')
          .insert(insertData);

        if (error) {
          console.error('Generate codes error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, codes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取所有激活码
      case 'list-codes': {
        const { data, error } = await supabase
          .from('activation_codes')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('List codes error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 绑定已存在的机器人到激活码 (支持 bind-code 和 bind-existing 两种action名称)
      case 'bind-code':
      case 'bind-existing': {
        // 兼容两种参数名称: code 或 activationCode
        const code = params.code || params.activationCode;
        const { botId } = params;
        
        // 查找激活码
        const { data: codeData, error: codeError } = await supabase
          .from('activation_codes')
          .select('*')
          .eq('code', code)
          .maybeSingle();

        if (codeError || !codeData) {
          return new Response(JSON.stringify({ ok: false, error: '激活码不存在' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (codeData.is_used) {
          return new Response(JSON.stringify({ ok: false, error: '激活码已被使用' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新机器人为已激活 - 同时重置端口开关为开启状态
        const { error: updateError } = await supabase
          .from('bot_activations')
          .update({
            is_authorized: true,
            is_active: true,
            expire_at: codeData.expire_at,
            trial_messages_used: 0,
            web_enabled: true,  // 激活时重置为开启
            app_enabled: true,  // 激活时重置为开启
          })
          .eq('id', botId);

        if (updateError) {
          return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 标记激活码为已使用
        await supabase
          .from('activation_codes')
          .update({
            is_used: true,
            used_by_bot_id: botId,
          })
          .eq('id', codeData.id);

        // 更新试用记录
        const { data: bot } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', botId)
          .single();

        if (bot) {
          await supabase
            .from('bot_trial_records')
            .upsert({
              bot_token: bot.bot_token,
              was_authorized: true,
              last_authorized_expire_at: codeData.expire_at,
              is_blocked: false,
            }, { onConflict: 'bot_token' });

          // 设置webhook - 使用bot token作为路径
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${bot.bot_token}`;
          await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 管理员直接激活
      case 'admin-authorize': {
        const { id } = params;
        
        const { error } = await supabase
          .from('bot_activations')
          .update({
            is_authorized: true,
            is_active: true,
            trial_messages_used: 0,
            web_enabled: true,  // 激活时重置为开启
            app_enabled: true,  // 激活时重置为开启
          })
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新试用记录
        const { data: bot } = await supabase
          .from('bot_activations')
          .select('bot_token, expire_at')
          .eq('id', id)
          .single();

        if (bot) {
          await supabase
            .from('bot_trial_records')
            .upsert({
              bot_token: bot.bot_token,
              was_authorized: true,
              last_authorized_expire_at: bot.expire_at,
              is_blocked: false,
            }, { onConflict: 'bot_token' });

          // 设置webhook - 使用bot token作为路径
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${bot.bot_token}`;
          await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 用户使用激活码激活机器人
      case 'authorize': {
        const { activationCode: code, botId } = params;
        
        // 查找激活码
        const { data: codeData, error: codeError } = await supabase
          .from('activation_codes')
          .select('*')
          .eq('code', code)
          .maybeSingle();

        if (codeError || !codeData) {
          return new Response(JSON.stringify({ ok: false, error: '激活码不存在' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (codeData.is_used) {
          return new Response(JSON.stringify({ ok: false, error: '激活码已被使用' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新机器人为已激活 - 同时重置端口开关为开启状态
        const { error: updateError } = await supabase
          .from('bot_activations')
          .update({
            is_authorized: true,
            is_active: true,
            expire_at: codeData.expire_at,
            trial_messages_used: 0,
            web_enabled: true,  // 激活时重置为开启
            app_enabled: true,  // 激活时重置为开启
          })
          .eq('id', botId);

        if (updateError) {
          return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 标记激活码为已使用
        await supabase
          .from('activation_codes')
          .update({
            is_used: true,
            used_by_bot_id: botId,
          })
          .eq('id', codeData.id);

        // 更新试用记录
        const { data: bot } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', botId)
          .single();

        if (bot) {
          await supabase
            .from('bot_trial_records')
            .upsert({
              bot_token: bot.bot_token,
              was_authorized: true,
              last_authorized_expire_at: codeData.expire_at,
              is_blocked: false,
            }, { onConflict: 'bot_token' });

          // 设置webhook - 使用bot token作为路径
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${bot.bot_token}`;
          console.log('Setting webhook for authorized bot:', webhookUrl);
          const webhookResult = await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          });
          const webhookResponse = await webhookResult.json();
          console.log('Webhook set result:', webhookResponse);
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 启用/停用机器人
      case 'toggle': {
        const { id, isActive } = params;
        
        const { data: bot, error: fetchError } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', id)
          .single();

        if (fetchError) {
          return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await supabase
          .from('bot_activations')
          .update({ is_active: isActive })
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 设置或删除webhook
        if (isActive) {
          // 设置webhook - 使用bot token作为路径
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${bot.bot_token}`;
          await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          });
        } else {
          await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`, {
            method: 'POST',
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 用户删除自己的机器人
      case 'delete': {
        // 兼容 id 和 botId 两种参数名
        const botId = params.id || params.botId;
        
        if (!botId) {
          return new Response(JSON.stringify({ ok: false, error: '缺少机器人ID' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const { data: bot, error: fetchError } = await supabase
          .from('bot_activations')
          .select('bot_token, user_id')
          .eq('id', botId)
          .single();

        if (fetchError) {
          return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 验证用户权限 - 只能删除自己的机器人或游客机器人
        const authHeader = req.headers.get('Authorization');
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const { data: { user } } = await supabase.auth.getUser(token);
          
          // 如果机器人有用户ID且不是当前用户，拒绝删除
          if (bot.user_id && user && bot.user_id !== user.id) {
            // 检查是否是管理员
            const { data: isAdmin } = await supabase.rpc('has_role', {
              _user_id: user.id,
              _role: 'admin'
            });
            
            if (!isAdmin) {
              return new Response(JSON.stringify({ ok: false, error: '无权删除此机器人' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }

        // 删除相关消息
        await supabase
          .from('messages')
          .delete()
          .eq('bot_activation_id', botId);

        // 删除机器人
        const { error } = await supabase
          .from('bot_activations')
          .delete()
          .eq('id', botId);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 删除webhook
        await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`, {
          method: 'POST',
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // 管理员删除机器人 (旧版兼容)
      case 'admin-delete': {
        const { id } = params;
        
        const { data: bot, error: fetchError } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', id)
          .single();

        if (fetchError) {
          return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 删除相关消息
        await supabase
          .from('messages')
          .delete()
          .eq('bot_activation_id', id);

        // 删除机器人
        const { error } = await supabase
          .from('bot_activations')
          .delete()
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 删除webhook
        await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`, {
          method: 'POST',
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 延长到期日期
      case 'extend': {
        const { id, expireAt } = params;
        
        const { error } = await supabase
          .from('bot_activations')
          .update({ expire_at: expireAt })
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新试用记录
        const { data: bot } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', id)
          .single();

        if (bot) {
          await supabase
            .from('bot_trial_records')
            .update({ last_authorized_expire_at: expireAt })
            .eq('bot_token', bot.bot_token);
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取所有机器人列表（管理员用）
      case 'list': {
        const { data, error } = await supabase
          .from('bot_activations')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 获取用户邮箱
        const userIds = [...new Set(data.filter(d => d.user_id).map(d => d.user_id))];
        const userEmails: Record<string, string> = {};
        
        for (const userId of userIds) {
          const { data: userData } = await supabase.auth.admin.getUserById(userId);
          if (userData?.user?.email) {
            userEmails[userId] = userData.user.email;
          }
        }

        const enrichedData = data.map(d => ({
          ...d,
          user_email: d.user_id ? userEmails[d.user_id] : null,
        }));

        return new Response(JSON.stringify({ ok: true, data: enrichedData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取所有消息（管理员用）
      case 'list-all-messages': {
        const { data, error } = await supabase
          .from('messages')
          .select('*, bot_activations(bot_token, personal_user_id)')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 切换端口状态
      case 'toggle-port': {
        const { id, portType, enabled } = params;
        
        const updateData = portType === 'web' 
          ? { web_enabled: enabled }
          : { app_enabled: enabled };

        const { error } = await supabase
          .from('bot_activations')
          .update(updateData)
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 清理过期试用机器人
      case 'cleanup-expired-trials': {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const { data: expiredBots, error: fetchError } = await supabase
          .from('bot_activations')
          .select('id, bot_token')
          .eq('is_authorized', false)
          .lt('created_at', threeDaysAgo.toISOString());

        if (fetchError) {
          return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        for (const bot of expiredBots || []) {
          // 删除webhook
          await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`, {
            method: 'POST',
          });

          // 删除消息
          await supabase
            .from('messages')
            .delete()
            .eq('bot_activation_id', bot.id);

          // 删除机器人
          await supabase
            .from('bot_activations')
            .delete()
            .eq('id', bot.id);
        }

        return new Response(JSON.stringify({ ok: true, cleaned: expiredBots?.length || 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 管理员发送消息
      case 'admin-send-message': {
        const { botActivationId, chatId, message } = params;
        
        const { data: bot, error: fetchError } = await supabase
          .from('bot_activations')
          .select('bot_token, web_enabled')
          .eq('id', botActivationId)
          .single();

        if (fetchError || !bot) {
          return new Response(JSON.stringify({ ok: false, error: '机器人不存在' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 发送Telegram消息
        const telegramResponse = await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
        });

        const telegramResult = await telegramResponse.json();
        
        if (!telegramResult.ok) {
          return new Response(JSON.stringify({ ok: false, error: telegramResult.description }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 保存消息记录
        // 管理员发送的消息始终可见（is_read: false），不受web端口限制
        // 这样管理员聊天监控始终能看到自己发送的消息
        await supabase
          .from('messages')
          .insert({
            bot_activation_id: botActivationId,
            telegram_chat_id: chatId,
            telegram_message_id: telegramResult.result.message_id,
            content: message,
            direction: 'outgoing',
            is_admin_reply: true,
            is_read: false, // 管理员消息始终可见
          });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 禁用/启用用户
      case 'toggle-user-disabled': {
        const { userId, disabled } = params;
        
        if (disabled) {
          const { error } = await supabase
            .from('disabled_users')
            .insert({ user_id: userId });

          if (error && error.code !== '23505') { // 忽略重复键错误
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          const { error } = await supabase
            .from('disabled_users')
            .delete()
            .eq('user_id', userId);

          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取禁用用户列表
      case 'list-disabled-users': {
        const { data, error } = await supabase
          .from('disabled_users')
          .select('user_id');

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取所有注册用户列表（管理员用）
      case 'list-users': {
        try {
          // 使用 admin API 获取所有用户
          const { data: { users }, error } = await supabase.auth.admin.listUsers();
          
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // 返回用户基本信息
          const userData = users.map(u => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
          }));

          return new Response(JSON.stringify({ ok: true, data: userData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (err) {
          console.error('List users error:', err);
          return new Response(JSON.stringify({ ok: false, error: '获取用户列表失败' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      default:
        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Manage bot error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
