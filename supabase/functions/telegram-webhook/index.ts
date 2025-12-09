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

    const body = await req.json();
    console.log('Received webhook:', JSON.stringify(body, null, 2));

    // Extract bot token from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const botToken = pathParts[pathParts.length - 1];

    if (!botToken || botToken === 'telegram-webhook') {
      console.log('No bot token in path');
      return new Response(JSON.stringify({ error: 'Missing bot token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the bot activation by token
    const { data: activation, error: activationError } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('bot_token', botToken)
      .maybeSingle();

    if (activationError || !activation) {
      console.log('Bot not found:', activationError);
      return new Response(JSON.stringify({ error: 'Bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if bot is expired
    if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
      console.log('Bot expired');
      await supabase
        .from('bot_activations')
        .update({ is_active: false })
        .eq('id', activation.id);
      return new Response(JSON.stringify({ error: 'Bot expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check trial limit if not authorized - 试用满20条后不能收发消息
    if (!activation.is_authorized && activation.trial_messages_used >= activation.trial_limit) {
      console.log('Trial limit reached - blocked');
      return new Response(JSON.stringify({ error: 'Trial limit reached' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const message = body.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatId = message.chat.id;
    const fromUser = message.from;
    let text = message.text || message.caption || '';
    const messageId = message.message_id;
    const personalUserId = parseInt(activation.personal_user_id);

    // 处理图片消息
    let photoUrl = '';
    let photoFileId = '';
    if (message.photo && message.photo.length > 0) {
      // 获取最大尺寸的图片
      const largestPhoto = message.photo[message.photo.length - 1];
      photoFileId = largestPhoto.file_id;
      
      // 获取文件路径
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${photoFileId}`
      );
      const fileData = await fileResponse.json();
      
      if (fileData.ok && fileData.result.file_path) {
        photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
        text = `[图片] ${photoUrl}` + (text ? `\n${text}` : '');
      }
      console.log('Photo received:', { photoFileId, photoUrl });
    }

    // Check if this is a reply from personal user to forward
    if (chatId === personalUserId && message.reply_to_message) {
      // 【App端口控制】检查App端口 - 控制Telegram App中用户的回复能力
      if (activation.app_enabled === false) {
        console.log('App port disabled - reply blocked');
        return new Response(JSON.stringify({ ok: true, blocked: 'app_port_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Extract target chat ID from the original forwarded message
      // Format: [CHATID:xxx:MSGID:xxx]
      const replyText = message.reply_to_message.text || message.reply_to_message.caption || '';
      const chatIdMatch = replyText.match(/\[CHATID:(\d+):MSGID:(\d+)\]/);
      
      if (chatIdMatch) {
        const targetChatId = parseInt(chatIdMatch[1]);
        const originalMsgId = parseInt(chatIdMatch[2]);
        
        console.log(`Routing reply to chatId: ${targetChatId}, originalMsgId: ${originalMsgId}`);
        
        let sendResult;
        let messageContent = message.text || message.caption || '';
        
        // 检查是否是图片回复
        if (message.photo && message.photo.length > 0) {
          const replyPhotoFileId = message.photo[message.photo.length - 1].file_id;
          const sendResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendPhoto`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetChatId,
                photo: replyPhotoFileId,
                caption: messageContent,
                reply_to_message_id: originalMsgId,
              }),
            }
          );
          sendResult = await sendResponse.json();
          
          // 获取图片URL用于存储
          const fileResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${replyPhotoFileId}`
          );
          const fileData = await fileResponse.json();
          if (fileData.ok && fileData.result.file_path) {
            const replyPhotoUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
            messageContent = `[图片] ${replyPhotoUrl}` + (messageContent ? `\n${messageContent}` : '');
          } else {
            messageContent = `[图片]` + (messageContent ? `\n${messageContent}` : '');
          }
        } else {
          // 发送文本回复
          const sendResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetChatId,
                text: messageContent,
                reply_to_message_id: originalMsgId,
              }),
            }
          );
          sendResult = await sendResponse.json();
        }

        console.log('Reply sent result:', JSON.stringify(sendResult, null, 2));

        if (sendResult.ok) {
          // Store outgoing message with correct chat ID
          await supabase.from('messages').insert({
            bot_activation_id: activation.id,
            telegram_chat_id: targetChatId,
            telegram_message_id: sendResult.result?.message_id,
            telegram_user_name: '我',
            content: messageContent,
            direction: 'outgoing',
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Skip messages from personal user that are not replies
    if (chatId === personalUserId) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 【关键逻辑】无论端口开关状态，都先记录消息到数据库
    // 同时记录消息接收时的端口状态，用于前端过滤显示
    const userName = fromUser.first_name + (fromUser.last_name ? ' ' + fromUser.last_name : '');
    
    // 管理员监控始终可以看到所有消息，这里直接存储
    await supabase.from('messages').insert({
      bot_activation_id: activation.id,
      telegram_chat_id: chatId,
      telegram_user_name: userName,
      telegram_message_id: messageId,
      content: text,
      direction: 'incoming',
      // 如果web端口关闭，标记为未读false，前端会过滤掉
      is_read: activation.web_enabled === false ? null : false,
    });

    // Update trial messages count if not authorized
    if (!activation.is_authorized) {
      await supabase
        .from('bot_activations')
        .update({ trial_messages_used: activation.trial_messages_used + 1 })
        .eq('id', activation.id);
        
      // 同步更新试用记录表
      await supabase
        .from('bot_trial_records')
        .upsert({
          bot_token: botToken,
          messages_used: activation.trial_messages_used + 1,
          is_blocked: activation.trial_messages_used + 1 >= activation.trial_limit,
        }, { onConflict: 'bot_token' });
    }

    // 【App端口控制】只有App端口开启时才转发到个人用户的Telegram
    if (activation.app_enabled !== false) {
      // Handle /start command - send greeting
      if (text === '/start' && activation.greeting_message) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: activation.greeting_message,
          }),
        });
      }

      // Forward message to personal user
      if (photoFileId) {
        // 转发图片消息
        const forwardCaption = `📨 新消息\n来自: ${userName}\n[CHATID:${chatId}:MSGID:${messageId}]\n\n${message.caption || ''}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: personalUserId,
            photo: photoFileId,
            caption: forwardCaption,
          }),
        });
      } else {
        // 转发文本消息
        const forwardText = `📨 新消息\n来自: ${userName}\n[CHATID:${chatId}:MSGID:${messageId}]\n\n${text}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: personalUserId,
            text: forwardText,
          }),
        });
      }
    } else {
      console.log('App port disabled - message stored but not forwarded');
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
