import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { client } from '@/lib/client';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, X, Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIChatbot() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis l\'assistant EDEN VTC 🚗⚡. Comment puis-je vous aider ?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Commander une course', 'Mon portefeuille', 'Aide'
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/chatbot/ask',
        method: 'POST',
        data: {
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        },
        options: { timeout: 60000 },
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (response.data.suggestions?.length > 0) {
        setSuggestions(response.data.suggestions);
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.detail || error?.data?.detail || error?.message || 'Erreur de communication';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Désolé, je rencontre un problème. Veuillez réessayer.',
        timestamp: new Date(),
      }]);
      toast({ title: 'Erreur', description: errMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#1F4E5F] to-[#2a6b7f] text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center hover:scale-110 animate-pulse"
        aria-label="Ouvrir l'assistant"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)]">
      <Card className="shadow-2xl border-[#1F4E5F]/20 overflow-hidden">
        {/* Header */}
        <CardHeader className="bg-gradient-to-r from-[#1F4E5F] to-[#2a6b7f] text-white py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Assistant EDEN VTC</CardTitle>
                <p className="text-xs text-white/70">IA • En ligne</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-8 w-8"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Messages */}
          <ScrollArea className="h-[350px] p-4" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-[#1F4E5F]/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-[#1F4E5F]" />
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1F4E5F] text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-[#C9A227]/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4 text-[#C9A227]" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-[#1F4E5F]/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-[#1F4E5F]" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#1F4E5F]" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Suggestions */}
          {suggestions.length > 0 && !loading && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-[#1F4E5F]/10 text-xs border-[#1F4E5F]/30 text-[#1F4E5F]"
                  onClick={() => sendMessage(s)}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {s}
                </Badge>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question..."
              className="flex-1 text-sm"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="bg-[#1F4E5F] hover:bg-[#1F4E5F]/90 h-9 w-9"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}