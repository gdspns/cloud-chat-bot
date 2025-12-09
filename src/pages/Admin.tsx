import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Play, Pause, Calendar, Copy, CheckCircle, XCircle, Key, Globe, Smartphone, List, MessageSquare, Send, LayoutDashboard, Users, Bot, Image as ImageIcon, ChevronDown, ChevronUp, X, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  greeting_message: string;
  activation_code: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
  created_at: string;
  web_enabled?: boolean;
  app_enabled?: boolean;
  user_id?: string;
  user_email?: string;
}

interface ActivationCode {
  id: string;
  code: string;
  expire_at: string | null;
  is_used: boolean;
  used_by_bot_id: string | null;
  created_at: string;
}

interface Message {
  id: string;
  bot_activation_id: string;
  telegram_chat_id: number;
  telegram_user_name: string;
  content: string;
  direction: string;
  created_at: string;
  bot_activations?: {
    bot_token: string;
    personal_user_id: string;
  };
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "qqai18301";

export const Admin = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('adminLoggedIn') === 'true';
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activations, setActivations] = useState<BotActivation[]>([]);
  const [allCodes, setAllCodes] = useState<ActivationCode[]>([]);
  const [newBotToken, setNewBotToken] = useState("");
  const [newPersonalUserId, setNewPersonalUserId] = useState("");
  const [newGreetingMessage, setNewGreetingMessage] = useState("你好！👋 有什么可以帮助你的吗？");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // 激活码生成相关
  const [showCodeGenerator, setShowCodeGenerator] = useState(false);
  const [showCodeList, setShowCodeList] = useState(false);
  const [codeCount, setCodeCount] = useState("10");
  const [codeExpiryDate, setCodeExpiryDate] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 聊天监控相关
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 激活码绑定相关
  const [bindingBotId, setBindingBotId] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  
  // 用户列表展开相关
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  
  // 禁用用户相关
  const [disabledUsers, setDisabledUsers] = useState<Set<string>>(new Set());
  
  // 图片预览相关
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    if (isLoggedIn) {
      loadActivations();
      loadAllCodes();
      loadAllMessages();
      loadDisabledUsers();
      const interval = setInterval(() => {
        loadActivations();
        loadAllCodes();
        loadAllMessages();
        loadDisabledUsers();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedChatId]);

  const loadActivations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'list' }
      });
      
      if (error) throw error;
      if (data.ok) {
        setActivations(data.data || []);
      }
    } catch (error) {
      console.error('加载激活列表失败:', error);
    }
  };

  const loadAllCodes = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'list-codes' }
      });
      
      if (error) throw error;
      if (data.ok) {
        setAllCodes(data.data || []);
      }
    } catch (error) {
      console.error('加载激活码列表失败:', error);
    }
  };

  const loadAllMessages = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'list-all-messages' }
      });
      
      if (error) throw error;
      if (data.ok) {
        setAllMessages(data.data || []);
      }
    } catch (error) {
      console.error('加载消息列表失败:', error);
    }
  };

  const loadDisabledUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'list-disabled-users' }
      });
      
      if (error) throw error;
      if (data.ok) {
        setDisabledUsers(new Set((data.data || []).map((d: any) => d.user_id)));
      }
    } catch (error) {
      console.error('加载禁用用户列表失败:', error);
    }
  };

  const handleToggleDisableUser = async (userId: string, isCurrentlyDisabled: boolean) => {
    // 立即更新本地状态
    setDisabledUsers(prev => {
      const next = new Set(prev);
      if (isCurrentlyDisabled) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });

    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'toggle-user-disabled',
          userId,
          disabled: !isCurrentlyDisabled
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: isCurrentlyDisabled ? "已解禁" : "已禁用",
        description: isCurrentlyDisabled ? "用户已恢复正常使用" : "用户已被禁止操作",
      });
    } catch (error: any) {
      // 恢复原状态
      setDisabledUsers(prev => {
        const next = new Set(prev);
        if (isCurrentlyDisabled) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
      
      toast({
        title: "操作失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLogin = () => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      localStorage.setItem('adminLoggedIn', 'true');
      toast({
        title: "登录成功",
        description: "欢迎访问管理后台",
      });
    } else {
      toast({
        title: "登录失败",
        description: "用户名或密码错误",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('adminLoggedIn');
    toast({
      title: "已退出",
      description: "您已成功退出管理后台",
    });
  };

  const handleAddActivation = async () => {
    if (!newBotToken || !newPersonalUserId || !newExpiryDate) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'create',
          botToken: newBotToken,
          personalUserId: newPersonalUserId,
          greetingMessage: newGreetingMessage,
          expireAt: new Date(newExpiryDate).toISOString(),
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      const botLink = `${window.location.origin}/activate/${data.data.activation_code}`;
      navigator.clipboard.writeText(botLink);
      
      toast({
        title: "添加成功",
        description: "激活链接已复制到剪贴板",
      });
      
      setNewBotToken("");
      setNewPersonalUserId("");
      setNewGreetingMessage("你好！👋 有什么可以帮助你的吗？");
      setNewExpiryDate("");
      loadActivations();
      loadAllCodes();
    } catch (error: any) {
      toast({
        title: "添加失败",
        description: error.message || "创建激活失败",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCodes = async () => {
    const count = parseInt(codeCount);
    if (isNaN(count) || count < 1 || count > 100) {
      toast({
        title: "错误",
        description: "请输入1-100之间的数量",
        variant: "destructive",
      });
      return;
    }

    if (!codeExpiryDate) {
      toast({
        title: "错误",
        description: "请选择有效期",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'generate-codes',
          count,
          expireAt: new Date(codeExpiryDate).toISOString(),
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      setGeneratedCodes(data.codes || []);
      toast({
        title: "生成成功",
        description: `已生成 ${count} 个激活码`,
      });
      loadAllCodes();
    } catch (error: any) {
      toast({
        title: "生成失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyAllCodes = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    toast({
      title: "复制成功",
      description: "所有激活码已复制到剪贴板",
    });
  };

  const handleDeleteActivation = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'delete', id }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "删除成功",
        description: "激活和Webhook已删除",
      });
      loadActivations();
      loadAllCodes();
    } catch (error: any) {
      toast({
        title: "删除失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = (code: string) => {
    const botLink = `${window.location.origin}/activate/${code}`;
    navigator.clipboard.writeText(botLink);
    toast({
      title: "复制成功",
      description: "激活链接已复制到剪贴板",
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "复制成功",
      description: "激活码已复制到剪贴板",
    });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'toggle', id, isActive: !currentActive }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "状态已更新",
        description: currentActive ? "机器人已停止" : "机器人已启动",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "操作失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAuthorize = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'admin-authorize', id }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "激活成功",
        description: "机器人已授权激活",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "激活失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExtendDate = async (id: string, newDate: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { action: 'extend', id, expireAt: new Date(newDate).toISOString() }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "日期已更新",
        description: "过期日期已延长",
      });
      loadActivations();
    } catch (error: any) {
      toast({
        title: "更新失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTogglePort = async (id: string, portType: 'web' | 'app', currentValue: boolean) => {
    // 立即更新本地状态以实现即时响应
    setActivations(prev => prev.map(a => {
      if (a.id === id) {
        return {
          ...a,
          [portType === 'web' ? 'web_enabled' : 'app_enabled']: !currentValue
        };
      }
      return a;
    }));

    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'toggle-port', 
          id, 
          portType,
          enabled: !currentValue 
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "端口状态已更新",
        description: `${portType === 'web' ? 'Web' : 'App'}端口已${!currentValue ? '启用' : '禁用'}`,
      });
    } catch (error: any) {
      // 恢复原状态
      setActivations(prev => prev.map(a => {
        if (a.id === id) {
          return {
            ...a,
            [portType === 'web' ? 'web_enabled' : 'app_enabled']: currentValue
          };
        }
        return a;
      }));
      toast({
        title: "操作失败",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // 管理员绑定激活码
  const handleBindCode = async (botId: string) => {
    if (!activationCode.trim()) {
      toast({
        title: "错误",
        description: "请输入激活码",
        variant: "destructive",
      });
      return;
    }

    setIsBinding(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'bind-existing',
          activationCode: activationCode.trim(),
          botId: botId
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "绑定成功",
        description: "激活码已成功绑定，机器人已激活",
      });
      setActivationCode("");
      setBindingBotId(null);
      loadActivations();
      loadAllCodes();
    } catch (error: any) {
      toast({
        title: "绑定失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBinding(false);
    }
  };

  const handleAdminReply = async () => {
    if (!replyMessage.trim() || !selectedBotId || !selectedChatId) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'admin-send-message',
          botActivationId: selectedBotId,
          chatId: selectedChatId,
          message: replyMessage,
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      setReplyMessage("");
      loadAllMessages();
      toast({
        title: "发送成功",
        description: "消息已发送",
      });
    } catch (error: any) {
      toast({
        title: "发送失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // 获取激活码状态
  const getCodeStatus = (code: ActivationCode) => {
    if (!code.is_used) {
      return { text: '未使用', color: 'bg-green-500/20 text-green-700 dark:text-green-300' };
    }
    return { text: '已使用', color: 'bg-gray-500/20 text-gray-700 dark:text-gray-300' };
  };

  // 获取唯一的聊天列表
  const getUniqueChats = () => {
    const chatMap = new Map<string, { chatId: number; botId: string; userName: string; lastMessage: Message }>();
    
    allMessages.forEach(msg => {
      const key = `${msg.bot_activation_id}-${msg.telegram_chat_id}`;
      const existing = chatMap.get(key);
      if (!existing || new Date(msg.created_at) > new Date(existing.lastMessage.created_at)) {
        chatMap.set(key, {
          chatId: msg.telegram_chat_id,
          botId: msg.bot_activation_id,
          userName: msg.telegram_user_name || '未知用户',
          lastMessage: msg,
        });
      }
    });
    
    return Array.from(chatMap.values()).sort((a, b) => 
      new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  };

  // 获取选中聊天的消息
  const getSelectedChatMessages = () => {
    if (!selectedBotId || !selectedChatId) return [];
    return allMessages
      .filter(msg => msg.bot_activation_id === selectedBotId && msg.telegram_chat_id === selectedChatId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Telegram机器人管理后台</h1>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">用户名</label>
              <Input
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">密码</label>
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-2"
              />
            </div>
            <Button onClick={handleLogin} className="w-full">
              登录
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 过滤出真实的机器人（非PENDING）
  const realBots = activations.filter(a => a.bot_token !== 'PENDING');

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Telegram机器人授权管理</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCodeList(true)}>
              <List className="h-4 w-4 mr-2" />
              激活码列表
            </Button>
            <Button variant="outline" onClick={() => setShowCodeGenerator(true)}>
              <Key className="h-4 w-4 mr-2" />
              生成激活码
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              仪表盘
            </TabsTrigger>
            <TabsTrigger value="bots">
              <Bot className="h-4 w-4 mr-2" />
              机器人管理
            </TabsTrigger>
            <TabsTrigger value="monitor">
              <MessageSquare className="h-4 w-4 mr-2" />
              聊天监控
            </TabsTrigger>
          </TabsList>

          {/* 仪表盘 */}
          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-500/20 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{new Set(activations.filter(a => a.user_id).map(a => a.user_id)).size}</div>
                    <div className="text-sm text-muted-foreground">注册用户</div>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-500/20 rounded-lg">
                    <Bot className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{realBots.length}</div>
                    <div className="text-sm text-muted-foreground">机器人总数</div>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500/20 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{allMessages.length}</div>
                    <div className="text-sm text-muted-foreground">消息总数</div>
                  </div>
                </div>
              </Card>
            </div>

            {/* 用户列表 */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" />
                用户列表
              </h2>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户邮箱</TableHead>
                      <TableHead>用户ID</TableHead>
                      <TableHead>机器人数量</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const userMap = new Map<string, { email?: string; botCount: number; authorizedCount: number; bots: BotActivation[] }>();
                      realBots.forEach(bot => {
                        if (bot.user_id) {
                          const existing = userMap.get(bot.user_id) || { email: bot.user_email, botCount: 0, authorizedCount: 0, bots: [] };
                          existing.botCount++;
                          existing.bots.push(bot);
                          if (bot.is_authorized) existing.authorizedCount++;
                          if (bot.user_email) existing.email = bot.user_email;
                          userMap.set(bot.user_id, existing);
                        }
                      });
                      return Array.from(userMap.entries()).map(([userId, info]) => {
                        const isExpanded = expandedUsers.has(userId);
                        return (
                          <>
                            <TableRow key={userId}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {info.email || '-'}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm(`确定要删除用户 ${info.email || userId} 吗？这将解绑该用户的所有机器人。`)) {
                                        // 解绑该用户所有机器人
                                        info.bots.forEach(bot => {
                                          supabase.functions.invoke('manage-bot', {
                                            body: { action: 'unbind-user', id: bot.id }
                                          });
                                        });
                                        toast({
                                          title: "已解绑",
                                          description: `用户 ${info.email || userId} 的机器人已解绑`,
                                        });
                                        loadActivations();
                                      }
                                    }}
                                    title="删除用户绑定"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                  <Switch
                                    checked={disabledUsers.has(userId)}
                                    onCheckedChange={() => handleToggleDisableUser(userId, disabledUsers.has(userId))}
                                    className="data-[state=checked]:bg-destructive h-5 w-9"
                                    title={disabledUsers.has(userId) ? '点击解禁' : '点击禁用'}
                                  />
                                  {disabledUsers.has(userId) && (
                                    <span className="text-xs text-destructive">已禁用</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{userId.substring(0, 8)}...</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {info.botCount}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      setExpandedUsers(prev => {
                                        const next = new Set(prev);
                                        if (next.has(userId)) {
                                          next.delete(userId);
                                        } else {
                                          next.add(userId);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={info.authorizedCount > 0 ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'}>
                                  {info.authorizedCount > 0 ? `${info.authorizedCount}个已激活` : '试用中'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard.writeText(userId);
                                    toast({ title: "已复制", description: "用户ID已复制到剪贴板" });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {isExpanded && info.bots.map(bot => {
                              const botExpired = bot.expire_at && new Date(bot.expire_at) < new Date();
                              return (
                                <TableRow key={`${userId}-${bot.id}`} className="bg-muted/50">
                                  <TableCell colSpan={2} className="pl-8">
                                    <div className="flex items-center gap-2">
                                      <Bot className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-mono text-xs">{bot.bot_token.substring(0, 20)}...</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs">{bot.trial_messages_used}/{bot.trial_limit} 消息</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1 flex-wrap">
                                      {bot.is_authorized ? (
                                        <Badge className="bg-blue-500/20 text-blue-700 text-xs">已激活</Badge>
                                      ) : (
                                        <Badge className="bg-yellow-500/20 text-yellow-700 text-xs">试用</Badge>
                                      )}
                                      {botExpired && <Badge variant="destructive" className="text-xs">已过期</Badge>}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-muted-foreground">
                                      {bot.expire_at ? new Date(bot.expire_at).toLocaleDateString('zh-CN') : '-'}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>

            {/* 机器人列表概览 */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Bot className="h-5 w-5" />
                机器人列表
              </h2>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>机器人令牌</TableHead>
                      <TableHead>所属用户</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>消息数</TableHead>
                      <TableHead>过期日期</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realBots.map(bot => {
                      const isExpired = bot.expire_at && new Date(bot.expire_at) < new Date();
                      return (
                        <TableRow key={bot.id}>
                          <TableCell className="font-mono text-xs">{bot.bot_token.substring(0, 15)}...</TableCell>
                          <TableCell>{bot.user_email || (bot.user_id ? `${bot.user_id.substring(0, 8)}...` : '未绑定')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              <Badge className={bot.is_active && !isExpired ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-500'}>
                                {bot.is_active && !isExpired ? '运行中' : '已停止'}
                              </Badge>
                              {bot.is_authorized ? (
                                <Badge className="bg-blue-500/20 text-blue-700">已激活</Badge>
                              ) : (
                                <Badge className="bg-yellow-500/20 text-yellow-700">试用</Badge>
                              )}
                              {isExpired && <Badge variant="destructive">已过期</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{bot.trial_messages_used}/{bot.trial_limit}</TableCell>
                          <TableCell>{bot.expire_at ? new Date(bot.expire_at).toLocaleDateString('zh-CN') : '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="bots" className="space-y-4">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">添加新的授权</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">机器人令牌 *</label>
                  <Input
                    placeholder="输入机器人令牌..."
                    value={newBotToken}
                    onChange={(e) => setNewBotToken(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">个人用户ID *</label>
                  <Input
                    placeholder="输入个人用户ID..."
                    value={newPersonalUserId}
                    onChange={(e) => setNewPersonalUserId(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">欢迎消息</label>
                  <Input
                    placeholder="输入欢迎消息..."
                    value={newGreetingMessage}
                    onChange={(e) => setNewGreetingMessage(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">过期日期 *</label>
                  <Input
                    type="date"
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              <Button onClick={handleAddActivation} className="mt-4" disabled={isLoading}>
                {isLoading ? "添加中..." : "添加授权"}
              </Button>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">授权列表 ({realBots.length})</h2>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4 pr-4">
                  {realBots.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">暂无授权记录</p>
                  ) : (
                    realBots.map((activation) => {
                      const isExpired = activation.expire_at && new Date(activation.expire_at) < new Date();
                      const trialExceeded = !activation.is_authorized && activation.trial_messages_used >= activation.trial_limit;
                      
                      // 查找绑定的激活码信息
                      const boundCode = allCodes.find(c => c.used_by_bot_id === activation.id);
                      
                      return (
                        <Card key={activation.id} className={`p-4 ${isExpired || trialExceeded ? 'border-destructive' : ''}`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  activation.is_active && !isExpired 
                                    ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                                    : 'bg-gray-500/20 text-gray-700 dark:text-gray-300'
                                }`}>
                                  {activation.is_active && !isExpired ? '运行中' : '已停止'}
                                </span>
                                {activation.is_authorized ? (
                                  <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    已激活
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                                    <XCircle className="h-3 w-3" />
                                    试用中
                                  </span>
                                )}
                                {isExpired && (
                                  <span className="px-2 py-1 rounded text-xs font-semibold bg-destructive/20 text-destructive">
                                    已过期
                                  </span>
                                )}
                                {trialExceeded && (
                                  <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-700 dark:text-red-300">
                                    试用已满
                                  </span>
                                )}
                                <span className="px-2 py-1 rounded text-xs font-semibold bg-purple-500/20 text-purple-700 dark:text-purple-300">
                                  消息: {activation.trial_messages_used}/{activation.trial_limit}
                                </span>
                              </div>
                              <div className="grid md:grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="font-medium">机器人令牌:</span> {activation.bot_token.substring(0, 15)}...
                                </div>
                                <div>
                                  <span className="font-medium">个人ID:</span> {activation.personal_user_id}
                                </div>
                                <div>
                                  <span className="font-medium">激活码:</span> {activation.activation_code}
                                </div>
                                <div>
                                  <span className="font-medium">过期日期:</span> {activation.expire_at ? new Date(activation.expire_at).toLocaleDateString('zh-CN') : '无'}
                                </div>
                                <div className="md:col-span-2">
                                  <span className="font-medium">所属用户:</span>{' '}
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {activation.user_email || (activation.user_id ? `ID: ${activation.user_id.substring(0, 8)}...` : '游客/未绑定')}
                                  </span>
                                </div>
                              </div>
                              
                              {/* 显示用户绑定的激活码 */}
                              {boundCode && (
                                <div className="text-sm text-muted-foreground">
                                  <span className="font-medium">绑定激活码:</span> {boundCode.code}
                                </div>
                              )}
                              
                              {/* 过期或未授权机器人的激活码绑定 */}
                              {(isExpired || !activation.is_authorized) && (
                                <div className="pt-2 border-t mt-2">
                                  {bindingBotId === activation.id ? (
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="输入激活码..."
                                        value={activationCode}
                                        onChange={(e) => setActivationCode(e.target.value)}
                                        className="flex-1"
                                      />
                                      <Button 
                                        size="sm" 
                                        onClick={() => handleBindCode(activation.id)}
                                        disabled={isBinding}
                                      >
                                        {isBinding ? '绑定中...' : '绑定'}
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => {
                                          setBindingBotId(null);
                                          setActivationCode("");
                                        }}
                                      >
                                        取消
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setBindingBotId(activation.id)}
                                      className="w-full"
                                    >
                                      <Key className="h-4 w-4 mr-2" />
                                      {isExpired ? '续期激活' : '绑定激活码'}
                                    </Button>
                                  )}
                                </div>
                              )}
                              
                              {/* 端口控制开关 */}
                              <div className="flex items-center gap-6 pt-2 border-t mt-2">
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4 text-muted-foreground" />
                                  <Label htmlFor={`web-${activation.id}`} className="text-sm">Web端</Label>
                                  <Switch
                                    id={`web-${activation.id}`}
                                    checked={activation.web_enabled !== false}
                                    onCheckedChange={() => handleTogglePort(activation.id, 'web', activation.web_enabled !== false)}
                                    className="data-[state=checked]:bg-green-500"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                                  <Label htmlFor={`app-${activation.id}`} className="text-sm">App端</Label>
                                  <Switch
                                    id={`app-${activation.id}`}
                                    checked={activation.app_enabled !== false}
                                    onCheckedChange={() => handleTogglePort(activation.id, 'app', activation.app_enabled !== false)}
                                    className="data-[state=checked]:bg-green-500"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4 flex-wrap">
                              {!activation.is_authorized && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleAuthorize(activation.id)}
                                  title="授权激活"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopyLink(activation.activation_code)}
                                title="复制激活链接"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={activation.is_active ? "destructive" : "default"}
                                onClick={() => handleToggleActive(activation.id, activation.is_active)}
                              >
                                {activation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                              </Button>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <Calendar className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>延长使用日期</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <Input
                                      type="date"
                                      defaultValue={activation.expire_at ? activation.expire_at.split('T')[0] : ''}
                                      onChange={(e) => {
                                        const newDate = e.target.value;
                                        if (newDate) {
                                          handleExtendDate(activation.id, newDate);
                                        }
                                      }}
                                    />
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteActivation(activation.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="monitor" className="space-y-4">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">聊天监控</h2>
              <div className="grid md:grid-cols-3 gap-4 h-[600px]">
                {/* 聊天列表 */}
                <div className="border rounded-lg">
                  <div className="p-3 border-b font-medium">聊天列表</div>
                  <ScrollArea className="h-[540px]">
                    <div className="p-2 space-y-2">
                      {getUniqueChats().map((chat) => {
                        const bot = activations.find(a => a.id === chat.botId);
                        const isSelected = selectedBotId === chat.botId && selectedChatId === chat.chatId;
                        
                        return (
                          <div
                            key={`${chat.botId}-${chat.chatId}`}
                            className={`p-3 rounded-lg cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/20' : 'hover:bg-muted'
                            }`}
                            onClick={() => {
                              setSelectedBotId(chat.botId);
                              setSelectedChatId(chat.chatId);
                            }}
                          >
                            <div className="font-medium text-sm truncate">{chat.userName}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              Bot: {bot?.bot_token.substring(0, 10)}...
                            </div>
                            {bot?.user_email && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 truncate">
                                用户: {bot.user_email}
                              </div>
                            )}
                            {bot?.user_id && !bot?.user_email && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 truncate">
                                用户ID: {bot.user_id.substring(0, 8)}...
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {chat.lastMessage.content.substring(0, 30)}...
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* 消息区域 */}
                <div className="md:col-span-2 border rounded-lg flex flex-col">
                  <div className="p-3 border-b font-medium">
                    {selectedChatId ? `对话 - ChatID: ${selectedChatId}` : '选择一个聊天'}
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {getSelectedChatMessages().map((msg) => {
                        // 检测是否为图片消息
                        const isImageMessage = msg.content.startsWith('[图片]');
                        const imageMatch = msg.content.match(/\[图片\]\s*(https?:\/\/[^\s]+)/);
                        const imageUrl = imageMatch ? imageMatch[1] : null;
                        const isExpiredImage = msg.content.includes('[图片](已过期)');
                        
                        // 构建图片代理URL
                        const getProxyImageUrl = (url: string) => {
                          const bot = activations.find(a => a.id === msg.bot_activation_id);
                          if (!bot) return url;
                          return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-telegram-image?file_url=${encodeURIComponent(url)}&bot_token=${encodeURIComponent(bot.bot_token)}`;
                        };
                        
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[70%] p-3 rounded-lg ${
                                msg.direction === 'outgoing'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              <div className="text-xs opacity-70 mb-1">
                                {msg.telegram_user_name} · {new Date(msg.created_at).toLocaleString('zh-CN')}
                              </div>
                                {isImageMessage && imageUrl && !isExpiredImage ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1 text-xs opacity-70">
                                    <ImageIcon className="h-3 w-3" />
                                    图片消息
                                  </div>
                                  <div className="relative group">
                                    <img 
                                      src={getProxyImageUrl(imageUrl)} 
                                      alt="图片消息" 
                                      className="max-w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
                                      style={{ maxHeight: '200px' }}
                                      onClick={() => setPreviewImage(getProxyImageUrl(imageUrl))}
                                    />
                                    <div 
                                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                                      onClick={() => setPreviewImage(getProxyImageUrl(imageUrl))}
                                    >
                                      <ZoomIn className="h-8 w-8 text-white" />
                                    </div>
                                  </div>
                                </div>
                              ) : isExpiredImage ? (
                                <div className="flex items-center gap-2 text-sm opacity-70">
                                  <ImageIcon className="h-4 w-4" />
                                  <span>[图片已过期]</span>
                                </div>
                              ) : (
                                <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  
                  {/* 回复输入 */}
                  {selectedChatId && (
                    <div className="p-3 border-t flex gap-2">
                      <Input
                        placeholder="输入回复消息..."
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleAdminReply()}
                      />
                      <Button onClick={handleAdminReply} disabled={isSending || !replyMessage.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 激活码生成对话框 */}
      <Dialog open={showCodeGenerator} onOpenChange={setShowCodeGenerator}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量生成激活码</DialogTitle>
            <DialogDescription>
              生成的激活码可供用户绑定机器人使用
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>生成数量</Label>
              <Input
                type="number"
                min="1"
                max="100"
                placeholder="输入数量 (1-100)"
                value={codeCount}
                onChange={(e) => setCodeCount(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>有效期至</Label>
              <Input
                type="date"
                value={codeExpiryDate}
                onChange={(e) => setCodeExpiryDate(e.target.value)}
                className="mt-2"
              />
            </div>
            <Button 
              onClick={handleGenerateCodes} 
              className="w-full"
              disabled={isGenerating}
            >
              {isGenerating ? '生成中...' : '生成激活码'}
            </Button>
            
            {generatedCodes.length > 0 && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">已生成的激活码:</span>
                  <Button size="sm" variant="outline" onClick={handleCopyAllCodes}>
                    <Copy className="h-4 w-4 mr-1" />
                    复制全部
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {generatedCodes.map((code, index) => (
                    <div key={index} className="text-sm font-mono bg-background p-1 rounded">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 激活码列表对话框 */}
      <Dialog open={showCodeList} onOpenChange={setShowCodeList}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>激活码列表</DialogTitle>
            <DialogDescription>
              查看所有激活码的使用状态
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {allCodes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无激活码</p>
              ) : (
                allCodes.map((code) => {
                  const status = getCodeStatus(code);
                  const isExpired = code.expire_at && new Date(code.expire_at) < new Date();
                  
                  return (
                    <div 
                      key={code.id} 
                      className={`flex items-center justify-between p-3 border rounded-lg ${isExpired ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{code.code}</span>
                        <Badge className={status.color}>{status.text}</Badge>
                        {isExpired && (
                          <Badge variant="destructive">已过期</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {code.expire_at ? `有效期至: ${new Date(code.expire_at).toLocaleDateString('zh-CN')}` : '永久有效'}
                        </span>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleCopyCode(code.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* 图片预览对话框 */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-black/90">
          <DialogHeader className="absolute top-2 right-2 z-10">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex items-center justify-center p-4">
            {previewImage && (
              <img 
                src={previewImage} 
                alt="预览图片" 
                className="max-w-full max-h-[85vh] object-contain rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;