
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractResult, FamilyMember, ChatMessage, Medicine } from "../types";
import { db } from "./db";

// 根据用户需求更新模型
const BASIC_MODEL = 'gemini-3-flash-preview';
const PRO_MODEL = 'gemini-3-pro-preview';

export const geminiService = {
  /**
   * 动态获取所有可用的 API 密钥
   */
  getAvailableKeys(): string[] {
    const keys: string[] = [];
    
    // 1. 获取密钥管理器中的密钥
    const customKeys = db.getApiKeys().filter(k => k.key && k.key.trim() !== '');
    
    // 将活动的排在第一位
    const activeKey = customKeys.find(k => k.isActive);
    if (activeKey) {
      keys.push(activeKey.key.trim());
    }
    
    // 其他备选密钥
    customKeys.filter(k => !k.isActive).forEach(k => {
      keys.push(k.key.trim());
    });
    
    // 2. 系统注入密钥兜底
    if (process.env.API_KEY && !keys.includes(process.env.API_KEY.trim())) {
      keys.push(process.env.API_KEY.trim());
    }
    
    return keys;
  },

  /**
   * 自动重试执行器，支持自动切换额度用尽或无效的密钥
   */
  async withRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    const keys = this.getAvailableKeys();
    
    if (keys.length === 0) {
      throw new Error("未配置 API 密钥。请在“我的 -> AI 密钥”中添加。");
    }

    let lastError: any;
    
    for (let i = 0; i < keys.length; i++) {
      const currentKey = keys[i];
      try {
        const ai = new GoogleGenAI({ apiKey: currentKey });
        return await fn(ai);
      } catch (error: any) {
        lastError = error;
        const msg = error.message || "";
        
        // 429: 额度超限 (Quota Exceeded)
        const shouldRetry = 
          msg.includes("429") || 
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("API_KEY_INVALID") || 
          msg.includes("Failed to fetch") || 
          msg.includes("403") || 
          msg.includes("401");
                           
        if (shouldRetry && i < keys.length - 1) {
          console.warn(`当前密钥 [${i}] 额度不足或无效，正在自动切换至下一个密钥进行重试...`);
          continue;
        }
        
        throw error;
      }
    }
    throw lastError;
  },

  async extractMedicineInfo(base64Image: string, isBarcode: boolean = false): Promise<ExtractResult | null> {
    const medApi = db.getMedicalApiConfig();
    const useMedApi = medApi.isEnabled && medApi.apiKey;
    
    return this.withRetry(async (ai) => {
      let prompt = "";
      let modelToUse = BASIC_MODEL;
      let tools: any[] = [];

      if (isBarcode) {
        modelToUse = PRO_MODEL;
        tools = [{ googleSearch: {} }];
        prompt = `1. 识别图片中的条形码或二维码数字。
2. 使用 Google Search 检索该条码对应的中国上市药品详细信息。
3. 如果用户配置了专用库 (${medApi.provider})，请优先参考。
4. 提取并输出以下 JSON 数据：
   - name: 药品通用名
   - brand: 品牌或生产商
   - ingredients: 成份
   - character: 性状
   - indications: 适应症
   - specification: 规格（如 0.5g*10片）
   - usage: 用法用量
   - contraindications: 禁忌
   - adverseReactions: 不良反应
   - storage: 储藏要求
   - expiryDate: 有效期（格式 YYYY-MM-DD）
   - category: 分类
   - unit: 最小包装单位
   - precautions: 注意事项
   - barcode: 识别到的条码数字`;
      } else {
        prompt = `识别药品包装文字。提取并输出以下 JSON：name, brand, ingredients(成份), character(性状), indications(适应症), specification(规格), usage(用法用量), contraindications(禁忌), adverseReactions(不良反应), storage(储藏), expiryDate(YYYY-MM-DD), category, unit, precautions。${useMedApi ? `参考专业医药知识库(${medApi.provider})进行对齐。` : ""}`;
      }

      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image.includes(',') ? base64Image.split(',')[1] : base64Image,
              },
            },
            {
              text: prompt
            }
          ]
        },
        config: {
          tools: tools.length > 0 ? tools : undefined,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              brand: { type: Type.STRING },
              ingredients: { type: Type.STRING },
              character: { type: Type.STRING },
              indications: { type: Type.STRING },
              specification: { type: Type.STRING },
              usage: { type: Type.STRING },
              contraindications: { type: Type.STRING },
              adverseReactions: { type: Type.STRING },
              storage: { type: Type.STRING },
              expiryDate: { type: Type.STRING },
              category: { type: Type.STRING },
              unit: { type: Type.STRING },
              precautions: { type: Type.STRING },
              barcode: { type: Type.STRING },
            },
            required: ["name"]
          }
        }
      });
      
      const text = response.text;
      if (!text) return null;

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : text;
        return JSON.parse(jsonStr);
      } catch (e) {
        console.error("JSON 解析失败:", e, text);
        return null;
      }
    });
  },

  async askAssistant(
    inventoryContext: string, 
    profiles: FamilyMember[], 
    history: ChatMessage[],
    selectedMedicines: Medicine[] = [],
    imageB64?: string,
    modelName: string = PRO_MODEL
  ): Promise<string> {
    try {
      return await this.withRetry(async (ai) => {
        const geminiHistory = history.slice(-6).map(msg => ({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));

        const chat = ai.chats.create({
          model: modelName,
          history: geminiHistory.slice(0, -1),
          config: {
            systemInstruction: `你是一个专业的家庭医疗助手。当前家庭药箱中有以下药品：${inventoryContext}。在回复时，请结合现有库存给出建议，但要明确告知你不是医生，严重情况请及时就医。回复需专业、简洁、温暖。使用 Markdown 格式让排版清晰。`,
          }
        });

        const lastMsg = history[history.length - 1];
        const parts: any[] = [{ text: lastMsg.text }];

        if (imageB64) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageB64.includes(',') ? imageB64.split(',')[1] : imageB64
            }
          });
        }

        const result = await chat.sendMessage({ message: { parts } });
        return result.text || "AI 未能生成有效回复。";
      });
    } catch (error: any) {
      return `❌ 请求出错: ${error.message || '未知错误'}`;
    }
  }
};
