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
        
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('bot_activations')
          .select('*')
          .eq('bot_token', botToken)
          .maybeSingle();

        if (existing) {
          // 如果存在且未授权且试用已满，拒绝
          if (!existing.is_authorized && existing.trial_messages_used >= existing.trial_limit) {
            return new Response(JSON.stringify({ 
              ok: false, 
              error: '此机器人令牌已用完试用额度，需要授权激活' 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          // 已存在则返回现有数据
          return new Response(JSON.stringify({ ok: true, data: existing, existed: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // 生成激活码（试用模式）
        const activationCode = 'trial-' + crypto.randomUUID().substring(0, 8);
        
        // 创建新的试用机器人
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
            trial_messages_used: 0,
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

        // 设置Webhook
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

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 批量生成激活码
      case 'generate-codes': {
        const { count, expireAt } = params;
        
        const codes = [];
        for (let i = 0; i < count; i++) {
          const code = crypto.randomUUID().substring(0, 8).toUpperCase();
          codes.push({
            activation_code: code,
            bot_token: 'PENDING', // 占位符，待用户绑定
            personal_user_id: 'PENDING',
            is_active: false,
            is_authorized: false,
            expire_at: expireAt,
            greeting_message: '你好！👋 有什么可以帮助你的吗？',
          });
        }

        const { data, error } = await supabase
          .from('bot_activations')
          .insert(codes)
          .select();

        if (error) {
          console.error('Generate codes error:', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data, codes: codes.map(c => c.activation_code) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 用户绑定激活码
      case 'bind-code': {
        const { activationCode, botToken, personalUserId } = params;
        
        // 查找激活码
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

        // 检查是否已被绑定
        if (activation.bot_token !== 'PENDING') {
          return new Response(JSON.stringify({ ok: false, error: '此激活码已被使用' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 检查过期
        if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
          return new Response(JSON.stringify({ ok: false, error: '激活码已过期' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 设置Webhook
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

        if (!webhookResult.ok) {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: '设置Webhook失败: ' + webhookResult.description 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 更新激活记录
        const { data, error } = await supabase
          .from('bot_activations')
          .update({ 
            bot_token: botToken,
            personal_user_id: personalUserId,
            is_active: true, 
            is_authorized: true 
          })
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

        return new Response(JSON.stringify({ ok: true, data }), {
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
