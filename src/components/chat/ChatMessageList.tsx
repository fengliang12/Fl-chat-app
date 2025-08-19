import React, { useEffect, useRef } from 'react';
import { Message } from '../../types';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  currentUserId: string;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, currentUserId }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chat-message-list">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          isOwnMessage={message.sender === currentUserId}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
export default ChatMessageList;