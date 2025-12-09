import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Play, Pause, Calendar, Copy, CheckCircle, XCircle, Key, Globe, Smartphone, List, MessageSquare, Send, LayoutDashboard, Users, Bot, Image as ImageIcon, ChevronDown, ChevronUp, X, ZoomIn, Loader2, Database } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { DataExportImport } from "@/components/DataExportImport";

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

export const Admin = () => {
  const { user, session, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  
  // 登录表单
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
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
  
  // 数据导出导入对话框
  const [showDataExportImport, setShowDataExportImport] = useState(false);
  
  const { toast } = useToast();

  // 检查用户是否是管理员
  useEffect(() => {
    const checkAdminRole = async () => {
      if (authLoading) return;
      
      if (!user) {
        setIsAdmin(false);
        setIsCheckingRole(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (error) {
          console.error('检查管理员角色失败:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(data === true);
        }
      } catch (error) {
        console.error('检查管理员角色错误:', error);
        setIsAdmin(false);
      } finally {
        setIsCheckingRole(false);
      }
    };

    checkAdminRole();
  }, [user, authLoading]);

  useEffect(() => {
    // 确保 session 存在再调用 API
    if (isAdmin && session) {
      loadActivations();
      loadAllCodes();
      loadAllMessages();
      loadDisabledUsers();
      const interval = setInterval(() => {
        if (session) {
          loadActivations();
          loadAllCodes();
          loadAllMessages();
          loadDisabledUsers();
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedChatId]);

  const loadActivations = async () => {
    if (!session) return;
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
    if (!session) return;
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
    if (!session) return;
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
    if (!session) return;
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

  const handleLogin = async () => {
    if (!email || !password) {
      toast({
        title: "错误",
        description: "请输入邮箱和密码",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // 登录成功后，useAuth 会自动更新状态，触发 checkAdminRole
      toast({
        title: "登录成功",
        description: "正在验证管理员权限...",
      });
    } catch (error: any) {
      toast({
        title: "登录失败",
        description: error.message || "邮箱或密码错误",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(null);
    setIsCheckingRole(true);
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

  // 加载中状态
  if (authLoading || isCheckingRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 w-full max-w-md flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">正在验证权限...</p>
        </Card>
      </div>
    );
  }

  // 未登录或非管理员
  if (!user || isAdmin === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Telegram机器人管理后台</h1>
          {user && isAdmin === false ? (
            <div className="text-center space-y-4">
              <p className="text-destructive">您没有管理员权限</p>
              <p className="text-sm text-muted-foreground">当前账号: {user.email}</p>
              <Button onClick={handleLogout} variant="outline" className="w-full">
                退出登录
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">管理员邮箱</label>
                <Input
                  type="email"
                  placeholder="请输入管理员邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              <Button onClick={handleLogin} className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    登录中...
                  </>
                ) : (
                  "登录"
                )}
              </Button>
            </div>
          )}
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
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button variant="outline" onClick={() => setShowDataExportImport(true)}>
              <Database className="h-4 w-4 mr-2" />
              数据管理
            </Button>
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
                                            body: { action: 'delete', id: bot.id }
                                          });
                                        });
                                        loadActivations();
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
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
                                        if (isExpanded) {
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
                                <Badge variant={info.authorizedCount > 0 ? "default" : "secondary"}>
                                  {info.authorizedCount}/{info.botCount} 已授权
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={!disabledUsers.has(userId)}
                                    onCheckedChange={() => handleToggleDisableUser(userId, disabledUsers.has(userId))}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {disabledUsers.has(userId) ? '已禁用' : '正常'}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && info.bots.map(bot => (
                              <TableRow key={bot.id} className="bg-muted/30">
                                <TableCell colSpan={2} className="pl-8">
                                  <span className="font-mono text-xs">{bot.bot_token.substring(0, 20)}...</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs">{bot.trial_messages_used}/{bot.trial_limit}</span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={bot.is_authorized ? "default" : bot.expire_at && new Date(bot.expire_at) < new Date() ? "destructive" : "secondary"}>
                                    {bot.is_authorized ? '已激活' : bot.expire_at && new Date(bot.expire_at) < new Date() ? '已过期' : '试用中'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {bot.expire_at ? new Date(bot.expire_at).toLocaleDateString() : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </TabsContent>

          {/* 机器人管理 */}
          <TabsContent value="bots" className="space-y-4">
            {/* 添加机器人表单 */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">添加新机器人</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label>机器人令牌</Label>
                  <Input
                    value={newBotToken}
                    onChange={(e) => setNewBotToken(e.target.value)}
                    placeholder="Bot Token"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>个人用户ID</Label>
                  <Input
                    value={newPersonalUserId}
                    onChange={(e) => setNewPersonalUserId(e.target.value)}
                    placeholder="Personal User ID"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>问候语</Label>
                  <Input
                    value={newGreetingMessage}
                    onChange={(e) => setNewGreetingMessage(e.target.value)}
                    placeholder="问候消息"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>过期日期</Label>
                  <Input
                    type="date"
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              <Button onClick={handleAddActivation} className="mt-4" disabled={isLoading}>
                {isLoading ? "添加中..." : "添加激活"}
              </Button>
            </Card>

            {/* 机器人列表 */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">机器人列表</h2>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {realBots.map((activation) => (
                    <Card key={activation.id} className="p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{activation.bot_token.substring(0, 30)}...</span>
                              <Badge variant={activation.is_active ? "default" : "secondary"}>
                                {activation.is_active ? "运行中" : "已停止"}
                              </Badge>
                              <Badge variant={activation.is_authorized ? "default" : "outline"}>
                                {activation.is_authorized ? "已激活" : "试用中"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              用户: {activation.user_email || activation.user_id?.substring(0, 8) || '无'}
                              {" | "}消息: {activation.trial_messages_used}/{activation.trial_limit}
                              {activation.expire_at && ` | 到期: ${new Date(activation.expire_at).toLocaleDateString()}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleActive(activation.id, activation.is_active)}
                            >
                              {activation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopyLink(activation.activation_code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleDeleteActivation(activation.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Globe className={`h-4 w-4 ${activation.web_enabled !== false ? 'text-green-500' : 'text-gray-400'}`} />
                            <Switch
                              checked={activation.web_enabled !== false}
                              onCheckedChange={() => handleTogglePort(activation.id, 'web', activation.web_enabled !== false)}
                            />
                            <span className="text-xs">Web</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Smartphone className={`h-4 w-4 ${activation.app_enabled !== false ? 'text-green-500' : 'text-gray-400'}`} />
                            <Switch
                              checked={activation.app_enabled !== false}
                              onCheckedChange={() => handleTogglePort(activation.id, 'app', activation.app_enabled !== false)}
                            />
                            <span className="text-xs">App</span>
                          </div>
                          {!activation.is_authorized && (
                            <Button size="sm" variant="outline" onClick={() => handleAuthorize(activation.id)}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              授权
                            </Button>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <Input
                              type="date"
                              className="w-40 h-8"
                              defaultValue={activation.expire_at ? activation.expire_at.split('T')[0] : ''}
                              onChange={(e) => handleExtendDate(activation.id, e.target.value)}
                            />
                          </div>
                        </div>

                        {bindingBotId === activation.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={activationCode}
                              onChange={(e) => setActivationCode(e.target.value)}
                              placeholder="输入激活码"
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleBindCode(activation.id)}
                              disabled={isBinding}
                            >
                              {isBinding ? "绑定中..." : "绑定"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
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
                            variant="ghost"
                            onClick={() => setBindingBotId(activation.id)}
                          >
                            <Key className="h-4 w-4 mr-1" />
                            绑定激活码
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>

          {/* 聊天监控 */}
          <TabsContent value="monitor" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4 h-[600px]">
              {/* 聊天列表 */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">聊天列表</h3>
                <ScrollArea className="h-[530px]">
                  <div className="space-y-2">
                    {getUniqueChats().map(chat => {
                      const bot = activations.find(a => a.id === chat.botId);
                      return (
                        <div
                          key={`${chat.botId}-${chat.chatId}`}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedBotId === chat.botId && selectedChatId === chat.chatId
                              ? 'bg-primary/20'
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => {
                            setSelectedBotId(chat.botId);
                            setSelectedChatId(chat.chatId);
                          }}
                        >
                          <div className="font-medium">{chat.userName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {chat.lastMessage.content}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            机器人: {bot?.bot_token.substring(0, 10)}...
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Card>

              {/* 消息窗口 */}
              <Card className="p-4 md:col-span-2">
                <h3 className="font-semibold mb-3">消息记录</h3>
                {selectedBotId && selectedChatId ? (
                  <>
                    <ScrollArea className="h-[450px] mb-3">
                      <div className="space-y-3">
                        {getSelectedChatMessages().map(msg => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-lg max-w-[80%] ${
                              msg.direction === 'incoming'
                                ? 'bg-muted'
                                : 'bg-primary/20 ml-auto'
                            }`}
                          >
                          {msg.content.startsWith('[图片]') ? (
                              (() => {
                                // 支持两种格式: "[图片] url" 或 "[图片](url)"
                                const urlMatch = msg.content.match(/\[图片\]\s*(?:\((.+?)\)|(.+))$/);
                                const imageUrl = urlMatch?.[1] || urlMatch?.[2]?.trim();
                                const isExpired = !imageUrl || imageUrl.includes('已过期');
                                const bot = activations.find(a => a.id === msg.bot_activation_id);
                                const proxyUrl = imageUrl && !isExpired && bot
                                  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-telegram-image?url=${encodeURIComponent(imageUrl)}&botId=${bot.id}`
                                  : null;
                                
                                return (
                                  <div 
                                    className={isExpired ? "" : "cursor-pointer"}
                                    onClick={() => {
                                      if (proxyUrl) {
                                        setPreviewImage(proxyUrl);
                                      }
                                    }}
                                  >
                                    {proxyUrl ? (
                                      <img 
                                        src={proxyUrl} 
                                        alt="图片消息" 
                                        className="max-w-[200px] max-h-[150px] rounded object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    ) : null}
                                    <div className={`flex items-center gap-2 text-muted-foreground ${proxyUrl ? 'hidden' : ''}`}>
                                      <ImageIcon className="h-4 w-4" />
                                      <span>{isExpired ? '图片已过期' : '图片消息'}</span>
                                      {!isExpired && <ZoomIn className="h-4 w-4" />}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="whitespace-pre-wrap">{msg.content}</div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(msg.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Input
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="输入回复消息..."
                        onKeyPress={(e) => e.key === 'Enter' && handleAdminReply()}
                      />
                      <Button onClick={handleAdminReply} disabled={isSending}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                    选择一个聊天查看消息
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* 生成激活码对话框 */}
        <Dialog open={showCodeGenerator} onOpenChange={setShowCodeGenerator}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>批量生成激活码</DialogTitle>
              <DialogDescription>
                生成的激活码将保存到数据库，可在激活码列表中查看
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>生成数量</Label>
                <Input
                  type="number"
                  value={codeCount}
                  onChange={(e) => setCodeCount(e.target.value)}
                  min="1"
                  max="100"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>有效期</Label>
                <Input
                  type="date"
                  value={codeExpiryDate}
                  onChange={(e) => setCodeExpiryDate(e.target.value)}
                  className="mt-2"
                />
              </div>
              <Button onClick={handleGenerateCodes} disabled={isGenerating} className="w-full">
                {isGenerating ? "生成中..." : "生成激活码"}
              </Button>
              {generatedCodes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">已生成的激活码</span>
                    <Button size="sm" variant="outline" onClick={handleCopyAllCodes}>
                      <Copy className="h-4 w-4 mr-1" />
                      复制全部
                    </Button>
                  </div>
                  <ScrollArea className="h-[200px] border rounded-lg p-2">
                    {generatedCodes.map((code, index) => (
                      <div key={index} className="font-mono text-sm py-1">
                        {code}
                      </div>
                    ))}
                  </ScrollArea>
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
                查看所有生成的激活码及其使用状态
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>激活码</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>有效期</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCodes.map(code => {
                    const status = getCodeStatus(code);
                    return (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono">{code.code}</TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.text}</Badge>
                        </TableCell>
                        <TableCell>
                          {code.expire_at ? new Date(code.expire_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(code.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyCode(code.code)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* 图片预览对话框 */}
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>图片预览</DialogTitle>
            </DialogHeader>
            {previewImage && (
              <div className="flex justify-center">
                <img 
                  src={previewImage} 
                  alt="预览图片" 
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 数据导出导入对话框 */}
        <DataExportImport
          open={showDataExportImport}
          onOpenChange={setShowDataExportImport}
          onDataImported={() => {
            loadActivations();
            loadAllCodes();
            loadAllMessages();
          }}
        />
      </div>
    </div>
  );
};
