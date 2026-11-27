import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./banco.db")

POOL_OPTIONS = {} if DATABASE_URL.startswith("sqlite") else {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
}

db = create_engine(DATABASE_URL, **POOL_OPTIONS)

Session = sessionmaker(autocommit=False, autoflush=False, bind=db)

Base = declarative_base()


def get_db():
    session = Session()
    try:
        yield session
    finally:
        session.close()
