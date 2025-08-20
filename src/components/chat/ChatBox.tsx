import React, { useState, useEffect } from 'react';
import { Message, User } from '../../types';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';
import { sendChatMessage } from '../../services/api';

interface ChatBoxProps {
  currentUser: User;
}

const ChatBox: React.FC<ChatBoxProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: '你好！欢迎使用聊天框。',
      sender: 'system',
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // 监听新消息，显示通知
  useEffect(() => {
    // 只有当有消息且不是当前用户发送的消息时才显示通知
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender !== currentUser.id && lastMessage.sender !== 'system') {
      // 这里可以添加浏览器通知或声音提示
      document.title = `新消息: ${lastMessage.text}`;
      
      // 5秒后恢复标题
      const timer = setTimeout(() => {
        document.title = '聊天应用';
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [messages, currentUser.id]);

  const handleSendMessage = async (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: currentUser.id,
      timestamp: new Date(),
    };

    // 添加用户消息到消息列表
    setMessages([...messages, newMessage]);
    setIsTyping(true);

    try {
      // 发送消息到DeepSeek API并获取回复
      const updatedMessages = [...messages, newMessage];
      const reply = await sendChatMessage(updatedMessages);
      
      // 添加AI回复到消息列表
      const aiReply: Message = {
        id: (Date.now() + 1).toString(),
        text: reply,
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, aiReply]);
    } catch (error) {
      console.error('获取AI回复失败:', error);
      // 添加错误消息
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '抱歉，无法获取回复，请稍后再试。',
        sender: 'system',
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="chat-box">
      <div className="chat-header">
        <h2>聊天框</h2>
      </div>
      <ChatMessageList messages={messages} currentUserId={currentUser.id} />
      {isTyping && (
        <div className="typing-indicator">
          <span>正在输入</span>
          <div className="typing-dots">
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
          </div>
        </div>
      )}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};

export default ChatBox;