export type MarketingMaterialType =
  | 'flyer'
  | 'brochure'
  | 'social_media'
  | 'banner'
  | 'poster'
  | 'presentation'
  | 'video'
  | 'document'
  | 'other';

export interface MarketingMaterialServiceMapping {
  service_id: string;
  service_name: string;
  service_code: string;
  category_name?: string | null;
}

export interface MarketingMaterial {
  id: string;
  title: string;
  description: string | null;
  material_type: MarketingMaterialType;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  file_url: string | null;
  file_data: string | null;
  is_published: number | boolean;
  is_archived: number | boolean;
  created_by_user_id: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  services: MarketingMaterialServiceMapping[];
}

export interface CreateMarketingMaterialInput {
  title: string;
  description?: string | null;
  material_type: MarketingMaterialType;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_data?: string | null;
  is_published?: boolean;
  service_ids: string[];
}

export interface UpdateMarketingMaterialInput {
  title?: string;
  description?: string | null;
  material_type?: MarketingMaterialType;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_data?: string | null;
  is_published?: boolean;
  is_archived?: boolean;
  service_ids?: string[];
}

export interface MarketingMaterialFilters {
  service_id?: string;
  material_type?: string;
  search?: string;
  is_published?: boolean | string;
  is_archived?: boolean | string;
  page?: number;
  limit?: number;
}
