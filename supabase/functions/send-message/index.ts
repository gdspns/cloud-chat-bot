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

    const { activationId, chatId, message } = await req.json();
    
    console.log('Sending message:', { activationId, chatId, message });

    if (!activationId || !chatId || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get bot activation
    const { data: activation, error: activationError } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('id', activationId)
      .eq('is_active', true)
      .maybeSingle();

    if (activationError || !activation) {
      return new Response(JSON.stringify({ error: 'Bot not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (activation.expire_at && new Date(activation.expire_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Bot expired' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check trial limit
    if (!activation.is_authorized && activation.trial_messages_used >= activation.trial_limit) {
      return new Response(JSON.stringify({ error: 'Trial limit reached', trialExceeded: true }), {
        status: 403,
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
    console.log('Telegram API response:', sendResult);

    if (!sendResult.ok) {
      return new Response(JSON.stringify({ error: sendResult.description }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store outgoing message
    await supabase.from('messages').insert({
      bot_activation_id: activationId,
      telegram_chat_id: chatId,
      telegram_user_name: '我',
      content: message,
      direction: 'outgoing',
    });

    // Update trial count if not authorized
    if (!activation.is_authorized) {
      await supabase
        .from('bot_activations')
        .update({ trial_messages_used: activation.trial_messages_used + 1 })
        .eq('id', activation.id);
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
