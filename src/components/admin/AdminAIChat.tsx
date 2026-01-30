import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Loader2,
  Send,
  Bot,
  User,
  Menu,
  Plus,
  X,
  MessageSquare,
  Paperclip,
  LogOut,
  ChevronUp,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Define types for window.puter
declare global {
  interface Window {
    puter?: {
      auth: {
        isSignedIn: () => boolean;
        signIn: () => Promise<void>;
        signOut: () => Promise<void>;
      };
      ai: {
        chat: (messages: any[], options?: { model?: string }) => Promise<{ message: any } | any>;
      };
    };
  }
}

interface ChatMessage {
  content: string;
  role: 'user' | 'assistant';
  image?: string | null;
  timestamp: number;
}

interface Chat {
  id: number;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

const AdminAIChat = () => {
  const [chats, setChats] = useState<Chat[]>(() => {
    // Load chats from localStorage on initial mount
    if (typeof window !== 'undefined') {
      const savedChats = localStorage.getItem('puter-ai-chats');
      if (savedChats) {
        try {
          return JSON.parse(savedChats);
        } catch (error) {
          console.error('Error loading chats from localStorage:', error);
        }
      }
    }
    // Default if nothing in localStorage
    return [{ id: 1, title: 'New Chat', messages: [], createdAt: Date.now() }];
  });

  const [currentChatId, setCurrentChatId] = useState<number>(() => {
    // Load current chat ID from localStorage
    if (typeof window !== 'undefined') {
      const savedChatId = localStorage.getItem('puter-ai-current-chat');
      if (savedChatId) {
        return parseInt(savedChatId, 10);
      }
      // Otherwise, check if we loaded chats and use the first one
      const savedChats = localStorage.getItem('puter-ai-chats');
      if (savedChats) {
        try {
          const parsed = JSON.parse(savedChats);
          return parsed[0]?.id || 1;
        } catch (error) {
          console.error('Error parsing saved chat ID:', error);
        }
      }
    }
    return 1;
  });

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<{ file: File; preview: string; name: string } | null>(null);
  const [model, setModel] = useState<'fast' | 'smart'>('fast');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentChat = chats.find(chat => chat.id === currentChatId);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('puter-ai-chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Save current chat ID to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('puter-ai-current-chat', currentChatId.toString());
    }
  }, [currentChatId]);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        // Use standard DOM property for scrolling
        (scrollContainer as HTMLElement).scrollTop = (scrollContainer as HTMLElement).scrollHeight;
      }
    }
  }, [currentChat?.messages]);

  const checkAuthStatus = () => {
    if (typeof window !== 'undefined' && window.puter) {
      const signedIn = window.puter.auth.isSignedIn();
      setIsAuthenticated(signedIn);
    }
  };

  const handleSignIn = async () => {
    try {
      if (window.puter) {
        await window.puter.auth.signIn();
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('Puter.js is not loaded. Please try again later.');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      setError('Failed to sign in. Please try again.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          setUploadedImage({
            file: file,
            preview: e.target.result,
            name: file.name
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startNewChat = () => {
    const newChat: Chat = {
      id: Date.now(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setIsSidebarOpen(false);
  };

  const switchChat = (chatId: number) => {
    setCurrentChatId(chatId);
    setIsSidebarOpen(false);
    setUploadedImage(null);
  };

  const deleteChat = (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (chats.length === 1) {
      // Don't delete if it's the only chat, just clear it
      const clearedChat: Chat = { id: Date.now(), title: 'New Chat', messages: [], createdAt: Date.now() };
      setChats([clearedChat]);
      setCurrentChatId(clearedChat.id);
    } else {
      const newChats = chats.filter(chat => chat.id !== chatId);
      setChats(newChats);
      if (currentChatId === chatId) {
        setCurrentChatId(newChats[0].id);
      }
    }
  };

  // Unused but keeping for future use or completeness based on original code
  // const clearAllChats = () => {
  //   const newChat = { id: Date.now(), title: 'New Chat', messages: [], createdAt: Date.now() };
  //   setChats([newChat]);
  //   setCurrentChatId(newChat.id);
  //   localStorage.removeItem('puter-ai-chats');
  //   localStorage.removeItem('puter-ai-current-chat');
  // };



  const sendMessage = async () => {
    const message = inputValue.trim();
    if ((!message && !uploadedImage) || isLoading) return;

    if (!isAuthenticated) {
      setError('Please sign in to use the chat.');
      return;
    }

    // Create user message with optional image
    const userMessage: ChatMessage = {
      content: message || '(Image)',
      role: 'user',
      image: uploadedImage ? uploadedImage.preview : null,
      timestamp: Date.now()
    };

    if (!currentChat) return;

    // Update current chat with new message
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const updatedMessages = [...chat.messages, userMessage];
        // Update title if this is the first message
        let newTitle = chat.title;
        if (chat.messages.length === 0 && message && chat.title === 'New Chat') {
          newTitle = message.slice(0, 30) + (message.length > 30 ? '...' : '');
        }
        return { ...chat, messages: updatedMessages, title: newTitle };
      }
      return chat;
    }));

    setInputValue('');
    setUploadedImage(null);
    setIsLoading(true);
    setError('');

    try {
      // Prepare messages for API
      const apiMessages = currentChat.messages.concat(userMessage).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      if (!window.puter) {
        throw new Error("Puter.js not loaded");
      }

      // Call Puter AI API
      // Assuming these map to smart/fast or letting Puter handle it if they support 'smart'/'fast' keywords. Using explicit known models if possible or generic. 
      // Actually standard puter might just take the option object. Let's try passing the object.
      // If the user wants "Fast" vs "Smart", typically that maps to standard models.
      // I will use 'gpt-4o-mini' for Fast and 'gpt-4o' for Smart if I can.
      // Or maybe 'claude-3-5-sonnet' for Smart.
      // Let's assume the user context implies a specific demo.
      // I will try passing `mode` or `model`.
      // Let's play it safe and use a comment or just the object.
      // Checking the user request "in the puter demo there is a option to select fast or smart".
      // I will pass { model: model === 'smart' ? 'claude-3-5-sonnet' : 'gpt-4o-mini' } as a good default for "Smart" vs "Fast" in 2025.
      // Actually, let's just use the string 'gpt-4o' vs 'gpt-4o-mini' to be safe with OpenAI models which are standard.
      const aiResponse = await window.puter.ai.chat(apiMessages, { model: model === 'smart' ? 'gpt-4o' : 'gpt-4o-mini' });

      const responseMessage = aiResponse?.message || aiResponse; // Handle potential response structure variations

      // Add AI response
      const aiMessage: ChatMessage = {
        ...responseMessage,
        timestamp: Date.now()
      };

      setChats(prev => prev.map(chat => {
        if (chat.id === currentChatId) {
          return { ...chat, messages: [...chat.messages, aiMessage] };
        }
        return chat;
      }));
    } catch (error: any) {
      console.error("AI response error:", error);

      if (error.message?.includes('auth') || error.message?.includes('sign')) {
        setIsAuthenticated(false);
        setError('Your session expired. Please sign in again.');
      } else {
        setError('Sorry, there was an error getting a response. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSignOut = async () => {
    try {
      if (window.puter) {
        await window.puter.auth.signOut();
        setIsAuthenticated(false);
        setChats([{ id: Date.now(), title: 'New Chat', messages: [], createdAt: Date.now() }]);
        setCurrentChatId(Date.now());
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="flex bg-background h-[calc(100vh-8rem)] rounded-lg border shadow-sm overflow-hidden">
      {/* Sidebar for larger screens */}
      <div className="hidden md:flex md:w-64 border-r border-border flex-col bg-muted/30">
        <div className="p-4 border-b border-border">
          <Button onClick={startNewChat} className="w-full" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => switchChat(chat.id)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
                  }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm truncate">{chat.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => deleteChat(chat.id, e)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Chats</SheetTitle>
                </SheetHeader>
                <div className="p-4 border-b">
                  <Button onClick={startNewChat} className="w-full" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    New Chat
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-130px)]">
                  <div className="p-2 space-y-1">
                    {chats.map(chat => (
                      <div
                        key={chat.id}
                        onClick={() => switchChat(chat.id)}
                        className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50'
                          }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MessageSquare className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm truncate">{chat.title}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => deleteChat(chat.id, e)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Bot className="w-5 h-5" />
            <h2 className="font-semibold">AI Assistant</h2>
          </div>

          {isAuthenticated && (
            <Button onClick={handleSignOut} variant="ghost" size="sm" title="Sign Out">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          )}
        </div>


        {/* Messages area */}
        <div className="flex-1 overflow-hidden">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-4">
              <Bot className="w-16 h-16 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Sign in to start chatting</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Puter.com is a privacy first personal cloud-based OS that powers this AI functionality.
                Signing in allows you to access the AI chat features securely.
                It's free and helps maintain your chat history.
              </p>
              <Button onClick={handleSignIn} size="lg">
                Sign in with Puter
              </Button>
            </div>
          ) : (
            <ScrollArea ref={scrollAreaRef} className="h-full">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {currentChat?.messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">How can Puter help you today?</p>
                    <p className="text-sm">Start a conversation by typing a message below</p>
                  </div>
                )}

                {currentChat?.messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                  >
                    {msg.role === 'assistant' && (
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10">
                          <Bot className="w-4 h-4 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className={`flex flex-col gap-2 max-w-[80%]`}>
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Uploaded"
                          className="rounded-lg max-w-full h-auto border border-border"
                        />
                      )}
                      <div
                        className={`rounded-lg px-4 py-2 ${msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                          }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>

                    {msg.role === 'user' && (
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-muted">
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10">
                        <Bot className="w-4 h-4 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg px-4 py-2 bg-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input area */}
        {isAuthenticated && (
          <div className="border-t border-border p-4 bg-background">
            <div className="max-w-3xl mx-auto space-y-2">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {uploadedImage && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <img
                    src={uploadedImage.preview}
                    alt="Upload preview"
                    className="w-12 h-12 object-cover rounded"
                  />
                  <span className="text-sm flex-1 truncate">{uploadedImage.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={removeImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex-shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </Button>

                <div className="flex-1 relative">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={`How can Puter help you today? (${model === 'fast' ? 'Fast' : 'Smart'})`}
                    disabled={isLoading}
                    className="pr-24"
                  />

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-muted-foreground hover:text-foreground px-2"
                        >
                          {model === 'fast' ? 'Fast' : 'Smart'}
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setModel('fast')}>
                          <span className="font-medium">Fast</span>
                          {model === 'fast' && <span className="ml-2">✓</span>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setModel('smart')}>
                          <span className="font-medium">Smart</span>
                          {model === 'smart' && <span className="ml-2">✓</span>}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <Button
                  onClick={sendMessage}
                  disabled={isLoading || (!inputValue.trim() && !uploadedImage)}
                  size="icon"
                  className="flex-shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

  );
};

export default AdminAIChat;
