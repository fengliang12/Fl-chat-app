import React from 'react';
import './App.css';
import ChatBox from './components/chat/ChatBox';
import { User } from './types';

function App() {
  // 创建一个默认用户
  const currentUser: User = {
    id: 'user1',
    name: '用户',
  };

  return (
    <div className="App">
      <ChatBox currentUser={currentUser} />
    </div>
  );
}

export default App;
