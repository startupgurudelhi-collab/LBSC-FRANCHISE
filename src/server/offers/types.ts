export interface OfferServiceMapping {
  service_id: string;
  service_name: string;
  service_code: string;
  category_name?: string | null;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  is_active: number;
  created_by_user_id: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  services: OfferServiceMapping[];
}

export interface CreateOfferInput {
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  service_ids: string[];
}

export interface UpdateOfferInput {
  title?: string;
  description?: string | null;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  service_ids?: string[];
}

export interface OfferFilters {
  service_id?: string;
  search?: string;
  is_active?: boolean | string;
  page?: number;
  limit?: number;
}
