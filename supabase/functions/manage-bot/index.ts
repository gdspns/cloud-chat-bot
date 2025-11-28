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
          return new Response(JSON.stringify({ error: error.message }), {
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
          return new Response(JSON.stringify({ error: '激活码无效' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Verify bot token matches
        if (activation.bot_token !== botToken) {
          return new Response(JSON.stringify({ error: '机器人令牌不匹配' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check expiry
        if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
          return new Response(JSON.stringify({ error: '授权已过期' }), {
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
          return new Response(JSON.stringify({ error: '设置Webhook失败: ' + webhookResult.description }), {
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
          return new Response(JSON.stringify({ error: error.message }), {
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

        if (activation) {
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
          return new Response(JSON.stringify({ error: error.message }), {
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

        if (activation) {
          // Delete webhook
          await fetch(`https://api.telegram.org/bot${activation.bot_token}/deleteWebhook`);
        }

        const { error } = await supabase
          .from('bot_activations')
          .delete()
          .eq('id', id);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
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
          return new Response(JSON.stringify({ error: error.message }), {
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
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('Manage bot error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
