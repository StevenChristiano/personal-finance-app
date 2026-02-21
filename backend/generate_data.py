import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# ============================================================
# KONFIGURASI
# ============================================================
TOTAL_NORMAL     = 1000
TOTAL_ANOMALY    = 100
OUTPUT_PATH      = "data/transactions_dummy_2.csv"
RANDOM_SEED      = 42

np.random.seed(RANDOM_SEED)
random.seed(RANDOM_SEED)

# ============================================================
# KATEGORI YANG MASUK ANOMALY MODEL SAJA
# format: "Kategori": (mean_amount, std_amount, [jam_normal], [hari_normal 0=Mon 6=Sun])
# ============================================================
ANOMALY_CATEGORIES = {
    "Food"             : (35_000,  20_000,  [6, 7, 8, 11, 12, 13, 17, 18, 19], list(range(7))),
    "Transport"        : (20_000,  10_000,  [6, 7, 8, 12, 17, 18, 19],         [0, 1, 2, 3, 4]),      # weekday
    "Lifestyle"        : (120_000, 80_000,  [10, 11, 13, 14, 15, 16, 19, 20],  [5, 6, 0, 1, 2, 3, 4]),# semua hari
    "Entertainment"    : (75_000,  50_000,  [10, 11, 13, 14, 19, 20, 21],      [4, 5, 6]),             # Jumat-Minggu
    "Utilities"        : (250_000, 100_000, [8, 9, 10, 11, 13, 14],            [0, 1, 2, 3, 4]),      # weekday
    "Telecommunication": (50_000,  30_000,  [8, 9, 10, 12, 19, 20],            list(range(7))),
    "Subscription"     : (60_000,  30_000,  [8, 9, 10, 19, 20, 21],            list(range(7))),
}

# ============================================================
# GENERATE DATA NORMAL
# ============================================================
def generate_normal():
    records = []
    start_date = datetime(2024, 1, 1)
    for _ in range(TOTAL_NORMAL):
        category = random.choice(list(ANOMALY_CATEGORIES.keys()))
        mean, std, hours, days = ANOMALY_CATEGORIES[category]
        amount     = max(1000, np.random.normal(mean, std))
        hour       = random.choice(hours)
        day_of_week = random.choice(days)
        # Cari tanggal yang sesuai day_of_week
        day_offset = random.randint(0, 12) * 7 + (day_of_week - datetime(2024, 1, 1).weekday()) % 7
        timestamp  = start_date + timedelta(days=day_offset, hours=hour, minutes=random.randint(0, 59))
        records.append({
            "timestamp"   : timestamp,
            "amount"      : round(amount, -2),
            "category"    : category,
            "is_anomaly"  : 0,
            "note"        : "normal"
        })
    return records

# ============================================================
# GENERATE DATA ANOMALI
# ============================================================
def generate_anomaly():
    records = []
    start_date = datetime(2024, 1, 1)
    anomaly_types = [
        # Amount spike — jam & hari normal tapi amount ekstrem
        {"category": "Food",             "amount": random.uniform(300_000,   800_000),   "hour": random.choice([11, 12, 18]), "day": random.choice(list(range(7)))},
        {"category": "Transport",        "amount": random.uniform(200_000,   500_000),   "hour": random.choice([7, 8, 17]),   "day": random.choice([0,1,2,3,4])},
        {"category": "Lifestyle",        "amount": random.uniform(800_000,   2_000_000), "hour": random.choice([13, 14, 15]), "day": random.choice([5,6])},
        {"category": "Entertainment",    "amount": random.uniform(500_000,   1_500_000), "hour": random.choice([19, 20, 21]), "day": random.choice([4,5,6])},
        {"category": "Utilities",        "amount": random.uniform(1_000_000, 3_000_000), "hour": random.choice([9, 10]),      "day": random.choice([0,1,2,3,4])},
        {"category": "Telecommunication","amount": random.uniform(300_000,   800_000),   "hour": random.choice([9, 10]),      "day": random.choice(list(range(7)))},
        {"category": "Subscription",     "amount": random.uniform(400_000,   1_000_000), "hour": random.choice([19, 20]),     "day": random.choice(list(range(7)))},
        # Odd hour — jam tidak wajar (dini hari)
        {"category": "Food",             "amount": random.uniform(20_000,  60_000),    "hour": random.choice([0, 1, 2, 3]), "day": random.choice(list(range(7)))},
        {"category": "Transport",        "amount": random.uniform(10_000,  30_000),    "hour": random.choice([0, 1, 2, 3]), "day": random.choice(list(range(7)))},
        {"category": "Lifestyle",        "amount": random.uniform(80_000,  200_000),   "hour": random.choice([0, 1, 2, 3]), "day": random.choice(list(range(7)))},
        {"category": "Entertainment",    "amount": random.uniform(50_000,  150_000),   "hour": random.choice([0, 1, 2, 3]), "day": random.choice([0,1,2])},  # dini hari weekday
        # Kombinasi amount spike + odd hour
        {"category": "Entertainment",    "amount": random.uniform(800_000, 2_000_000), "hour": random.choice([0, 1, 2, 3]), "day": random.choice(list(range(7)))},
        {"category": "Food",             "amount": random.uniform(500_000, 1_000_000), "hour": random.choice([0, 1, 2, 3]), "day": random.choice(list(range(7)))},
    ]
    for _ in range(TOTAL_ANOMALY):
        atype    = random.choice(anomaly_types)
        category = atype["category"]
        amount   = round(atype["amount"], -2)
        hour     = int(atype["hour"])
        day      = int(atype["day"])

        normal_mean  = ANOMALY_CATEGORIES[category][0]
        normal_hours = ANOMALY_CATEGORIES[category][2]
        normal_days  = ANOMALY_CATEGORIES[category][3]
        is_spike     = amount > normal_mean * 3
        is_odd_hour  = hour not in normal_hours
        is_odd_day   = day not in normal_days

        if is_spike and (is_odd_hour or is_odd_day):
            note = "amount_spike+odd_hour"
        elif is_spike:
            note = "amount_spike"
        elif is_odd_hour or is_odd_day:
            note = "odd_hour"
        else:
            note = "normal"

        day_offset = random.randint(0, 12) * 7 + (day - datetime(2024, 1, 1).weekday()) % 7
        timestamp  = start_date + timedelta(days=day_offset, hours=hour, minutes=random.randint(0, 59))
        records.append({
            "timestamp"  : timestamp,
            "amount"     : amount,
            "category"   : category,
            "is_anomaly" : 1,
            "note"       : note
        })
    return records

# ============================================================
# MAIN
# ============================================================
def main():
    print("Generating dummy transaction data...")
    all_data = generate_normal() + generate_anomaly()
    random.shuffle(all_data)
    df = pd.DataFrame(all_data)
    df = df.sort_values("timestamp").reset_index(drop=True)
    df.index = df.index + 1
    df.index.name = "transaction_id"
    os.makedirs("data", exist_ok=True)
    df.to_csv(OUTPUT_PATH)
    print(f"\n✅ Selesai!")
    print(f"   Total transaksi : {len(df)}")
    print(f"   Normal          : {len(df[df['is_anomaly'] == 0])}")
    print(f"   Anomali         : {len(df[df['is_anomaly'] == 1])}")
    print(f"\n   Distribusi kategori:")
    print(df['category'].value_counts().to_string())
    print(f"\n   Distribusi note anomali:")
    print(df[df['is_anomaly']==1]['note'].value_counts().to_string())
    print(f"\n📁 Disimpan ke: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()