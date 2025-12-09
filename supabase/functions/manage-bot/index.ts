import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

      // 用户创建试用机器人
      case 'create-trial': {
        const { botToken, personalUserId, greetingMessage } = params;
        
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

          // 设置Webhook
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
        
        // 生成激活码（试用模式）
        const activationCode = 'trial-' + crypto.randomUUID().substring(0, 8);
        
        // 从试用记录恢复消息数（如果有）- 即使被封禁也允许添加，但显示累计使用量
        const messagesUsed = trialRecord?.messages_used || 0;
        const isBlocked = messagesUsed >= 20;
        
        // 创建新的试用机器人 - 即使已满20条也允许添加，只是不能收发消息
        const { data, error } = await supabase
          .from('bot_activations')
          .insert({
            bot_token: botToken,
            personal_user_id: personalUserId,
            greeting_message: greetingMessage || '你好！👋 有什么可以帮助你的吗？',
            activation_code: activationCode,
            is_active: !isBlocked, // 如果被封禁则不激活
            is_authorized: false,
            trial_limit: 20,
            trial_messages_used: messagesUsed, // 恢复累计使用量
          })
          .select()
          .single();

        if (error) {
          console.error('Create trial error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 创建/更新试用记录
        await supabase
          .from('bot_trial_records')
          .upsert({
            bot_token: botToken,
            messages_used: messagesUsed,
            is_blocked: isBlocked,
          }, { onConflict: 'bot_token' });

        // 设置Webhook（即使被封禁也设置，以便解封后可用）
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${botToken}`;
        const webhookResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/setWebhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          }
        );
        const webhookResult = await webhookResponse.json();
        console.log('Trial webhook setup result:', webhookResult);

        if (!webhookResult.ok) {
          // 如果webhook设置失败，删除刚创建的记录
          await supabase.from('bot_activations').delete().eq('id', data.id);
          return new Response(JSON.stringify({ 
            ok: false, 
            error: '设置Webhook失败，请检查机器人令牌是否正确: ' + webhookResult.description 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data, trialBlocked: isBlocked }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 批量生成激活码 - 存储到 activation_codes 表
      case 'generate-codes': {
        const { count, expireAt } = params;
        
        const codes = [];
        for (let i = 0; i < count; i++) {
          const code = crypto.randomUUID().substring(0, 8).toUpperCase();
          codes.push({
            code: code,
            expire_at: expireAt,
            is_used: false,
          });
        }

        const { data, error } = await supabase
          .from('activation_codes')
          .insert(codes)
          .select();

        if (error) {
          console.error('Generate codes error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data, codes: codes.map(c => c.code) }), {
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
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 用户绑定激活码到已存在的机器人
      case 'bind-existing': {
        const { activationCode, botId } = params;
        
        // 查找目标机器人
        const { data: bot, error: botError } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', botId)
          .single();

        if (botError || !bot) {
          return new Response(JSON.stringify({ ok: false, error: '机器人不存在' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 查找激活码 - 从 activation_codes 表
        const { data: codeRecord, error: codeError } = await supabase
          .from('activation_codes')
          .select('*')
          .eq('code', activationCode)
          .eq('is_used', false)
          .maybeSingle();

        if (codeError || !codeRecord) {
          return new Response(JSON.stringify({ ok: false, error: '激活码无效或已被使用' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 检查激活码过期
        if (codeRecord.expire_at && new Date(codeRecord.expire_at) < new Date()) {
          return new Response(JSON.stringify({ ok: false, error: '激活码已过期' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新机器人为已授权，并继承激活码的过期时间
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ 
            is_authorized: true, 
            is_active: true,
            expire_at: codeRecord.expire_at,
            trial_messages_used: 0 // 重置试用计数
          })
          .eq('id', botId)
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 标记激活码已使用
        await supabase
          .from('activation_codes')
          .update({ is_used: true, used_by_bot_id: botId })
          .eq('id', codeRecord.id);

        // 更新试用记录
        await supabase
          .from('bot_trial_records')
          .upsert({
            bot_token: bot.bot_token,
            messages_used: 0,
            is_blocked: false,
            was_authorized: true,
            last_authorized_expire_at: codeRecord.expire_at,
          }, { onConflict: 'bot_token' });

        // 设置webhook
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${bot.bot_token}`;
        await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        });

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 管理员直接授权激活
      case 'admin-authorize': {
        const { id } = params;
        
        const { data: activation, error: findError } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', id)
          .single();

        if (findError || !activation) {
          return new Response(JSON.stringify({ ok: false, error: '机器人不存在' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (activation.bot_token === 'PENDING') {
          return new Response(JSON.stringify({ ok: false, error: '机器人令牌未绑定' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Set up webhook
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${activation.bot_token}`;
        await fetch(`https://api.telegram.org/bot${activation.bot_token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        });

        // 设置默认过期时间为1个月后（如果没有设置的话）
        const expireAt = activation.expire_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Update activation
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ 
            is_active: true, 
            is_authorized: true,
            expire_at: expireAt,
            trial_messages_used: 0
          })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新试用记录
        await supabase
          .from('bot_trial_records')
          .upsert({
            bot_token: activation.bot_token,
            messages_used: 0,
            is_blocked: false,
            was_authorized: true,
            last_authorized_expire_at: expireAt,
          }, { onConflict: 'bot_token' });

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'authorize': {
        const { activationCode, botToken } = params;
        
        const { data: activation, error: findError } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('activation_code', activationCode)
          .maybeSingle();

        if (findError || !activation) {
          return new Response(JSON.stringify({ ok: false, error: '激活码无效' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Verify bot token matches
        if (activation.bot_token !== botToken) {
          return new Response(JSON.stringify({ ok: false, error: '机器人令牌不匹配' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check expiry
        if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
          return new Response(JSON.stringify({ ok: false, error: '授权已过期' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Set up webhook for the bot
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${botToken}`;
        const webhookResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/setWebhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          }
        );
        const webhookResult = await webhookResponse.json();
        console.log('Webhook setup result:', webhookResult);

        if (!webhookResult.ok) {
          return new Response(JSON.stringify({ ok: false, error: '设置Webhook失败: ' + webhookResult.description }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update activation
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ is_active: true, is_authorized: true })
          .eq('id', activation.id)
          .select()
          .single();

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

      case 'toggle': {
        const { id, isActive } = params;
        
        const { data: activation } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', id)
          .single();

        if (activation && activation.bot_token !== 'PENDING') {
          if (isActive) {
            // Set up webhook
            const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook/${activation.bot_token}`;
            await fetch(`https://api.telegram.org/bot${activation.bot_token}/setWebhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: webhookUrl }),
            });
          } else {
            // Delete webhook
            await fetch(`https://api.telegram.org/bot${activation.bot_token}/deleteWebhook`);
          }
        }

        const { data, error } = await supabase
          .from('bot_activations')
          .update({ is_active: isActive })
          .eq('id', id)
          .select()
          .single();

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

      case 'delete': {
        const { id } = params;
        
        // Get activation to delete webhook
        const { data: activation } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', id)
          .single();

        if (activation && activation.bot_token !== 'PENDING') {
          // Delete webhook
          await fetch(`https://api.telegram.org/bot${activation.bot_token}/deleteWebhook`);
          
          // 不删除试用记录，保留消息计数和授权状态
        }

        // 同时删除相关消息
        await supabase.from('messages').delete().eq('bot_activation_id', id);

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

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'extend': {
        const { id, expireAt } = params;
        
        const { data: bot } = await supabase
          .from('bot_activations')
          .select('bot_token')
          .eq('id', id)
          .single();
        
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ expire_at: expireAt })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新试用记录的过期时间
        if (bot) {
          await supabase
            .from('bot_trial_records')
            .update({ last_authorized_expire_at: expireAt })
            .eq('bot_token', bot.bot_token);
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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

        // 获取用户邮箱信息
        const userIds = [...new Set(data?.filter(b => b.user_id).map(b => b.user_id) || [])];
        const userEmails: Record<string, string> = {};
        
        if (userIds.length > 0) {
          const { data: users } = await supabase.auth.admin.listUsers();
          if (users?.users) {
            for (const user of users.users) {
              if (userIds.includes(user.id)) {
                userEmails[user.id] = user.email || '';
              }
            }
          }
        }

        // 添加用户邮箱到机器人数据
        const dataWithEmail = data?.map(bot => ({
          ...bot,
          user_email: bot.user_id ? userEmails[bot.user_id] || null : null
        }));

        return new Response(JSON.stringify({ ok: true, data: dataWithEmail }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 获取所有消息（管理员用）
      case 'list-all-messages': {
        const { data, error } = await supabase
          .from('messages')
          .select('*, bot_activations(bot_token, personal_user_id)')
          .order('created_at', { ascending: false })
          .limit(500);

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

      // 端口控制
      case 'toggle-port': {
        const { id, portType, enabled } = params;
        
        const updateData: Record<string, boolean> = {};
        if (portType === 'web') {
          updateData.web_enabled = enabled;
        } else if (portType === 'app') {
          updateData.app_enabled = enabled;
        } else {
          return new Response(JSON.stringify({ ok: false, error: '无效的端口类型' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data, error } = await supabase
          .from('bot_activations')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

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

      // 清理72小时未激活的试用机器人
      case 'cleanup-expired-trials': {
        const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        
        const { data: expiredBots, error: fetchError } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('is_authorized', false)
          .lt('created_at', cutoffTime);

        if (fetchError) {
          return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 删除过期的试用机器人及其消息（但保留试用记录）
        for (const bot of expiredBots || []) {
          if (bot.bot_token !== 'PENDING') {
            await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`);
          }
          await supabase.from('messages').delete().eq('bot_activation_id', bot.id);
          await supabase.from('bot_activations').delete().eq('id', bot.id);
        }

        return new Response(JSON.stringify({ ok: true, deleted: expiredBots?.length || 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 管理员发送消息
      case 'admin-send-message': {
        const { botActivationId, chatId, message } = params;
        
        const { data: activation, error: activationError } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('id', botActivationId)
          .single();

        if (activationError || !activation) {
          return new Response(JSON.stringify({ ok: false, error: '机器人不存在' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Send message to Telegram
        const sendResponse = await fetch(
          `https://api.telegram.org/bot${activation.bot_token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
            }),
          }
        );

        const sendResult = await sendResponse.json();

        if (!sendResult.ok) {
          return new Response(JSON.stringify({ ok: false, error: sendResult.description }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Store message
        await supabase.from('messages').insert({
          bot_activation_id: botActivationId,
          telegram_chat_id: chatId,
          telegram_user_name: '管理员',
          content: message,
          direction: 'outgoing',
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('Manage bot error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});