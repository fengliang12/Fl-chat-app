import { Message } from "../types";

// GraphQL API相关类型定义
interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: {
    message: string;
    locations?: { line: number; column: number }[];
    path?: string[];
  }[];
}

interface ChatResult {
  chat: {
    id: string;
    model: string;
    choices: {
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }[];
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

// GraphQL API服务地址
const API_URL = process.env.REACT_APP_API_URL || "https://chat-service.fengqilin5.workers.dev/api/graphql";

/**
 * 发送聊天消息到GraphQL API
 * @param messages 消息历史
 * @returns 返回AI的回复
 */
export const sendChatMessage = async (messages: Message[]): Promise<string> => {
  try {
    // 将消息格式转换为GraphQL API所需格式
    const chatMessages = messages.map((msg) => ({
      role:
        msg.sender === "system" || msg.sender === "assistant"
          ? "assistant"
          : "user",
      content: msg.text,
    }));

    // 只保留最近的10条消息，避免超出token限制
    const recentMessages = chatMessages.slice(-10);

    // 构建GraphQL查询
    const query = `
      mutation Chat($messages: [MessageInput!]!, $temperature: Float, $maxTokens: Int) {
        chat(messages: $messages, temperature: $temperature, maxTokens: $maxTokens) {
          id
          model
          choices {
            message {
              role
              content
            }
            finish_reason
          }
          usage {
            prompt_tokens
            completion_tokens
            total_tokens
          }
        }
      }
    `;

    const variables = {
      messages: recentMessages,
      temperature: 0.7,
      maxTokens: 2000,
    };

    const requestBody: GraphQLRequest = {
      query,
      variables,
      operationName: "Chat",
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`GraphQL API请求失败: ${response.status}`);
    }

    const result: GraphQLResponse<ChatResult> = await response.json();

    // 检查GraphQL错误
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL错误: ${result.errors[0].message}`);
    }

    // 确保数据存在
    if (!result.data || !result.data.chat || !result.data.chat.choices[0]) {
      throw new Error("GraphQL响应格式不正确");
    }

    return result.data.chat.choices[0].message.content;
  } catch (error) {
    console.error("发送消息失败:", error);
    return "抱歉，发生了错误，无法获取回复。";
  }
};
