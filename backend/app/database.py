import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./banco.db")

db = create_engine(DATABASE_URL)

Session = sessionmaker(autocommit=False, autoflush=False, bind=db)

Base = declarative_base()


def get_db():
    session = Session()
    try:
        yield session
    finally:
        session.close()
