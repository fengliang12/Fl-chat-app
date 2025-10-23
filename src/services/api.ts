import { Message } from "../types";

// GraphQL API相关类型定义
interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

// 以太坊RPC错误类型
interface EthCallError {
  code?: number;
  message: string;
  data?: any;
}

// 处理eth_call execution reverted错误的辅助函数
export const handleEthCallError = (error: any): string => {
  const errorMessage = error?.message || error?.toString() || "";
  
  // 检查是否是execution reverted错误
  if (errorMessage.includes("execution reverted")) {
    // 提供更友好的错误信息
    if (errorMessage.includes("symbol") || errorMessage.includes("0x95d89b41")) {
      return "无法获取代币符号：合约可能不是标准ERC20代币或合约不存在";
    }
    if (errorMessage.includes("decimals") || errorMessage.includes("0x313ce567")) {
      return "无法获取代币精度：合约可能不是标准ERC20代币或合约不存在";
    }
    return "合约调用失败：合约执行被回退，可能是合约不存在、函数不支持或条件检查失败";
  }
  
  // 其他常见的eth_call错误
  if (errorMessage.includes("insufficient funds")) {
    return "余额不足";
  }
  if (errorMessage.includes("gas required exceeds allowance")) {
    return "Gas限制不足";
  }
  if (errorMessage.includes("invalid address")) {
    return "无效的合约地址";
  }
  
  return `RPC调用失败: ${errorMessage}`;
}

// 带重试的eth_call包装函数
export const safeEthCall = async <T>(
  callFunction: () => Promise<T>,
  maxRetries: number = 3,
  fallbackValue?: T
): Promise<T | undefined> => {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callFunction();
    } catch (error) {
      lastError = error;
      console.warn(`eth_call尝试 ${i + 1}/${maxRetries} 失败:`, handleEthCallError(error));
      
      // 如果是execution reverted错误，不需要重试
      if (error?.message?.includes("execution reverted")) {
        break;
      }
      
      // 等待后重试（指数退避）
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
  
  // 所有重试都失败，返回fallback值或抛出错误
  if (fallbackValue !== undefined) {
    console.error("eth_call最终失败，使用fallback值:", handleEthCallError(lastError));
    return fallbackValue;
  }
  
  console.error("eth_call最终失败:", handleEthCallError(lastError));
  return undefined;
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
