from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, LargeBinary, Boolean, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from dotenv import load_dotenv
from datetime import datetime
import os

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Category(Base):
    __tablename__ = "categories"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, unique=True, nullable=False)
    is_excluded = Column(Boolean, default=False)
    transactions = relationship("Transaction", back_populates="category_ref")

class User(Base):
    __tablename__ = "users"
    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String, unique=True, index=True, nullable=False)
    name                = Column(String, nullable=False)
    hashed_password     = Column(String, nullable=False)
    created_at          = Column(DateTime, default=datetime.utcnow)
    warning_threshold   = Column(Float, default=0.50, nullable=False)
    anomaly_threshold   = Column(Float, default=0.60, nullable=False)
    transactions = relationship("Transaction", back_populates="user")
    model        = relationship("UserModel", back_populates="user", uselist=False)
    incomes      = relationship("Income", back_populates="user")

class Transaction(Base):
    __tablename__ = "transactions"
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id     = Column(Integer, ForeignKey("categories.id"), nullable=False)
    amount          = Column(Float, nullable=False)
    note            = Column(Text, nullable=True)
    timestamp       = Column(DateTime, nullable=False, default=datetime.utcnow)
    anomaly_score   = Column(Float, nullable=True)
    anomaly_status  = Column(String, nullable=True)
    is_excluded     = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
    user         = relationship("User", back_populates="transactions")
    category_ref = relationship("Category", back_populates="transactions")

class Income(Base):
    """Tabel incomes — menyimpan pemasukan user"""
    __tablename__ = "incomes"
    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount               = Column(Float, nullable=False)
    source               = Column(String, nullable=False)
    date                 = Column(DateTime, nullable=False)
    is_recurring         = Column(Boolean, default=False)
    is_auto_generated    = Column(Boolean, default=False)   # True = dibuat oleh _ensure_recurring
    is_manually_deleted  = Column(Boolean, default=False)
    recurring_stopped_at = Column(DateTime, nullable=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="incomes")

class UserModel(Base):
    __tablename__ = "user_models"
    id                  = Column(Integer, primary_key=True, index=True)
    user_id             = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    model_blob          = Column(LargeBinary, nullable=True)
    scaler_blob         = Column(LargeBinary, nullable=True)
    encoder_blob        = Column(LargeBinary, nullable=True)
    norm_params_blob    = Column(LargeBinary, nullable=True)
    transaction_count   = Column(Integer, default=0)
    is_trained          = Column(Boolean, default=False)
    last_trained        = Column(DateTime, nullable=True)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="model")

DEFAULT_CATEGORIES = [
    {"name": "Food",             "is_excluded": False},
    {"name": "Transport",        "is_excluded": False},
    {"name": "Lifestyle",        "is_excluded": False},
    {"name": "Entertainment",    "is_excluded": False},
    {"name": "Utilities",        "is_excluded": False},
    {"name": "Telecommunication","is_excluded": False},
    {"name": "Subscription",     "is_excluded": False},
    {"name": "Health",           "is_excluded": True},
    {"name": "Education",        "is_excluded": True},
    {"name": "Big Expense",      "is_excluded": True},
]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created!")

    with engine.connect() as conn:
        # Migrate threshold columns
        for col, default in [("warning_threshold", 0.50), ("anomaly_threshold", 0.60)]:
            try:
                conn.execute(__import__("sqlalchemy").text(
                    f"ALTER TABLE users ADD COLUMN {col} REAL NOT NULL DEFAULT {default}"
                ))
                conn.commit()
                print(f"✅ Migration: added users.{col}")
            except Exception:
                pass

        # Migrate incomes columns (PostgreSQL + SQLite compatible)
        income_migrations = [
            ("is_manually_deleted",  "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("is_auto_generated",    "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("recurring_stopped_at", "TIMESTAMP"),
        ]
        for col, typedef in income_migrations:
            try:
                # PostgreSQL supports IF NOT EXISTS
                conn.execute(__import__("sqlalchemy").text(
                    f"ALTER TABLE incomes ADD COLUMN IF NOT EXISTS {col} {typedef}"
                ))
                conn.commit()
                print(f"✅ Migration: added incomes.{col}")
            except Exception:
                try:
                    # SQLite fallback (no IF NOT EXISTS support)
                    conn.execute(__import__("sqlalchemy").text(
                        f"ALTER TABLE incomes ADD COLUMN {col} {typedef}"
                    ))
                    conn.commit()
                    print(f"✅ Migration: added incomes.{col}")
                except Exception:
                    pass  # column already exists

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

def migrate_db():
    """Jalankan manual: python database.py migrate"""
    from sqlalchemy import text, inspect
    inspector = inspect(engine)

    # Cek kolom yang sudah ada di tabel incomes
    existing_cols = {col["name"] for col in inspector.get_columns("incomes")}
    print(f"Existing columns: {existing_cols}")

    migrations = [
        ("is_manually_deleted",  "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_auto_generated",    "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("recurring_stopped_at", "TIMESTAMP"),
    ]

    with engine.connect() as conn:
        for col, typedef in migrations:
            if col in existing_cols:
                print(f"⏭  Skip: incomes.{col} already exists")
                continue
            try:
                conn.execute(text(f"ALTER TABLE incomes ADD COLUMN {col} {typedef}"))
                conn.commit()
                print(f"✅ Added: incomes.{col}")
            except Exception as e:
                print(f"❌ Failed: incomes.{col} — {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "migrate":
        migrate_db()
    else:
        init_db()