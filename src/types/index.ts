export interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

// 以太坊RPC相关类型
export interface EthCallRequest {
  to: string;
  data: string;
  blockNumber?: string;
}

export interface EthCallErrorType {
  type: 'execution_reverted' | 'insufficient_funds' | 'gas_limit' | 'invalid_address' | 'unknown';
  message: string;
  originalError?: any;
}