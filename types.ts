
export interface CustomField {
  label: string;
  value: string;
}

export interface Medicine {
  id: string;
  name: string;
  brand?: string;
  ingredients?: string;    // 成份
  character?: string;      // 性状
  indications?: string;    // 适应症
  specification?: string;  // 规格
  usage: string;           // 用法用量
  contraindications?: string; // 禁忌
  adverseReactions?: string;  // 不良反应
  storage?: string;        // 储藏
  content: string;
  manufactureDate: string;
  shelfLife: string;
  expiryDate: string;
  precautions: string;
  photoUrl?: string;
  category: MedicineCategory;
  subcategory?: string;
  stock: number;
  unit: string;
  addedAt: number;
  customFields?: CustomField[]; // 自定义信息类别
}

export enum MedicineCategory {
  RESPIRATORY = '感冒/呼吸道',
  PAIN_FEVER = '止痛/退烧',
  DIGESTION = '胃肠/消化',
  ALLERGY = '抗过敏',
  CHRONIC = '慢性病用药',
  EXTERNAL = '外用/皮肤',
  SUPPLEMENTS = '维矿/补剂',
  OTHER = '其他'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  age: number | '';
  gender: 'male' | 'female' | 'other' | '';
  bloodType: string;
  allergies: string;
  contraindications: string;
  medicalHistory: string;
}

export type MedicationFrequency = 'once' | 'daily' | 'interval';

export interface MedicationPlan {
  id: string;
  memberId: string;
  medicineId: string;
  medicineName: string;
  time: string; // HH:mm
  dosageAmount: number;
  dosageUnit: string;
  frequency: MedicationFrequency;
  intervalHours?: number; // Only for 'interval'
  isActive: boolean;
  lastTakenTimestamp?: number;
}

export interface MedicationHistory {
  id: string;
  planId: string;
  memberId: string;
  memberName: string;
  medicineId: string;
  medicineName: string;
  dosageAmount: number;
  dosageUnit: string;
  timestamp: number;
  note?: string;
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  isVisible?: boolean;
}

export interface MedicalApiConfig {
  endpoint: string;
  apiKey: string;
  isEnabled: boolean;
  provider: 'aliyun' | 'tencent' | 'custom' | 'default';
}

export interface ExtractResult {
  name: string;
  brand?: string;
  ingredients?: string;
  character?: string;
  indications?: string;
  specification?: string;
  usage?: string;
  contraindications?: string;
  adverseReactions?: string;
  storage?: string;
  content?: string;
  expiryDate: string;
  category?: MedicineCategory;
  barcode?: string;
  precautions?: string;
  unit?: string;
}
