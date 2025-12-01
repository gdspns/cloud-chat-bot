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
      .eq('is_active', true)
      .maybeSingle();

    if (activationError || !activation) {
      console.log('Bot not found or inactive:', activationError);
      return new Response(JSON.stringify({ error: 'Bot not found or inactive' }), {
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

    // Check trial limit if not authorized
    if (!activation.is_authorized && activation.trial_messages_used >= activation.trial_limit) {
      console.log('Trial limit reached');
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
    const text = message.text || '';
    const messageId = message.message_id;
    const personalUserId = parseInt(activation.personal_user_id);

    // Check if this is a reply from personal user to forward
    if (chatId === personalUserId && message.reply_to_message) {
      // Extract target chat ID from the original forwarded message
      // Format: [CHATID:xxx:MSGID:xxx]
      const replyText = message.reply_to_message.text || '';
      const chatIdMatch = replyText.match(/\[CHATID:(\d+):MSGID:(\d+)\]/);
      
      if (chatIdMatch) {
        const targetChatId = parseInt(chatIdMatch[1]);
        const originalMsgId = parseInt(chatIdMatch[2]);
        
        console.log(`Routing reply to chatId: ${targetChatId}, originalMsgId: ${originalMsgId}`);
        
        // Send message to the original user (reply to their original message)
        const sendResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              text: text,
              reply_to_message_id: originalMsgId, // Reply to the original message for context
            }),
          }
        );

        const sendResult = await sendResponse.json();
        console.log('Reply sent result:', JSON.stringify(sendResult, null, 2));

        if (sendResult.ok) {
          // Store outgoing message with correct chat ID
          await supabase.from('messages').insert({
            bot_activation_id: activation.id,
            telegram_chat_id: targetChatId,
            telegram_message_id: sendResult.result?.message_id,
            telegram_user_name: '我',
            content: text,
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

    // Store incoming message
    const userName = fromUser.first_name + (fromUser.last_name ? ' ' + fromUser.last_name : '');
    
    await supabase.from('messages').insert({
      bot_activation_id: activation.id,
      telegram_chat_id: chatId,
      telegram_user_name: userName,
      telegram_message_id: messageId,
      content: text,
      direction: 'incoming',
    });

    // Update trial messages count if not authorized
    if (!activation.is_authorized) {
      await supabase
        .from('bot_activations')
        .update({ trial_messages_used: activation.trial_messages_used + 1 })
        .eq('id', activation.id);
    }

    // Forward message to personal user
    const forwardText = `📨 新消息\n来自: ${userName}\n[CHATID:${chatId}:MSGID:${messageId}]\n\n${text}`;
    
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: personalUserId,
        text: forwardText,
      }),
    });

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
