from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db
from routers import auth, settings, transactions, stats, income, balance, export

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="Personal Finance Anomaly Detection API",
    description="Backend API for anomaly detection using Isolation Forest",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://spendit.vercel.app"  # nanti diupdate setelah dapat URL Vercel
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Personal Finance API", "status": "running"}

app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(transactions.router)
app.include_router(stats.router)
app.include_router(income.router)
app.include_router(balance.router)
app.include_router(export.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)