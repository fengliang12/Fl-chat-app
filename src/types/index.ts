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