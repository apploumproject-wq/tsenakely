export type UserRole = 'ADMIN' | 'VENDEUR';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  product_type: 'FINISHED' | 'HOMEMADE';
  has_active_production?: number | boolean;
  name: string;
  price: number;
  stock_qty: number;
  min_stock: number;
  image_data_url?: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

export type SaleStatus = 'COMPLETED' | 'CANCELLED';

export interface Sale {
  id: number;
  sale_number: string;
  sale_date: string;
  user_id: number;
  user_name: string;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  status: SaleStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  items_count?: number;
}

export interface SaleDetail {
  id: number;
  sale_id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  stock_units?: number;
}

export interface SaleWithDetails extends Sale {
  details: SaleDetail[];
}

export type StockMovementType =
  | 'INITIAL'
  | 'RESTOCK'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'CANCEL_RESTORE';

export interface StockMovement {
  id: number;
  product_id: number | null;
  product_name: string;
  movement_type: StockMovementType;
  qty_change: number;
  qty_before: number;
  qty_after: number;
  reason: string;
  user_name: string;
  created_at: string;
}

export type PrinterConnectionMode = 'BLUETOOTH' | 'USB' | 'SYSTEM';
export type PrinterPaperWidth = '58' | '80';

export interface AppSettings {
  shop_name: string;
  currency: string;
  shop_phone: string;
  shop_address: string;
  shop_logo_data_url: string;
  receipt_footer: string;
  low_stock_alert_enabled: boolean;
  printer_connection_mode: PrinterConnectionMode;
  printer_paper_width: PrinterPaperWidth;
  printer_device_name: string;
  printer_auto_print_sale: boolean;
}

export type ExportPeriod =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: { name: string; price: number; portions: number };
}

export interface DailySalesPoint {
  date: string;
  label: string;
  revenue: number;
  count: number;
}

export interface TopProductStat {
  product_id: number | null;
  product_name: string;
  total_qty: number;
  total_revenue: number;
  share_percent: number;
}

export interface DashboardSummary {
  todayRevenue: number;
  todaySalesCount: number;
  totalProducts: number;
  totalStockUnits: number;
  outOfStockCount: number;
  lowStockCount: number;
  recentSales: SaleWithDetails[];
  topProducts: TopProductStat[];
  last7Days: DailySalesPoint[];
  alertProducts: Product[];
}

export interface StatisticsSummary {
  totalRevenue: number;
  salesCount: number;
  totalItemsSold: number;
  averageBasket: number;
  topProducts: TopProductStat[];
  leastSoldProducts: TopProductStat[];
  revenueSeries: DailySalesPoint[];
}

export type StatsPeriod =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export type NavTab = 'accueil' | 'vente' | 'produits' | 'historique' | 'statistiques' | 'parametres';


export interface ProductionIngredientInput {
  name: string;
  purchase_quantity: number;
  purchase_unit: string;
  purchase_price: number;
  used_quantity: number;
  used_unit: string;
}
export interface ProductionIngredient extends ProductionIngredientInput {
  id: number; batch_id: number; used_cost: number;
}
export interface ProductionBatch {
  id: number; product_id: number; product_name: string; produced_at: string;
  closed_at: string | null; total_cost: number; sold_quantity: number | null;
  revenue: number | null; profit: number | null; status: 'ACTIVE' | 'CLOSED';
  ingredients: ProductionIngredient[];
}
