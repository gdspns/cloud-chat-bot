import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 计算一周前的时间
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    console.log(`清理 ${oneWeekAgo.toISOString()} 之前的图片消息`);

    // 查找包含图片URL的消息
    const { data: oldMessages, error: fetchError } = await supabase
      .from('messages')
      .select('id, content')
      .lt('created_at', oneWeekAgo.toISOString())
      .like('content', '%[图片]%https://api.telegram.org%');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`找到 ${oldMessages?.length || 0} 条图片消息需要清理`);

    if (oldMessages && oldMessages.length > 0) {
      // 更新这些消息，移除图片URL但保留[图片]标记和文字说明
      const updatePromises = oldMessages.map(async (msg) => {
        // 移除图片URL，保留其他内容
        let newContent = msg.content;
        
        // 移除 Telegram 图片URL
        newContent = newContent.replace(/https:\/\/api\.telegram\.org\/file\/[^\s]+/g, '');
        
        // 清理多余的空白和换行
        newContent = newContent.replace(/\n+/g, '\n').trim();
        
        // 如果只剩[图片]，保持原样
        if (!newContent || newContent === '[图片]') {
          newContent = '[图片] (已过期)';
        } else if (newContent.startsWith('[图片]')) {
          newContent = newContent.replace('[图片]', '[图片] (已过期)');
        }

        return supabase
          .from('messages')
          .update({ content: newContent })
          .eq('id', msg.id);
      });

      await Promise.all(updatePromises);
      console.log(`成功清理 ${oldMessages.length} 条图片消息`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        cleanedCount: oldMessages?.length || 0,
        message: `已清理 ${oldMessages?.length || 0} 条一周前的图片消息`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('清理图片失败:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
