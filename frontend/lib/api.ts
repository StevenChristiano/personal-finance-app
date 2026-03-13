import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ============================================================
// AXIOS INSTANCE
// ============================================================
const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token otomatis ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect ke login kalau token expired
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ============================================================
// TYPES
// ============================================================
export interface User {
  user_id: number;
  name: string;
  access_token: string;
}

export interface Category {
  id: number;
  name: string;
  is_excluded: boolean;
}

export interface Transaction {
  id: number;
  amount: number;
  category_id: number;
  category_name: string;
  note?: string;
  timestamp: string;
  anomaly_score?: number;
  anomaly_status?: "normal" | "warning" | "anomaly";
  is_excluded: boolean;
}

export interface TransactionCreate {
  amount: number;
  category_id: number;
  note?: string;
  timestamp?: string;
}

export interface Stats {
  total_transactions: number;
  total_amount: number;
  average_amount: number;
  by_category: Record<string, { total: number; count: number; anomaly_count: number }>;
  anomaly_count: number;
}

export interface ColdStartStatus {
  is_ready: boolean;
  total_transactions: number;
  min_global: number;
  min_personal: number;
  progress_global: number;
  progress_personal: number;
  category_status: Record<string, { count: number; min_required: number; is_ready: boolean }>;
}

export interface PreviewRow {
  _row: number;
  timestamp: string;
  amount: number;
  category_name: string;
  category_id: number | null;
  note: string | null;
  anomaly_score: number | null;
  anomaly_status: "normal" | "warning" | "anomaly" | null;
  is_excluded: boolean;
  errors: string[];
}

export interface BulkUploadPreview {
  rows: PreviewRow[];
  total: number;
}

export interface BulkTransactionItem {
  amount: number;
  category_id: number;
  note?: string;
  timestamp?: string;
}

export type Income = {
    id          : number;
    amount      : number;
    source      : string;
    date        : string;
    is_recurring: boolean;
};
 
export type Balance = {
    total_balance  : number;
    monthly_balance: number;
    total_income   : number;
    total_expense  : number;
    monthly_income : number;
    monthly_expense: number;
    month          : number;
    year           : number;
};
 
// ============================================================
// AUTH
// ============================================================
export const authApi = {
  register: (email: string, name: string, password: string) =>
    api.post("/auth/register", { email, name, password }),

  login: async (email: string, password: string): Promise<User> => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const res = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.data;
  },
};

// ============================================================
// CATEGORIES
// ============================================================
export const categoryApi = {
  getAll: async (): Promise<Category[]> => {
    const res = await api.get("/categories");
    return res.data;
  },
};

function getThresholds() {
  if (typeof window === "undefined") return { warning: 0.50, anomaly: 0.60 };
  const warning = parseInt(localStorage.getItem("threshold_warning") || "50") / 100;
  const anomaly = parseInt(localStorage.getItem("threshold_anomaly") || "60") / 100;
  return { warning, anomaly };
}

// ============================================================
// SETTINGS
// ============================================================
export const settingsApi = {
  get: async () => {
    const res = await api.get("/settings");
    return res.data as { warning_threshold: number; anomaly_threshold: number };
  },
  update: async (data: { warning_threshold: number; anomaly_threshold: number }) => {
    const res = await api.put("/settings", data);
    return res.data as { warning_threshold: number; anomaly_threshold: number };
  },
};

/** Sync localStorage cache from a /settings API response */
export function syncThresholdCache(data: { warning_threshold: number; anomaly_threshold: number }) {
  if (typeof window === "undefined") return;
  localStorage.setItem("threshold_warning", String(Math.round(data.warning_threshold * 100)));
  localStorage.setItem("threshold_anomaly", String(Math.round(data.anomaly_threshold * 100)));
}

// ============================================================
// TRANSACTIONS
// ============================================================
export const transactionApi = {
  create: async (data: TransactionCreate) => {
    // Server reads thresholds from the user's DB row — no need to send as params
    const res = await api.post("/transactions", data);
    return res.data;
  },

  getAll: async (month?: number, year?: number) => {
    const { warning, anomaly } = getThresholds();
    const params: Record<string, number> = {
      warning_threshold: warning,
      anomaly_threshold: anomaly,
    };
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await api.get("/transactions", { params });
    return res.data as Transaction[];
  },

  delete: async (id: number) => {
    const res = await api.delete(`/transactions/${id}`);
    return res.data;
  },

  downloadTemplate: async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/transactions/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to download template");
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "transaction_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  },

  uploadPreview: async (file: File): Promise<BulkUploadPreview> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/transactions/upload-preview", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data as BulkUploadPreview;
  },

  bulkSave: async (transactions: BulkTransactionItem[]) => {
    const res = await api.post("/transactions/bulk-save", { transactions });
    return res.data as { saved: number; message: string };
  },
};

// ============================================================
// INCOME
// ============================================================

export const incomeApi = {
    getAll: async (month?: number, year?: number): Promise<Income[]> => {
        const params = month && year ? `?month=${month}&year=${year}` : "";
        const res = await api.get(`/income${params}`);
        return res.data;
    },
 
    create: async (data: {
        amount      : number;
        source      : string;
        date        : string;
        is_recurring: boolean;
    }): Promise<Income> => {
        const res = await api.post("/income", data);
        return res.data;
    },
 
    delete: async (id: number): Promise<void> => {
        await api.delete(`/income/${id}`);
    },
 
    getBalance: async (month?: number, year?: number): Promise<Balance> => {
        const params = month && year ? `?month=${month}&year=${year}` : "";
        const res = await api.get(`/balance${params}`);
        return res.data;
    },
};

// ============================================================
// STATS
// ============================================================
export const statsApi = {
  get: async (month?: number, year?: number): Promise<Stats> => {
    const { warning, anomaly } = getThresholds();
    const params: Record<string, number> = {
      warning_threshold: warning,
      anomaly_threshold: anomaly,
    };
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await api.get("/stats", { params });
    return res.data;
  },

  getMonthly: async (months: number = 6) => {
    const { warning, anomaly } = getThresholds();
    const res = await api.get("/stats/monthly", {
      params: {
        months,
        warning_threshold: warning,
        anomaly_threshold: anomaly,
      },
    });
    return res.data as {
      month: number;
      year: number;
      label: string;
      total_amount: number;
      transaction_count: number;
      anomaly_count: number;
    }[];
  },
};

// ============================================================
// COLD START & MODEL
// ============================================================
export const modelApi = {
  coldStartStatus: async (): Promise<ColdStartStatus> => {
    const res = await api.get("/cold-start-status");
    return res.data;
  },
  
  retrain: async () => {
    const res = await api.post("/retrain");
    return res.data;
  },

  modelStatus: async () => {
    const res = await api.get("/model-status");
    return res.data;
  },
};

export default api;