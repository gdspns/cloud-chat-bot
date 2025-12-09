import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { activationId, chatId, message, photoFileId, photoBase64 } = await req.json();
    
    console.log('Sending message:', { activationId, chatId, message: message?.substring(0, 50), hasPhoto: !!photoFileId, hasBase64: !!photoBase64 });

    if (!activationId || !chatId || (!message && !photoFileId && !photoBase64)) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 获取机器人信息
    const { data: activation, error: activationError } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('id', activationId)
      .maybeSingle();

    if (activationError || !activation) {
      return new Response(JSON.stringify({ error: 'Bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 检查过期
    if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Bot expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 检查 Web 端口
    if (!activation.web_enabled) {
      return new Response(JSON.stringify({ error: 'Web端口已禁用', webDisabled: true }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 检查试用限制
    if (!activation.is_authorized && activation.trial_messages_used >= activation.trial_limit) {
      return new Response(JSON.stringify({ error: 'Trial limit reached', trialExceeded: true }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 发送消息
    let sendResult;
    let messageContent = message || '';

    if (photoBase64) {
      // 从 base64 发送图片
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('photo', new Blob([binaryData], { type: 'image/jpeg' }), 'photo.jpg');
      if (message) {
        formData.append('caption', message);
      }
      
      const sendResponse = await fetch(
        `https://api.telegram.org/bot${activation.bot_token}/sendPhoto`,
        {
          method: 'POST',
          body: formData,
        }
      );
      sendResult = await sendResponse.json();
      messageContent = message ? `[图片] ${message}` : '[图片]';
    } else if (photoFileId) {
      // 发送图片（通过 file_id）
      const sendResponse = await fetch(
        `https://api.telegram.org/bot${activation.bot_token}/sendPhoto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: photoFileId,
            caption: message || '',
          }),
        }
      );
      sendResult = await sendResponse.json();
      messageContent = message ? `[图片] ${message}` : '[图片]';
    } else {
      // 发送文本
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
      sendResult = await sendResponse.json();
    }

    console.log('Telegram API response:', sendResult);

    if (!sendResult.ok) {
      return new Response(JSON.stringify({ error: sendResult.description }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 保存发送的消息
    await supabase.from('messages').insert({
      bot_activation_id: activationId,
      telegram_chat_id: chatId,
      telegram_user_name: '我',
      content: messageContent,
      direction: 'outgoing',
      is_read: true,
    });

    // 更新试用计数
    if (!activation.is_authorized) {
      const newCount = activation.trial_messages_used + 1;
      await supabase
        .from('bot_activations')
        .update({ trial_messages_used: newCount })
        .eq('id', activation.id);

      await supabase
        .from('bot_trial_records')
        .upsert({
          bot_token: activation.bot_token,
          messages_used: newCount,
          is_blocked: newCount >= activation.trial_limit,
        }, { onConflict: 'bot_token' });
    }

    return new Response(JSON.stringify({ ok: true, result: sendResult.result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Send message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
