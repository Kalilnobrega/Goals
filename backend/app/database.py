from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

db = create_engine('sqlite:///./banco.db')

Session = sessionmaker(autocommit=False, autoflush=False, bind=db)

Base = declarative_base()

def get_db():
    session = Session()
    try:
        yield session
    finally:
        session.close()