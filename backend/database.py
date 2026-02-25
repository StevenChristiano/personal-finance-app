from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, LargeBinary, Boolean, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from dotenv import load_dotenv
from datetime import datetime
import os

# ============================================================
# LOAD ENV
# ============================================================
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# ============================================================
# ENGINE & SESSION
# ============================================================
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ============================================================
# TABEL DEFINITIONS
# ============================================================

class Category(Base):
    """Tabel categories — master data kategori transaksi"""
    __tablename__ = "categories"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, unique=True, nullable=False)
    is_excluded = Column(Boolean, default=False)  # True = tidak di-detect anomaly

    # Relasi ke transactions
    transactions = relationship("Transaction", back_populates="category_ref")


class User(Base):
    """Tabel users — menyimpan data user"""
    __tablename__ = "users"

    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String, unique=True, index=True, nullable=False)
    name                = Column(String, nullable=False)
    hashed_password     = Column(String, nullable=False)
    created_at          = Column(DateTime, default=datetime.utcnow)

    # User-configured anomaly thresholds (stored as decimals, e.g. 0.50)
    warning_threshold   = Column(Float, default=0.50, nullable=False)
    anomaly_threshold   = Column(Float, default=0.60, nullable=False)

    # Relasi ke transactions dan user_models
    transactions = relationship("Transaction", back_populates="user")
    model        = relationship("UserModel", back_populates="user", uselist=False)


class Transaction(Base):
    """Tabel transactions — menyimpan semua transaksi user"""
    __tablename__ = "transactions"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id     = Column(Integer, ForeignKey("categories.id"), nullable=False)
    amount          = Column(Float, nullable=False)
    note            = Column(Text, nullable=True)
    timestamp       = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Hasil anomaly detection
    anomaly_score   = Column(Float, nullable=True)
    anomaly_status  = Column(String, nullable=True)   # normal / warning / anomaly
    is_excluded     = Column(Boolean, default=False)  # True jika kategori excluded

    created_at      = Column(DateTime, default=datetime.utcnow)

    # Relasi
    user         = relationship("User", back_populates="transactions")
    category_ref = relationship("Category", back_populates="transactions")


class UserModel(Base):
    """Tabel user_models — menyimpan model Isolation Forest per user sebagai blob"""
    __tablename__ = "user_models"

    id                  = Column(Integer, primary_key=True, index=True)
    user_id             = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # Model tersimpan sebagai binary blob
    model_blob          = Column(LargeBinary, nullable=True)
    scaler_blob         = Column(LargeBinary, nullable=True)
    encoder_blob        = Column(LargeBinary, nullable=True)
    norm_params_blob    = Column(LargeBinary, nullable=True)

    # Status training
    transaction_count   = Column(Integer, default=0)
    is_trained          = Column(Boolean, default=False)
    last_trained        = Column(DateTime, nullable=True)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relasi
    user = relationship("User", back_populates="model")


# ============================================================
# SEED DATA — kategori default
# ============================================================
DEFAULT_CATEGORIES = [
    # Kategori yang masuk anomaly detection
    {"name": "Food",             "is_excluded": False},
    {"name": "Transport",        "is_excluded": False},
    {"name": "Lifestyle",        "is_excluded": False},
    {"name": "Entertainment",    "is_excluded": False},
    {"name": "Utilities",        "is_excluded": False},
    {"name": "Telecommunication","is_excluded": False},
    {"name": "Subscription",     "is_excluded": False},
    # Kategori excluded dari anomaly detection
    {"name": "Health",           "is_excluded": True},
    {"name": "Education",        "is_excluded": True},
    {"name": "Big Expense",      "is_excluded": True},
]


# ============================================================
# HELPER: Get DB Session
# ============================================================
def get_db():
    """Dependency untuk FastAPI — inject DB session ke endpoint"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# INIT DB — buat tabel + seed kategori
# ============================================================
def init_db():
    """Buat semua tabel dan seed data kategori"""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created!")

    # Migrate existing databases: add threshold columns to users if missing
    with engine.connect() as conn:
        for col, default in [("warning_threshold", 0.50), ("anomaly_threshold", 0.60)]:
            try:
                conn.execute(
                    __import__("sqlalchemy").text(
                        f"ALTER TABLE users ADD COLUMN {col} REAL NOT NULL DEFAULT {default}"
                    )
                )
                conn.commit()
                print(f"✅ Migration: added users.{col}")
            except Exception:
                pass  # Column already exists — safe to skip

    # Seed kategori default
    db = SessionLocal()
    try:
        existing = db.query(Category).count()
        if existing == 0:
            for cat in DEFAULT_CATEGORIES:
                db.add(Category(**cat))
            db.commit()
            print(f"✅ {len(DEFAULT_CATEGORIES)} kategori berhasil di-seed!")
        else:
            print(f"ℹ️  Kategori sudah ada ({existing} kategori), skip seeding.")
    finally:
        db.close()



if __name__ == "__main__":
    init_db()