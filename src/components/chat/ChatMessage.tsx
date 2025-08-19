import React from 'react';
import { Message } from '../../types';

interface ChatMessageProps {
  message: Message;
  isOwnMessage: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isOwnMessage }) => {
  return (
    <div className={`chat-message ${isOwnMessage ? 'own-message' : 'other-message'}`}>
      <div className="message-bubble">
        <div className="message-sender">{message.sender}</div>
        <div className="message-text">{message.text}</div>
        <div className="message-time">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;